"""Auth: first-run setup, login/logout, current user, session management."""
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session as DbSession

from .. import config
from ..deps import SESSION_COOKIE, get_current_user, get_db
from ..models import Session as SessionModel, User
from ..schemas import CreateUserIn, LoginIn, MessageOut, SessionOut, SetupIn, UserOut
from ..security import hash_password, new_session_token, rate_limiter, session_expiry, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_key(request: Request, username: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{username.lower()}|{ip}"


def _start_session(response: Response, db: DbSession, user: User) -> SessionOut:
    token = new_session_token()
    expires = session_expiry()
    db.add(SessionModel(token=token, user_id=user.id, expires_at=expires))
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=config.SESSION_TTL_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=config.COOKIE_SECURE,
        path="/",
    )
    return SessionOut(token=token, created_at=expires, expires_at=expires)


@router.get("/setup-required")
def setup_required(db: DbSession = Depends(get_db)) -> dict:
    """Account setup is only relevant when login is enforced."""
    if not config.AUTH_REQUIRED:
        return {"required": False, "auth_required": False}
    return {"required": db.query(User).count() == 0, "auth_required": True}


@router.post("/setup", response_model=UserOut, status_code=201)
def setup(payload: SetupIn, response: Response, db: DbSession = Depends(get_db)):
    if db.query(User).count() > 0:
        raise HTTPException(status_code=403, detail="Setup already completed")
    user = User(
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _start_session(response, db, user)
    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    key = _client_key(request, payload.username)
    if not rate_limiter.check(key):
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        rate_limiter.record_failure(key)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    rate_limiter.reset(key)
    _start_session(response, db, user)
    return user


@router.post("/logout", response_model=MessageOut)
def logout(
    response: Response,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
):
    # Revoke the session server-side AND clear the cookie.
    if session_token:
        row = db.query(SessionModel).filter(SessionModel.token == session_token).first()
        if row is not None:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return MessageOut(message="logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(SessionModel).filter(SessionModel.user_id == user.id).all()
    return [
        SessionOut(token=r.token, created_at=r.created_at, expires_at=r.expires_at) for r in rows
    ]


@router.get("/users", response_model=list[UserOut])
def list_users(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: CreateUserIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if db.query(User).filter(User.username == payload.username.strip()).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    new_user = User(
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.delete("/users/{user_id}", response_model=MessageOut)
def delete_user(
    user_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(target)
    db.commit()
    return MessageOut(message="user deleted")


@router.delete("/sessions/{token}", response_model=MessageOut)
def revoke_session(
    token: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(SessionModel)
        .filter(SessionModel.token == token, SessionModel.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(row)
    db.commit()
    return MessageOut(message="session revoked")
