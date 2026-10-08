"""AI chat: SSE streaming with tool calls, persisted per-user history."""
from __future__ import annotations

import json
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..ai import gateway
from ..ai.tools import TOOLS_SPEC, execute_tool, tool_event
from ..deps import get_current_user, get_db
from ..models import ChatMessage, Setting, Track, User, utcnow

router = APIRouter(prefix="/api/chat", tags=["chat"])

_PLAY_WORDS = {"play", "start", "put on", "queue", "listen", "hear", "show me", "give me"}


def _has_play_intent(text: str) -> bool:
    t = text.lower()
    return any(w in t for w in _PLAY_WORDS)


MAX_HISTORY = 20
MAX_TOOL_ROUNDS = 3
HISTORY_TURNS = 12


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    now_playing: dict | None = None
    device_id: str = Field(default="default", max_length=128)


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    actions: list
    created_at: str

    model_config = {"from_attributes": True}


def _ai_cfg(db: DbSession) -> dict:
    row = db.query(Setting).filter(Setting.key == "ai").first()
    if row and row.value:
        try:
            return json.loads(row.value)
        except json.JSONDecodeError:
            pass
    return {"provider": "ollama"}


def _system_prompt(db: DbSession, user: User, now_playing: dict | None) -> str:
    from sqlalchemy import func as sqlfunc

    from ..models import Album, Artist

    tracks = db.query(sqlfunc.count(Track.id)).scalar() or 0
    artists = db.query(sqlfunc.count(Artist.id)).scalar() or 0
    albums = db.query(sqlfunc.count(Album.id)).scalar() or 0
    genres = (
        db.query(Track.genre, sqlfunc.count(Track.id))
        .filter(Track.genre != "")
        .group_by(Track.genre)
        .order_by(sqlfunc.count(Track.id).desc())
        .limit(8)
        .all()
    )
    genre_line = ", ".join(f"{g} ({c})" for g, c in genres) or "n/a"

    lines = [
        "You are the built-in assistant of a self-hosted local music player.",
        "You are helpful, concise, and grounded in the user's actual library.",
        "",
        "Rules:",
        "- Use tools to search the library before referencing any track; never invent tracks.",
        "- IMPORTANT: When the user says 'play', 'start', 'put on', or any play intent,",
        "  call search_library THEN immediately call play_tracks with the results.",
        "  Do NOT ask 'would you like to play' — just play.",
        "- Use create_playlist only when user explicitly says 'create playlist' or 'save playlist'.",
        "- Keep answers short (1-3 sentences) unless asked for detail.",
        "- All music/AI runs locally; never suggest paid or cloud services.",
        "- Songs have mood tags: romantic, devotional, energetic, sad, happy, chill.",
        "  For mood/genre requests search with the mood word directly (e.g. query='romantic',",
        "  query='energetic'). The search understands these mood tags.",
        "  Aliases: love/romance→romantic, workout/dance/party→energetic,",
        "           bhakti/religious→devotional, emotional/heartbreak→sad,",
        "           cheerful/upbeat→happy, slow/soft/calm→chill.",
        "",
        f"Library: {tracks} tracks, {albums} albums, {artists} artists.",
        f"Top genres: {genre_line}.",
        f"User: {user.username}.",
    ]
    if now_playing:
        title = now_playing.get("title", "?")
        artist = now_playing.get("artist", "?")
        lines.append(f"Now playing: {title} — {artist}.")
    return "\n".join(lines)


def _history_messages(db: DbSession, user: User, device_id: str) -> list[dict]:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id, ChatMessage.device_id == device_id)
        .order_by(ChatMessage.id.desc())
        .limit(HISTORY_TURNS)
        .all()
    )
    rows.reverse()
    return [{"role": m.role, "content": m.content} for m in rows]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/history", response_model=list[ChatMessageOut])
def history(device_id: str = "default", db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id, ChatMessage.device_id == device_id)
        .order_by(ChatMessage.id.desc())
        .limit(MAX_HISTORY)
        .all()
    )
    rows.reverse()
    out = []
    for m in rows:
        try:
            actions = json.loads(m.actions) if m.actions else []
        except json.JSONDecodeError:
            actions = []
        out.append(
            ChatMessageOut(
                id=m.id, role=m.role, content=m.content, actions=actions,
                created_at=m.created_at.isoformat(),
            )
        )
    return out


