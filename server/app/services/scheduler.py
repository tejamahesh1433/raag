"""Periodic library rescan based on Settings.scan_interval_hours."""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone

from ..db import SessionLocal
from ..models import Job, Setting
from .scan_jobs import queue_library_scan

log = logging.getLogger("raag.scheduler")

_stop = threading.Event()
_thread: threading.Thread | None = None


def _interval_hours() -> int:
    with SessionLocal() as db:
        row = db.query(Setting).filter(Setting.key == "scan_interval_hours").first()
        if not row or not row.value:
            return 0
        try:
            return max(0, int(json.loads(row.value)))
        except (TypeError, ValueError, json.JSONDecodeError):
            try:
                return max(0, int(row.value))
            except (TypeError, ValueError):
                return 0


def _last_scan_age_seconds() -> float | None:
    with SessionLocal() as db:
        last = (
            db.query(Job)
            .filter(Job.kind == "scan", Job.status.in_(("done", "error")))
            .order_by(Job.updated_at.desc())
            .first()
        )
        if last is None or last.updated_at is None:
            return None
        ts = last.updated_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds()


def tick() -> bool:
    """Run one scheduler check. Returns True if a scan was queued."""
    hours = _interval_hours()
    if hours <= 0:
        return False
    age = _last_scan_age_seconds()
    if age is not None and age < hours * 3600:
        return False
    with SessionLocal() as db:
        job = queue_library_scan(db, message=f"Scheduled scan (every {hours}h)")
        if job:
            log.info("queued scheduled scan job #%s", job.id)
            return True
    return False


def _loop() -> None:
    # First pause so startup scans from the wizard aren't raced.
    while not _stop.wait(60):
        try:
            tick()
        except Exception:  # pragma: no cover
            log.exception("scheduler tick failed")


def start_scheduler() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="raag-scan-scheduler", daemon=True)
    _thread.start()


def stop_scheduler() -> None:
    _stop.set()
