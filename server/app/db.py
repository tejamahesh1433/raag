"""SQLite engine/session setup and schema creation (incl. FTS5 search index)."""
import json
import sqlite3
from contextlib import contextmanager

from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from . import config

metadata = MetaData()
Base = declarative_base(metadata=metadata)

# FTS5 virtual table over tracks (external content), created via raw SQL below
# because SQLAlchemy's create_all must not build it without the content options.
_SCHEMA_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
    title, artist_name, album_title, genre,
    content='tracks', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS tracks_fts_ai AFTER INSERT ON tracks BEGIN
    INSERT INTO tracks_fts(rowid, title, artist_name, album_title, genre)
    VALUES (new.id, new.title, new.artist_name, new.album_title, new.genre);
END;
CREATE TRIGGER IF NOT EXISTS tracks_fts_ad AFTER DELETE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist_name, album_title, genre)
    VALUES ('delete', old.id, old.title, old.artist_name, old.album_title, old.genre);
END;
CREATE TRIGGER IF NOT EXISTS tracks_fts_au AFTER UPDATE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist_name, album_title, genre)
    VALUES ('delete', old.id, old.title, old.artist_name, old.album_title, old.genre);
    INSERT INTO tracks_fts(rowid, title, artist_name, album_title, genre)
    VALUES (new.id, new.title, new.artist_name, new.album_title, new.genre);
END;
"""


def _make_engine():
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{config.DB_PATH}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Create tables, FTS index and seed settings from the environment."""
    from . import models  # noqa: F401  (register mappings)

    metadata.create_all(engine)
    # Execute raw schema; statements are split with sqlite3.complete_statement
    # because CREATE TRIGGER bodies contain semicolons.
    statements, buf = [], ""
    for line in _SCHEMA_SQL.strip().splitlines():
        buf += line + "\n"
        if sqlite3.complete_statement(buf.strip()):
            statements.append(buf)
            buf = ""
    if buf.strip():
        statements.append(buf)
    with engine.begin() as conn:
        for stmt in statements:
            conn.exec_driver_sql(stmt)
    _seed_settings()


def _seed_settings() -> None:
    with SessionLocal() as s:
        from .models import Setting

        existing = {row.key: row for row in s.query(Setting).all()}
        defaults: dict[str, object] = {}
        if config.LIBRARY_ROOTS:
            defaults["library_roots"] = config.LIBRARY_ROOTS
        if "library_roots" not in existing:
            defaults.setdefault("library_roots", [])
        defaults.setdefault(
            "ai",
            {
                "provider": config.AI_PROVIDER,
                "base_url": config.AI_BASE_URL,
                "chat_model": config.AI_CHAT_MODEL,
                "embed_model": config.AI_EMBED_MODEL,
                "tag_model": config.AI_TAG_MODEL,
                "online_enrichment": True,
            },
        )
        defaults.setdefault("scan_interval_hours", 0)
        defaults.setdefault("transcode_enabled", False)
        defaults.setdefault(
            "scrobble",
            {
                "lastfm_enabled": False,
                "lastfm_api_key": "",
                "lastfm_api_secret": "",
                "lastfm_session_key": "",
                "listenbrainz_enabled": False,
                "listenbrainz_token": "",
            },
        )
        for key, value in defaults.items():
            if key not in existing:
                s.add(Setting(key=key, value=json.dumps(value)))
        # Never clobber runtime-managed values, only fill missing defaults.
        s.commit()


@contextmanager
def get_session():
    """Context manager yielding a scoped session with commit-on-success."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
