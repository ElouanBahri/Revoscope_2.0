"""PIN protection for the few endpoints that change what the public site
shows (CSV upload, cache refresh). Everything else stays public, read-only.

The PIN is an 8-digit number set as the ADMIN_PIN environment variable
(Render's dashboard in production, API/.env locally) — never in the code or
the frontend. If it isn't set, or isn't exactly 8 digits, admin actions are
disabled outright rather than left open.

8 digits is 100 million combinations, which is only safe with guess limits:
each client IP gets 5 wrong tries per 15 minutes, and all clients together
get 20 per hour (so rotating IPs doesn't help). At 20 guesses/hour, trying
every PIN would take ~570 years. The trade-off: someone hammering wrong PINs
can temporarily lock *you* out too — for a personal site that's the right
way round.
"""
from __future__ import annotations

import hmac
import re
import threading
import time
from collections import deque

from fastapi import Header, HTTPException, Request

from .config import settings

_PER_IP_MAX_FAILURES = 5
_PER_IP_WINDOW = 15 * 60
_GLOBAL_MAX_FAILURES = 20
_GLOBAL_WINDOW = 60 * 60

_lock = threading.Lock()
_ip_failures: dict[str, deque[float]] = {}
_global_failures: deque[float] = deque()


def _prune(times: deque[float], window: float, now: float) -> None:
    while times and now - times[0] >= window:
        times.popleft()


def _client_ip(request: Request) -> str:
    # Render sits behind a proxy, so the TCP peer is the proxy itself; the
    # real client is the last X-Forwarded-For hop (the one Render appended —
    # earlier entries are client-supplied and spoofable). The global limit
    # below doesn't depend on this being accurate anyway.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def require_admin(request: Request, x_admin_pin: str | None = Header(default=None)) -> None:
    """FastAPI dependency: 401 on a wrong/missing PIN, 429 once too many
    wrong PINs have been tried, 503 if no valid ADMIN_PIN is configured."""
    expected = settings.admin_pin or ""
    if not re.fullmatch(r"\d{8}", expected):
        raise HTTPException(status_code=503, detail="Admin actions are disabled (no ADMIN_PIN configured on the server).")

    ip = _client_ip(request)
    now = time.monotonic()
    with _lock:
        # Drop IPs whose failures have all expired, so the table can't grow
        # without bound on a long-lived process.
        for other_ip in [k for k, v in _ip_failures.items() if not v or now - v[-1] >= _PER_IP_WINDOW]:
            del _ip_failures[other_ip]
        ip_times = _ip_failures.setdefault(ip, deque())
        _prune(ip_times, _PER_IP_WINDOW, now)
        _prune(_global_failures, _GLOBAL_WINDOW, now)
        if len(ip_times) >= _PER_IP_MAX_FAILURES or len(_global_failures) >= _GLOBAL_MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Too many wrong PINs — try again later.")

        if hmac.compare_digest((x_admin_pin or "").encode(), expected.encode()):
            return
        ip_times.append(now)
        _global_failures.append(now)
    raise HTTPException(status_code=401, detail="Wrong admin PIN.")
