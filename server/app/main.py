"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import SessionLocal, init_db
from .routers import ai_tags, auth, chat, discovery, library, organization, playlists, subsonic, sync, system

# Built SPA (web/dist). When present, the server hosts the frontend itself —
# one process is enough for LAN use; Caddy is only needed for public HTTPS.
WEB_DIST = Path(__file__).resolve().parent.parent.parent / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _bootstrap_admin()
    from .services.scheduler import start_scheduler, stop_scheduler

    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


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
        title="Raag",
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

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        return response

    app.include_router(auth.router)
    app.include_router(library.router)
    app.include_router(playlists.router)
    app.include_router(system.router)
    app.include_router(chat.router)
    app.include_router(discovery.router)
    app.include_router(organization.router)
    app.include_router(subsonic.router)
    app.include_router(sync.router)
    app.include_router(ai_tags.router)
    _mount_spa(app)
    return app



def _mount_spa(app: FastAPI) -> None:
    """Serve the built frontend with SPA fallback (registered after /api routes)."""
    if not WEB_DIST.is_dir():
        return

    if (WEB_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    downloads_dir = config.DATA_DIR / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str):
        # Downloads are served from the persistent data volume, not web/dist.
        # Handle this here because app.mount() loses the race against /{path:path}.
        if path.startswith("downloads/"):
            filename = path[len("downloads/"):]
            dl_file = (downloads_dir / filename).resolve()
            if dl_file.is_relative_to(downloads_dir) and dl_file.is_file():
                return FileResponse(
                    dl_file,
                    filename=filename,
                    media_type="application/vnd.android.package-archive",
                    headers={
                        "Cache-Control": "no-cache",
                        "Accept-Ranges": "bytes",
                    },
                )
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="File not found")
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
