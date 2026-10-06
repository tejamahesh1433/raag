"""AcoustID helper availability."""
from app.services.acoustid import fpcalc_available


def test_fpcalc_available_is_bool():
    assert isinstance(fpcalc_available(), bool)
