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
import threading
import time
from typing import Callable, TypeVar

T = TypeVar("T")


def cache_data(ttl: int = 300):
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        store: dict[tuple, tuple[float, T]] = {}
        # One lock per key, so concurrent callers asking for the same thing
        # (e.g. the Overview page's six parallel requests on a cold cache)
        # wait for the first caller's fetch instead of each repeating it —
        # otherwise every one of them hits Yahoo for the same tickers at once.
        key_locks: dict[tuple, threading.Lock] = {}
        guard = threading.Lock()

        def _fresh(key: tuple):
            cached = store.get(key)
            if cached is not None and time.monotonic() - cached[0] < ttl:
                return cached
            return None

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            cached = _fresh(key)
            if cached is not None:
                return cached[1]
            with guard:
                lock = key_locks.setdefault(key, threading.Lock())
            with lock:
                cached = _fresh(key)
                if cached is not None:
                    return cached[1]
                result = func(*args, **kwargs)
                with guard:
                    now = time.monotonic()
                    # Sweep every expired entry (not just this key) before
                    # inserting. Without this, a call with new args (a new
                    # ticker, a new news query, a new date range) is never
                    # revisited once past its TTL, so the store only ever
                    # grows — an unbounded memory leak on a long-lived
                    # process instead of a cache.
                    expired = [k for k, (ts, _) in store.items() if now - ts >= ttl]
                    for k in expired:
                        del store[k]
                        if k != key:
                            key_locks.pop(k, None)
                    store[key] = (now, result)
            return result

        def clear():
            with guard:
                store.clear()

        wrapper.clear = clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
