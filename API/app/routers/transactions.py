"""Transactions tab: the raw, filterable transaction log."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..deps import get_portfolio_context
from ..services.aggregate import PortfolioContext
from ..utils import safe_float, timestamp_to_str

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    types: list[str] | None = Query(default=None),
    tickers: list[str] | None = Query(default=None),
    ctx: PortfolioContext = Depends(get_portfolio_context),
):
    df = ctx.transactions
    if df.empty:
        return {"types": [], "tickers": [], "rows": []}

    log = df.copy()
    if types:
        log = log[log["type"].isin(types)]
    if tickers:
        log = log[log["ticker"].isin(tickers)]

    return {
        "types": sorted(df["type"].dropna().unique()),
        "tickers": sorted(df["ticker"].dropna().unique()),
        "rows": [
            {
                "date": timestamp_to_str(row.date),
                "ticker": row.ticker if isinstance(row.ticker, str) else None,
                "type": row.type,
                "quantity": safe_float(row.quantity),
                "price": safe_float(row.price),
                "amount": safe_float(row.amount),
                "currency": row.currency,
                "amount_usd": safe_float(row.amount_usd),
            }
            for row in log.itertuples()
        ],
    }
