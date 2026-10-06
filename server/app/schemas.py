"""Pydantic request/response schemas."""
from datetime import datetime

from pydantic import BaseModel, Field


# Auth -----------------------------------------------------------------------
class SetupIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    token: str
    created_at: datetime
    expires_at: datetime


# Library --------------------------------------------------------------------
class TrackOut(BaseModel):
    id: int
    title: str
    artist: str
    album: str
    album_artist: str
    genre: str
    year: int | None
    track_no: int | None
    disc_no: int | None
    duration: int
    bitrate: int
    sample_rate: int
    format: str
    play_count: int
    added_at: datetime
    album_id: int | None
    artist_id: int | None
    is_favorite: bool = False


class ArtistOut(BaseModel):
    id: int
    name: str
    track_count: int
    album_count: int


class AlbumOut(BaseModel):
    id: int
    title: str
    artist: str
    artist_id: int
    year: int | None
    track_count: int
    duration: int
    artwork_id: int | None


class SearchOut(BaseModel):
    tracks: list[TrackOut]
    artists: list[ArtistOut]
    albums: list[AlbumOut]


class PageOut(BaseModel):
    items: list[TrackOut]
    total: int
    offset: int
    limit: int


# Playlists ------------------------------------------------------------------
class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str = ""
    kind: str = Field(default="manual", pattern="^(manual|smart|ai)$")
    rules: dict | list | None = None


class PlaylistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    rules: dict | list | None = None


class PlaylistOut(BaseModel):
    id: int
    name: str
    description: str
    kind: str
    rules: dict | list | None = None
    owner_id: int
    track_count: int
    created_at: datetime
    updated_at: datetime


class PlaylistTracksIn(BaseModel):
    track_ids: list[int] = Field(min_length=1)
    position: int | None = None


class TrackOrderIn(BaseModel):
    track_ids: list[int]


# Jobs / settings / health ----------------------------------------------------
class JobOut(BaseModel):
    id: int
    kind: str
    status: str
    progress: int
    total: int
    message: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SettingsOut(BaseModel):
    library_roots: list[str]
    ai: dict
    scan_interval_hours: int = 0
    transcode_enabled: bool = False
    scrobble: dict = {}


class SettingsUpdate(BaseModel):
    library_roots: list[str] | None = None
    ai: dict | None = None
    scan_interval_hours: int | None = Field(default=None, ge=0, le=168)
    transcode_enabled: bool | None = None
    scrobble: dict | None = None


class LastfmAuthIn(BaseModel):
    username: str
    password: str
    api_key: str
    api_secret: str


class MessageOut(BaseModel):
    message: str
