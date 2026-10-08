"""Playlists: manual CRUD, track management, smart rules, M3U export/import, AI mixes."""
import json
import re
from pathlib import Path as FSPath

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from ..deps import get_current_user, get_db
from ..models import Playlist, PlaylistTrack, Track, User
from ..schemas import (
    MessageOut,
    PlaylistCreate,
    PlaylistOut,
    PlaylistTracksIn,
    PlaylistUpdate,
    TrackOrderIn,
    TrackOut,
)
from ..services.smart_rules import parse_rules, smart_playlist_tracks

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


def _track_count(db: DbSession, playlist: Playlist) -> int:
    if playlist.kind in ("smart", "ai") and playlist.rules:
        return len(smart_playlist_tracks(db, playlist))
    return (
        db.query(func.count(PlaylistTrack.id))
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .scalar()
        or 0
    )


def _playlist_out(db: DbSession, playlist: Playlist) -> PlaylistOut:
    rules = None
    if playlist.rules:
        try:
            rules = json.loads(playlist.rules)
        except json.JSONDecodeError:
            rules = None
    return PlaylistOut(
        id=playlist.id,
        name=playlist.name,
        description=playlist.description or "",
        kind=playlist.kind,
        rules=rules,
        owner_id=playlist.owner_id,
        track_count=_track_count(db, playlist),
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
    )


def _get_owned(db: DbSession, playlist_id: int, user: User) -> Playlist:
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if playlist.owner_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not your playlist")
    return playlist


# --- AI playlist generation (spec stories #25/#26/#28) -----------------------
class AiGenerateIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    name: str | None = Field(default=None, max_length=256)
    limit: int = Field(default=20, ge=3, le=50)


