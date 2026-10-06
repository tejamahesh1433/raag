"""Shared FastAPI dependencies: DB session and current-user auth."""
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from .db import SessionLocal
from .models import Session as SessionModel, User

SESSION_COOKIE = "session"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: DbSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> User:
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    row = (
        db.query(SessionModel)
        .filter(SessionModel.token == session_token)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    from datetime import datetime, timezone

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
