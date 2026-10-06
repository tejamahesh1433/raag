"""Shared FastAPI dependencies: DB session and current-user auth."""
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from . import config
from .db import SessionLocal
from .models import Session as SessionModel, User

SESSION_COOKIE = "session"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_guest_user(db: DbSession) -> User:
    """Household open-access identity used when login is not required."""
    user = db.query(User).filter(User.username == config.GUEST_USERNAME).first()
    if user is not None:
        if not user.is_admin:
            user.is_admin = True
            db.commit()
            db.refresh(user)
        return user
    user = User(
        username=config.GUEST_USERNAME,
        password_hash="!",  # unusable — guest never logs in with a password
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    db: DbSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> User:
    if session_token:
        row = (
            db.query(SessionModel)
            .filter(SessionModel.token == session_token)
            .first()
        )
        if row is not None:
            from datetime import datetime, timezone

            expires = row.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires >= datetime.now(timezone.utc):
                user = db.query(User).filter(User.id == row.user_id).first()
                if user is not None:
                    return user

    if not config.AUTH_REQUIRED:
        return ensure_guest_user(db)

    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    raise HTTPException(status_code=401, detail="Invalid or expired session")