def _extract_json(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    brace = re.search(r"\{.*\}", text, re.DOTALL)
    if brace:
        text = brace.group(0)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


_STOPWORDS = {
    "a", "an", "the", "of", "for", "to", "and", "with", "some", "me", "my",
    "play", "songs", "song", "tracks", "track", "music", "make", "please",
    "playlist", "mix", "like", "get", "want", "give", "something", "kind",
}


def _keyword_fallback(candidates: list[dict], description: str, limit: int) -> list[int]:
    """Deterministic keyword scoring when the model gives nothing usable."""
    tokens = [
        t for t in re.findall(r"[\w']+", description.lower())
        if len(t) > 2 and t not in _STOPWORDS
    ]
    scored: list[tuple[int, int]] = []
    for cand in candidates:
        haystack = " ".join(
            str(cand.get(k) or "") for k in ("title", "artist", "album", "genre")
        ).lower()
        score = sum(
            (3 if tok in str(cand.get("genre") or "").lower() else 0)
            + (2 if tok in str(cand.get("artist") or "").lower() else 0)
            + (1 if tok in haystack else 0)
            for tok in tokens
        )
        scored.append((score, cand["id"]))
    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    picked = [cid for score, cid in scored[:limit] if score > 0]
    if not picked:  # nothing matched — fall back to most played
        picked = [c["id"] for c in candidates[:limit]]
    return picked


@router.post("/ai/generate", response_model=PlaylistOut, status_code=201)
def generate_ai_playlist(
    payload: AiGenerateIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Build a playlist from a natural-language description via the local LLM.

    Selection is validated against real library ids; if the model returns
    nothing usable, a keyword-based fallback keeps the feature dependable.
    """
    from ..ai import gateway
    from ..models import Setting

    row = db.query(Setting).filter(Setting.key == "ai").first()
    ai_cfg: dict = {}
    if row and row.value:
        try:
            ai_cfg = json.loads(row.value)
        except json.JSONDecodeError:
            ai_cfg = {}
    if not gateway.check_reachable(ai_cfg, timeout=3.0):
        raise HTTPException(
            status_code=503,
            detail="AI provider unreachable — start Ollama or LM Studio.",
        )

    limit = payload.limit
    candidates_rows = (
        db.query(Track).order_by(Track.play_count.desc(), Track.title.asc()).limit(300).all()
    )
    candidates = [
        {
            "id": t.id,
            "title": t.title,
            "artist": t.artist_name,
            "album": t.album_title,
            "genre": t.genre,
            "year": t.year,
        }
        for t in candidates_rows
    ]
    if not candidates:
        raise HTTPException(status_code=400, detail="Library is empty")

    prompt = (
        "Pick tracks for a playlist from the candidate list (JSON) below.\n"
        f"Request: {payload.description!r}\n"
        f"Return at most {limit} track ids.\n"
        "Reply with ONLY JSON: {\"track_ids\": [ids...], \"rationale\": \"one short sentence\"}\n"
        "Only use ids from the candidate list. Never invent ids.\n\n"
        f"Candidates: {json.dumps(candidates, ensure_ascii=False)}"
    )
    try:
        resp = gateway.chat_once(
            ai_cfg, [{"role": "user", "content": prompt}], tools=None
        )
        data = _extract_json(gateway.extract_text(resp))
    except gateway.ProviderUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    valid_ids = {c["id"] for c in candidates}
    chosen: list[int] = []
    for raw_id in data.get("track_ids") or []:
        try:
            tid = int(raw_id)
        except (TypeError, ValueError):
            continue
        if tid in valid_ids and tid not in chosen:
            chosen.append(tid)
        if len(chosen) >= limit:
            break
    rationale = str(data.get("rationale") or "").strip()
    used_fallback = False
    if not chosen:
        chosen = _keyword_fallback(candidates, payload.description, limit)
        used_fallback = True
        if not rationale:
            rationale = "Keyword-based selection (model returned no usable ids)."

    name = (payload.name or "").strip() or "AI Mix"
    playlist = Playlist(
        name=name,
        description=f"{rationale}" + (" (keyword fallback)" if used_fallback else ""),
        kind="ai",
        rules="",  # materialized rows; rules stay empty so it stays editable
        owner_id=user.id,
    )
    db.add(playlist)
    db.flush()
    for pos, tid in enumerate(chosen):
        db.add(PlaylistTrack(playlist_id=playlist.id, track_id=tid, position=pos))
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.get("", response_model=list[PlaylistOut])
def list_playlists(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Playlist)
        .filter(Playlist.owner_id == user.id)
        .order_by(Playlist.updated_at.desc())
        .all()
    )
    # Bulk-count manual playlist tracks in one query instead of one per playlist.
    manual_ids = [p.id for p in rows if p.kind not in ("smart", "ai")]
    count_map: dict[int, int] = {}
    if manual_ids:
        for pid, cnt in (
            db.query(PlaylistTrack.playlist_id, func.count(PlaylistTrack.id))
            .filter(PlaylistTrack.playlist_id.in_(manual_ids))
            .group_by(PlaylistTrack.playlist_id)
            .all()
        ):
            count_map[pid] = cnt
    result = []
    for p in rows:
        if p.kind in ("smart", "ai") and p.rules:
            track_count = len(smart_playlist_tracks(db, p))
        else:
            track_count = count_map.get(p.id, 0)
        rules = None
        if p.rules:
            try:
                rules = json.loads(p.rules)
            except json.JSONDecodeError:
                pass
        result.append(PlaylistOut(
            id=p.id,
            name=p.name,
            description=p.description or "",
            kind=p.kind,
            rules=rules,
            owner_id=p.owner_id,
            track_count=track_count,
            created_at=p.created_at,
            updated_at=p.updated_at,
        ))
    return result


@router.post("", response_model=PlaylistOut, status_code=201)
def create_playlist(
    payload: PlaylistCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rules_json = ""
    if payload.kind in ("smart", "ai") and payload.rules is not None:
        # Validate the rule tree before persisting.
        rules_json = json.dumps(parse_rules(json.dumps(payload.rules)))
    playlist = Playlist(
        name=payload.name,
        description=payload.description,
        kind=payload.kind,
        rules=rules_json,
        owner_id=user.id,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.post("/import", response_model=PlaylistOut, status_code=201)
async def import_m3u(
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a manual playlist from an uploaded .m3u / .m3u8 file.

    Tracks are matched first by exact path, then by filename, then by EXTINF title+artist.
    Unmatched entries are silently skipped.
    """
    raw = await file.read()
    text = raw.decode("utf-8", errors="replace")

    pl_name = FSPath(file.filename or "import").stem or "Imported"
    extinf_artist: str | None = None
    extinf_title: str | None = None
    track_ids: list[int] = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            rest = line.split(":", 1)[1]
            meta = rest.split(",", 1)[1] if "," in rest else ""
            if " - " in meta:
                extinf_artist, extinf_title = meta.split(" - ", 1)
            else:
                extinf_title = meta.strip() or None
                extinf_artist = None
            continue
        if line.startswith("#"):
            continue

        # Try exact path
        track = db.query(Track).filter(Track.path == line).first()

        if track is None:
            # Filename match (handles path-separator differences)
            basename = FSPath(line).name
            if basename:
                candidates = (
                    db.query(Track).filter(Track.path.like(f"%{basename}")).limit(2).all()
                )
                if len(candidates) == 1:
                    track = candidates[0]

        if track is None and extinf_artist and extinf_title:
            # Title + artist fallback
            track = (
                db.query(Track)
                .filter(
                    func.lower(Track.title) == extinf_title.strip().lower(),
                    func.lower(Track.artist_name) == extinf_artist.strip().lower(),
                )
                .first()
            )

        if track is not None and track.id not in track_ids:
            track_ids.append(track.id)

        extinf_artist = extinf_title = None

    playlist = Playlist(
        name=pl_name,
        description=f"Imported from {file.filename}",
        kind="manual",
        rules="",
        owner_id=user.id,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)

    for pos, tid in enumerate(track_ids):
        db.add(PlaylistTrack(playlist_id=playlist.id, track_id=tid, position=pos))
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.get("/{playlist_id}", response_model=PlaylistOut)
def get_playlist(
    playlist_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _playlist_out(db, _get_owned(db, playlist_id, user))


@router.get("/{playlist_id}/tracks", response_model=list[TrackOut])
def playlist_tracks(
    playlist_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from ..routers.library import _favorite_ids, _tracks_to_out

    playlist = _get_owned(db, playlist_id, user)
    if playlist.kind in ("smart", "ai") and playlist.rules:
        rows = smart_playlist_tracks(db, playlist)
    else:
        rows = (
            db.query(Track)
            .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
            .filter(PlaylistTrack.playlist_id == playlist.id)
            .order_by(PlaylistTrack.position.asc(), PlaylistTrack.added_at.asc())
            .all()
        )
    favs = _favorite_ids(db, user)
    return _tracks_to_out(db, rows, favs)


@router.patch("/{playlist_id}", response_model=PlaylistOut)
def update_playlist(
    playlist_id: int,
    payload: PlaylistUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    if payload.name is not None:
        playlist.name = payload.name
    if payload.description is not None:
        playlist.description = payload.description
    if payload.rules is not None:
        playlist.rules = json.dumps(parse_rules(json.dumps(payload.rules)))
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.delete("/{playlist_id}", response_model=MessageOut)
def delete_playlist(
    playlist_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    db.delete(playlist)
    db.commit()
    return MessageOut(message="playlist deleted")


@router.post("/{playlist_id}/tracks", response_model=PlaylistOut)
def add_tracks(
    playlist_id: int,
    payload: PlaylistTracksIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    if playlist.kind in ("smart", "ai"):
        raise HTTPException(status_code=400, detail="Smart playlists are rule-driven")
    existing = (
        db.query(func.max(PlaylistTrack.position))
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .scalar()
        or -1
    )
    position = payload.position if payload.position is not None else existing + 1
    # Bulk-load tracks and existing playlist entries to avoid per-track queries.
    valid_track_ids = {
        t.id for t in db.query(Track.id).filter(Track.id.in_(payload.track_ids)).all()
    }
    already_in = {
        r.track_id
        for r in db.query(PlaylistTrack.track_id)
        .filter(
            PlaylistTrack.playlist_id == playlist.id,
            PlaylistTrack.track_id.in_(payload.track_ids),
        )
        .all()
    }
    for track_id in payload.track_ids:
        if track_id not in valid_track_ids:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")
        if track_id not in already_in:
            db.add(PlaylistTrack(playlist_id=playlist.id, track_id=track_id, position=position))
            position += 1
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.delete("/{playlist_id}/tracks/{track_id}", response_model=PlaylistOut)
def remove_track(
    playlist_id: int,
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == playlist.id, PlaylistTrack.track_id == track_id
    ).delete()
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.put("/{playlist_id}/tracks/order", response_model=PlaylistOut)
def reorder_tracks(
    playlist_id: int,
    payload: TrackOrderIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    if playlist.kind in ("smart", "ai"):
        raise HTTPException(status_code=400, detail="Smart playlists are rule-driven")
    rows = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .all()
    )
    by_track = {r.track_id: r for r in rows}
    for index, track_id in enumerate(payload.track_ids):
        row = by_track.get(track_id)
        if row is not None:
            row.position = index
    db.commit()
    db.refresh(playlist)
    return _playlist_out(db, playlist)


@router.get("/{playlist_id}/export")
def export_m3u(
    playlist_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    playlist = _get_owned(db, playlist_id, user)
    if playlist.kind in ("smart", "ai") and playlist.rules:
        tracks = smart_playlist_tracks(db, playlist)
    else:
        tracks = (
            db.query(Track)
            .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
            .filter(PlaylistTrack.playlist_id == playlist.id)
            .order_by(PlaylistTrack.position.asc())
            .all()
        )
    lines = ["#EXTM3U"]
    for t in tracks:
        lines.append(f"#EXTINF:{t.duration},{t.artist_name} - {t.title}")
        lines.append(t.path)
    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={"Content-Disposition": f'attachment; filename="{playlist.name}.m3u"'},
    )

