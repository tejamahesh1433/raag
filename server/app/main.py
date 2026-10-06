"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import SessionLocal, init_db
from .routers import auth, chat, library, playlists, system

# Built SPA (web/dist). When present, the server hosts the frontend itself —
# one process is enough for LAN use; Caddy is only needed for public HTTPS.
WEB_DIST = Path(__file__).resolve().parent.parent.parent / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _bootstrap_admin()
    yield


def _bootstrap_admin() -> None:
    """Create the first admin account from env when requested and absent."""
    if not config.BOOTSTRAP_ADMIN_USER or not config.BOOTSTRAP_ADMIN_PASSWORD:
        return
    from .models import User
    from .security import hash_password

    with SessionLocal() as db:
        if db.query(User).count() == 0:
            db.add(
                User(
                    username=config.BOOTSTRAP_ADMIN_USER,
                    password_hash=hash_password(config.BOOTSTRAP_ADMIN_PASSWORD),
                    is_admin=True,
                )
            )
            db.commit()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Local Music Server",
        version=config.VERSION,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(library.router)
    app.include_router(playlists.router)
    app.include_router(system.router)
    app.include_router(chat.router)
    _mount_spa(app)
    return app


def _mount_spa(app: FastAPI) -> None:
    """Serve the built frontend with SPA fallback (registered after /api routes)."""
    if not WEB_DIST.is_dir():
        return

    if (WEB_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str):
        if path.startswith("api/"):
            return FileResponse(WEB_DIST / "index.html")  # unknown API route -> SPA
        target = (WEB_DIST / path).resolve()
        # Path containment: never serve outside the dist directory.
        if target.is_relative_to(WEB_DIST) and target.is_file():
            return FileResponse(target)
        return FileResponse(WEB_DIST / "index.html")


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=True)
