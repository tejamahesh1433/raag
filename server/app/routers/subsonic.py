"""Subsonic / OpenSubsonic API compatibility layer.

Enables Subsonic-compatible mobile apps (Symfonium, DSub, Tempo, Amperfy, Play:Sub, Substreamer)
to connect, stream, and browse your Raag library seamlessly.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from .. import config
from ..deps import get_current_user, get_db
from ..models import Track, User
from ..services import streaming as stream_svc
from .library import _favorite_ids, _track_artwork_path

router = APIRouter(prefix="/rest", tags=["subsonic"])

SUBSONIC_VERSION = "1.16.1"


def _format_subsonic_response(
    request: Request,
    data: dict[str, Any],
    status: str = "ok",
) -> Response:
    """Format output as JSON or XML based on the 'f' query parameter (default: json)."""
    f_param = request.query_params.get("f", "json").lower()
    
    res_dict = {
        "subsonic-response": {
            "status": status,
            "version": SUBSONIC_VERSION,
            "type": "raag",
            "serverVersion": config.VERSION,
            "openSubsonic": True,
            **data,
        }
    }
    
    if f_param == "xml":
        # Basic XML builder for Subsonic clients requesting f=xml
        xml_lines = [f'<?xml version="1.0" encoding="UTF-8"?>']
        xml_lines.append(f'<subsonic-response status="{status}" version="{SUBSONIC_VERSION}" type="raag" serverVersion="{config.VERSION}" openSubsonic="true">')
        
        def _to_xml(obj: Any, tag: str = "data") -> str:
            if isinstance(obj, dict):
                attrs = " ".join([f'{k}="{v}"' for k, v in obj.items() if not isinstance(v, (dict, list))])
                children = "".join([_to_xml(v, k) for k, v in obj.items() if isinstance(v, (dict, list))])
                if attrs and children:
                    return f"<{tag} {attrs}>{children}</{tag}>"
                elif attrs:
                    return f"<{tag} {attrs}/>"
                elif children:
                    return f"<{tag}>{children}</{tag}>"
                return f"<{tag}/>"
            elif isinstance(obj, list):
                return "".join([_to_xml(item, tag) for item in obj])
            return f"<{tag}>{obj}</{tag}>"

        for k, v in data.items():
            xml_lines.append(_to_xml(v, k))
        xml_lines.append("</subsonic-response>")
        return Response(content="\n".join(xml_lines), media_type="text/xml")
        
    return JSONResponse(content=res_dict)


@router.get("/ping")
@router.get("/ping.view")
def ping(request: Request):
    return _format_subsonic_response(request, {})


@router.get("/getLicense")
@router.get("/getLicense.view")
def get_license(request: Request):
    return _format_subsonic_response(request, {"license": {"valid": True, "email": "user@raag.local"}})


@router.get("/getMusicFolders")
@router.get("/getMusicFolders.view")
def get_music_folders(request: Request, db: DbSession = Depends(get_db)):
    roots = config.LIBRARY_ROOTS or ["/music"]
    folders = [{"id": idx + 1, "name": str(path)} for idx, path in enumerate(roots)]
    return _format_subsonic_response(request, {"musicFolders": {"musicFolder": folders}})


@router.get("/getArtists")
@router.get("/getArtists.view")
@router.get("/getIndexes")
@router.get("/getIndexes.view")
def get_artists(request: Request, db: DbSession = Depends(get_db)):
    artist_rows = (
        db.query(Track.artist, func.count(Track.id).label("track_count"))
        .filter(Track.artist != "")
        .group_by(Track.artist)
        .order_by(Track.artist)
        .all()
    )
    
    artists = []
    for idx, (name, count) in enumerate(artist_rows):
        artists.append({
            "id": str(idx + 1),
            "name": name,
            "albumCount": 1,
            "artistImageUrl": f"/rest/getCoverArt?id=artist-{idx+1}",
        })
        
    return _format_subsonic_response(request, {
        "artists": {
            "index": [{
                "name": "#",
                "artist": artists
            }]
        }
    })


@router.get("/getSong")
@router.get("/getSong.view")
def get_song(request: Request, id: str = Query(...), db: DbSession = Depends(get_db)):
    try:
        track_id = int(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track id")
        
    track = db.get(Track, track_id)
    if not track:
        return _format_subsonic_response(request, {"error": {"code": 70, "message": "Song not found"}}, status="failed")

    song_obj = {
        "id": str(track.id),
        "parent": "1",
        "title": track.title or "Unknown",
        "artist": track.artist or "Unknown",
        "album": track.album or "Unknown",
        "genre": track.genre or "",
        "year": track.year or 0,
        "track": track.track_no or 1,
        "duration": int(track.duration_seconds or 0),
        "bitRate": track.bitrate_kbps or 320,
        "path": track.path,
        "contentType": "audio/mpeg",
        "suffix": track.format or "mp3",
        "coverArt": str(track.id),
    }
    return _format_subsonic_response(request, {"song": song_obj})


@router.get("/stream")
@router.get("/stream.view")
def stream(
    request: Request,
    id: str = Query(...),
    db: DbSession = Depends(get_db),
):
    try:
        track_id = int(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track id")
        
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    range_header = request.headers.get("range")
    code, media_type, headers, body = stream_svc.stream_track(track, range_header)
    return StreamingResponse(body, status_code=code, media_type=media_type, headers=headers)


@router.get("/getCoverArt")
@router.get("/getCoverArt.view")
def get_cover_art(id: str = Query(...), db: DbSession = Depends(get_db)):
    try:
        track_id = int(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid cover art id")
        
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Cover art not found")
        
    art_path, media_type = _track_artwork_path(db, track)
    if art_path and art_path.is_file():
        return StreamingResponse(open(art_path, "rb"), media_type=media_type)
    raise HTTPException(status_code=404, detail="No cover art")


@router.get("/search3")
@router.get("/search3.view")
def search3(
    request: Request,
    query: str = Query(..., alias="query"),
    db: DbSession = Depends(get_db),
):
    q_str = f"%{query}%"
    tracks = db.query(Track).filter(
        (Track.title.ilike(q_str)) | (Track.artist.ilike(q_str)) | (Track.album.ilike(q_str))
    ).limit(20).all()
    
    songs = []
    for t in tracks:
        songs.append({
            "id": str(t.id),
            "parent": "1",
            "title": t.title or "Unknown",
            "artist": t.artist or "Unknown",
            "album": t.album or "Unknown",
            "duration": int(t.duration_seconds or 0),
            "coverArt": str(t.id),
        })
        
    return _format_subsonic_response(request, {
        "searchResult3": {
            "song": songs
        }
    })