@router.delete("/history")
def clear_history(device_id: str = "default", db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(ChatMessage).filter(ChatMessage.user_id == user.id, ChatMessage.device_id == device_id).delete()
    db.commit()
    return {"message": "history cleared"}


def _run_conversation(
    ai_cfg: dict,
    system: str,
    history: list[dict],
    user_text: str,
    user_id: int,
    device_id: str = "default",
) -> Iterator[str]:
    """Sync generator driving the tool loop + streaming reply as SSE bytes.

    Runs in FastAPI's threadpool; uses its own DB session.
    """
    from ..db import SessionLocal

    messages = [{"role": "system", "content": system}] + history + [
        {"role": "user", "content": user_text}
    ]
    actions_log: list[dict] = []
    answer = ""
    session = SessionLocal()
    try:
        user_row = session.query(User).filter(User.id == user_id).first()
        final_text: str | None = None

        for _round in range(MAX_TOOL_ROUNDS):
            try:
                resp = gateway.chat_once(ai_cfg, messages, tools=TOOLS_SPEC)
            except gateway.ProviderUnavailable as exc:
                yield _sse("error", {"detail": str(exc)})
                return
            calls = gateway.extract_tool_calls(resp)
            if not calls:
                final_text = gateway.extract_text(resp)
                break
            # Record the assistant's tool_calls turn, then execute each call.
            messages.append(resp["choices"][0]["message"])
            for call in calls:
                try:
                    result, action = execute_tool(
                        call["name"], call["arguments"], session, user_row
                    )
                except HTTPException as exc:
                    result, action = {"error": exc.detail}, None
                # Auto-play: if user asked to play and search returned tracks,
                # fire play_tracks immediately without waiting for a second AI call.
                if (
                    call["name"] == "search_library"
                    and action is None
                    and result.get("count", 0) > 0
                    and _has_play_intent(user_text)
                ):
                    track_ids = [t["id"] for t in result.get("tracks", [])]
                    try:
                        _, action = execute_tool(
                            "play_tracks",
                            {"track_ids": track_ids, "mode": "replace"},
                            session,
                            user_row,
                        )
                    except HTTPException:
                        pass
                if action is not None:
                    actions_log.append(action)
                    yield _sse("action", action)
                yield _sse("tool", tool_event(call["name"], call["arguments"], result))
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call["id"],
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
        else:
            # Tool rounds exhausted — ask for a final answer without tools.
            try:
                final_text = gateway.extract_text(
                    gateway.chat_once(ai_cfg, messages, tools=None)
                )
            except gateway.ProviderUnavailable as exc:
                yield _sse("error", {"detail": str(exc)})
                return

        # Emit the answer as streamed tokens (one delta when non-streamed above;
        # real token stream when the provider streams — both satisfy the client).
        if final_text:
            answer = final_text
            for piece in _tokenize(final_text):
                yield _sse("token", {"text": piece})

        # Persist the assistant turn (and any actions) for history.
        try:
            assistant = ChatMessage(
                user_id=user_id,
                device_id=device_id,
                role="assistant",
                content=answer,
                actions=json.dumps(actions_log, ensure_ascii=False),
                created_at=utcnow(),
            )
            session.add(assistant)
            session.commit()
            message_id = assistant.id
        except Exception:  # pragma: no cover - persistence must not kill the stream
            session.rollback()
            message_id = None
        yield _sse("done", {"message_id": message_id, "actions": actions_log})
    finally:
        session.close()


def _tokenize(text: str, size: int = 24) -> Iterator[str]:
    """Chunk long single-shot answers so the UI animates smoothly."""
    for i in range(0, len(text), size):
        yield text[i : i + size]


@router.post("")
def chat(
    payload: ChatIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ai_cfg = _ai_cfg(db)
    if not gateway.check_reachable(ai_cfg, timeout=3.0):
        raise HTTPException(
            status_code=503,
            detail="AI provider unreachable — start Ollama or LM Studio (Settings → Local AI).",
        )

    system = _system_prompt(db, user, payload.now_playing)
    history = _history_messages(db, user, payload.device_id)

    # Persist the user turn before streaming.
    db.add(
        ChatMessage(
            user_id=user.id, device_id=payload.device_id, role="user", content=payload.message, created_at=utcnow()
        )
    )
    db.commit()

    return StreamingResponse(
        _run_conversation(ai_cfg, system, history, payload.message, user.id, payload.device_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

