"""revoscope 2.0 API — FastAPI backend behind the React frontend.

Run with: uvicorn app.main:app --reload --port 8000 (from the API/ directory)
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import bonds, datasources, news, portfolio, stock, transactions
from .state import app_state

app = FastAPI(title="revoscope 2.0 API", version="2.0.0")


@app.on_event("startup")
def load_example_portfolio() -> None:
    # Best-effort — a bad/missing example file shouldn't stop the app from
    # serving; see AppState.load_example_portfolio's own try/except.
    app_state.load_example_portfolio()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasources.router)
app.include_router(portfolio.router)
app.include_router(stock.router)
app.include_router(bonds.router)
app.include_router(news.router)
app.include_router(transactions.router)


@app.get("/health")
def health():
    return {"status": "ok"}
