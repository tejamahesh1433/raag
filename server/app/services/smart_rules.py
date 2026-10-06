"""Smart playlist rule evaluation: JSON rule tree -> SQLAlchemy WHERE clause.

Rule shape:
    {"match": "all" | "any",
     "rules": [{"field": "genre", "op": "contains", "value": "rock"}, ...]}
"""
import json

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session as DbSession

from ..models import Playlist, Track

# rule field name -> Track column name
RULE_FIELDS = {
    "title": "title",
    "artist": "artist_name",
    "album": "album_title",
    "album_artist": "album_artist",
    "genre": "genre",
    "year": "year",
    "track_no": "track_no",
    "disc_no": "disc_no",
    "duration": "duration",
    "play_count": "play_count",
}

_OPS = {"eq", "neq", "contains", "not_contains", "gt", "lt", "gte", "lte"}


def parse_rules(raw: str) -> dict:
    if not raw:
        return {"match": "all", "rules": []}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"match": "all", "rules": []}
    if not isinstance(data, dict):
        return {"match": "all", "rules": []}
    data.setdefault("match", "all")
    data.setdefault("rules", [])
    return data


def _rule_clause(rule: dict):
    field = RULE_FIELDS.get(str(rule.get("field", "")))
    if field is None:
        return None
    op = str(rule.get("op", "eq"))
    if op not in _OPS:
        return None
    col = getattr(Track, field)
    value = rule.get("value")

    numeric_fields = {"year", "track_no", "disc_no", "duration", "play_count"}
    if field in numeric_fields:
        try:
            value = int(value)
        except (TypeError, ValueError):
            return None
        if op == "eq":
            return col == value
        if op == "neq":
            return (col != value) | (col.is_(None))
        if op == "gt":
            return col > value
        if op == "lt":
            return (col < value) & (col.is_not(None))
        if op == "gte":
            return col >= value
        if op == "lte":
            return (col <= value) & (col.is_not(None))
        return None

    value = str(value if value is not None else "")
    if op == "eq":
        return col.ilike(value)
    if op == "neq":
        return (col.is_(None)) | (~col.ilike(value))
    if op == "contains":
        return col.ilike(f"%{value}%")
    if op == "not_contains":
        return (col.is_(None)) | (~col.ilike(f"%{value}%"))
    return None


def apply_rules(query, rules: dict):
    """Apply a rule tree to a SQLAlchemy select() on Track; returns query."""
    clauses = [c for c in (_rule_clause(r) for r in rules.get("rules", [])) if c is not None]
    if not clauses:
        return query
    combine = or_ if str(rules.get("match", "all")).lower() == "any" else and_
    return query.where(combine(*clauses))


def smart_playlist_tracks(db: DbSession, playlist: Playlist):
    query = apply_rules(db.query(Track), parse_rules(playlist.rules))
    return query.order_by(Track.artist_name, Track.album_title, Track.track_no).all()


def evaluate_to_track_ids(db: DbSession, rules: dict) -> list[int]:
    query = apply_rules(db.query(Track), parse_rules(json.dumps(rules)))
    return [t.id for t in query.all()]
