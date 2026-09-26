"""revoscope 2.0 API — FastAPI backend behind the React frontend.

Run with: uvicorn app.main:app --reload --port 8000 (from the API/ directory)
"""
from __future__ import annotations

import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .config import settings
from .deps import get_portfolio_context
from .routers import bonds, datasources, news, portfolio, stock, transactions
from .state import app_state

app = FastAPI(title="revoscope 2.0 API", version="2.0.0")


@app.on_event("startup")
def load_example_portfolio() -> None:
    # Best-effort — a bad/missing example file shouldn't stop the app from
    # serving; see AppState.load_example_portfolio's own try/except.
    app_state.load_example_portfolio()
    threading.Thread(target=_warm_caches, name="warm-caches", daemon=True).start()


def _warm_caches() -> None:
    """Pre-fetch the Overview page's market data in the background right
    after boot, so the first visitor doesn't pay for every Yahoo round trip
    themselves (on Render's free tier, every visit after 15 idle minutes is a
    fresh boot with an empty cache). A request that arrives mid-warm-up just
    waits on the same in-flight fetches (see app.cache) instead of repeating
    them."""
    try:
        ctx = get_portfolio_context()
        ctx.overview()
        ctx.benchmark_comparison()
        ctx.correlation()
        ctx.sector_allocation()  # last: the only one still using throttled `.info`
    except Exception as exc:
        print(f"cache warm-up failed: {exc!r}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Benchmark/beta/price-history payloads are long JSON number arrays that
# compress several-fold.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(datasources.router)
app.include_router(portfolio.router)
app.include_router(stock.router)
app.include_router(bonds.router)
app.include_router(news.router)
app.include_router(transactions.router)


@app.get("/health")
def health():
    return {"status": "ok"}
