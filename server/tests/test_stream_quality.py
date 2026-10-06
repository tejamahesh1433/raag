"""Stream quality / bitrate transcoding helpers."""
from pathlib import Path

from app.services.streaming import ALLOWED_BITRATES, needs_transcode


def test_allowed_bitrates():
    assert 128 in ALLOWED_BITRATES
    assert 320 in ALLOWED_BITRATES
    assert 64 not in ALLOWED_BITRATES


def test_needs_transcode_still_works():
    assert needs_transcode(Path("a.wma")) is True
    assert needs_transcode(Path("a.flac")) is False
