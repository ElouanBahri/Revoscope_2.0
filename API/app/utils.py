"""Small helpers shared across routers/services."""
from __future__ import annotations

import math

import pandas as pd


def safe_float(value) -> float | None:
    """NaN/inf aren't valid JSON (a bare `NaN` token fails `JSON.parse` in
    the browser) — convert to None so the frontend gets an explicit missing
    value instead of a broken response."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(f) or math.isinf(f)) else f


def timestamp_to_str(ts) -> str | None:
    if ts is None or pd.isna(ts):
        return None
    return pd.Timestamp(ts).isoformat()
