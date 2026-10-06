"""Queue a background library scan (shared by API + scheduler)."""
from __future__ import annotations

import json
import threading

from sqlalchemy.orm import Session as DbSession

from ..models import Job, Setting
from .scanner import run_scan


def scan_already_running(db: DbSession) -> bool:
    return (
        db.query(Job)
        .filter(Job.kind == "scan", Job.status == "running")
        .first()
        is not None
    )


def library_roots(db: DbSession) -> list[str]:
    setting = db.query(Setting).filter(Setting.key == "library_roots").first()
    if not setting or not setting.value:
        return []
    try:
        roots = json.loads(setting.value)
    except json.JSONDecodeError:
        return []
    return [str(r) for r in roots] if isinstance(roots, list) else []


def queue_library_scan(db: DbSession, *, message: str = "Starting scan") -> Job | None:
    """Create a running scan job and start a worker thread. None if no roots."""
    roots = library_roots(db)
    if not roots:
        return None
    if scan_already_running(db):
        return None

    job = Job(kind="scan", status="running", message=message)
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    def _run():
        from ..db import SessionLocal

        with SessionLocal() as bg:
            target = bg.query(Job).filter(Job.id == job_id).first()
            try:
                run_scan(bg, roots, target)
            except Exception as exc:  # pragma: no cover
                if target:
                    target.status = "error"
                    target.message = f"Scan failed: {exc}"
                    bg.commit()

    threading.Thread(target=_run, daemon=True).start()
    return job
