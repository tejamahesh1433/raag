"""ORM models: users/sessions, music library, playlists, favorites, jobs, settings."""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    token = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Integer, primary_key=True)
    name = Column(String(512), unique=True, nullable=False, index=True)


class Album(Base):
    __tablename__ = "albums"
    __table_args__ = (UniqueConstraint("title", "artist_id", name="uq_album_title_artist"),)

    id = Column(Integer, primary_key=True)
    title = Column(String(512), nullable=False, index=True)
    artist_id = Column(Integer, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer)
    artwork_id = Column(Integer, ForeignKey("artwork.id", ondelete="SET NULL"))


class Artwork(Base):
    __tablename__ = "artwork"

    id = Column(Integer, primary_key=True)
    sha1 = Column(String(40), unique=True, nullable=False)
    mime = Column(String(64), nullable=False, default="image/jpeg")
    data = Column(Text, nullable=False)  # base64-encoded image bytes


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True)
    path = Column(String(1024), unique=True, nullable=False, index=True)
    size = Column(Integer, nullable=False, default=0)
    mtime = Column(Integer, nullable=False, default=0)

    title = Column(String(512), nullable=False, default="")
    artist_name = Column(String(512), nullable=False, default="", index=True)
    album_title = Column(String(512), nullable=False, default="", index=True)
    album_artist = Column(String(512), nullable=False, default="")
    genre = Column(String(256), nullable=False, default="", index=True)
    year = Column(Integer)
    track_no = Column(Integer)
    disc_no = Column(Integer)

    duration = Column(Integer, nullable=False, default=0)  # seconds
    bitrate = Column(Integer, nullable=False, default=0)
    sample_rate = Column(Integer, nullable=False, default=0)
    format = Column(String(16), nullable=False, default="")

    artist_id = Column(Integer, ForeignKey("artists.id", ondelete="SET NULL"), index=True)
    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"), index=True)

    play_count = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    mood = Column(String(32), nullable=False, default="", index=True)


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True)
    name = Column(String(256), nullable=False)
    description = Column(Text, default="")
    kind = Column(String(16), nullable=False, default="manual")  # manual | smart | ai
    rules = Column(Text, default="")  # JSON rule tree for smart playlists
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
    __table_args__ = (UniqueConstraint("playlist_id", "track_id", name="uq_playlist_track"),)

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=utcnow, nullable=False)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "track_id", name="uq_user_track_favorite"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class PlayEvent(Base):
    __tablename__ = "play_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    played_at = Column(DateTime, default=utcnow, nullable=False, index=True)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True)
    kind = Column(String(32), nullable=False)  # scan | embed | enrich | tag
    status = Column(String(16), nullable=False, default="pending")  # pending|running|done|error
    progress = Column(Integer, nullable=False, default=0)
    total = Column(Integer, nullable=False, default=0)
    message = Column(String(512), nullable=False, default="")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False, default="")


class ChatMessage(Base):
    """Persisted AI assistant conversation (per user, per device, local only)."""

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(128), nullable=False, default="default", index=True)
    role = Column(String(16), nullable=False)  # user | assistant
    content = Column(Text, nullable=False, default="")
    actions = Column(Text, default="")  # JSON list of tool/action summaries
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)


class TrackEmbedding(Base):
    """Vector embedding of track metadata (M4 semantic search)."""

    __tablename__ = "track_embeddings"

    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True)
    model = Column(String(64), nullable=False)
    dim = Column(Integer, nullable=False)
    vector = Column(LargeBinary, nullable=False)  # packed float32
    updated_at = Column(DateTime, default=utcnow, nullable=False)


class TrackLyrics(Base):
    """Cached lyrics: plain text + optional synced lines (JSON)."""

    __tablename__ = "track_lyrics"

    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True)
    plain = Column(Text, default="")
    synced = Column(Text, default="")  # JSON [{"t": seconds, "text": "..."}]
    source = Column(String(32), nullable=False, default="cache")  # sidecar | lrclib | cache
    updated_at = Column(DateTime, default=utcnow, nullable=False)


class TagSuggestion(Base):
    """AI-proposed tag correction awaiting human approval (never auto-written)."""

    __tablename__ = "tag_suggestions"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="pending")  # pending|approved|rejected
    proposed = Column(Text, nullable=False, default="{}")  # JSON field -> new value
    original = Column(Text, nullable=False, default="{}")  # JSON backup at proposal time
    rationale = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    resolved_at = Column(DateTime)


class EnrichmentCache(Base):
    """Cached MusicBrainz (or other free) enrichment payloads."""

    __tablename__ = "enrichment_cache"
    __table_args__ = (UniqueConstraint("kind", "key", name="uq_enrichment_kind_key"),)

    id = Column(Integer, primary_key=True)
    kind = Column(String(32), nullable=False)  # artist | album | album_summary
    key = Column(String(512), nullable=False)
    source = Column(String(32), nullable=False, default="musicbrainz")
    payload = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=utcnow, nullable=False)
