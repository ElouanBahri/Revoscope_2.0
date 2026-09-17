"""A tiny process-local TTL cache, standing in for Streamlit's st.cache_data
now that this logic runs behind a plain FastAPI process instead of a
Streamlit script rerun loop.

Same shape as the original: decorate a function, results are memoized by
argument values for `ttl` seconds. `.clear()` on the decorated function wipes
its cache (used by the /datasources/refresh endpoint, mirroring the old
sidebar "Refresh live prices" button).
"""
from __future__ import annotations

import functools
import time
from typing import Callable, TypeVar

T = TypeVar("T")


def cache_data(ttl: int = 300):
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        store: dict[tuple, tuple[float, T]] = {}

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time.monotonic()
            cached = store.get(key)
            if cached is not None and now - cached[0] < ttl:
                return cached[1]
            result = func(*args, **kwargs)
            store[key] = (now, result)
            return result

        def clear():
            store.clear()

        wrapper.clear = clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
