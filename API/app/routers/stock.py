"""Stock Detail tab: per-ticker metrics, price history with trade markers,
beta vs the benchmark, since-first-trade performance, and trade history.
"""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_portfolio_context
from ..services.aggregate import PortfolioContext
from ..services.parser import BUY_TYPES, SELL_TYPES
from ..services.performance import BENCHMARK_NAME, BENCHMARK_TICKER, compute_beta, price_return_index
from ..services.prices import PRICE_HISTORY_RANGES, get_price_history
from ..utils import safe_float, timestamp_to_str

router = APIRouter(prefix="/stocks", tags=["stocks"])


def _get_position(ctx: PortfolioContext, ticker: str):
    if ticker not in ctx.positions or ticker in ctx.bond_positions:
        raise HTTPException(status_code=404, detail=f"No stock/ETF position for {ticker!r}.")
    return ctx.positions[ticker]


@router.get("")
def list_tickers(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return sorted(set(ctx.positions.keys()) - set(ctx.bond_positions))


@router.get("/{ticker}")
def stock_detail(ticker: str, ctx: PortfolioContext = Depends(get_portfolio_context)):
    pos = _get_position(ctx, ticker)
    current_price = ctx.live_prices.get(ticker, float("nan"))
    market_value = pos.quantity * current_price if pos.is_open and pd.notna(current_price) else float("nan")
    unrealized = market_value - pos.cost_basis if pd.notna(market_value) else float("nan")
    unrealized_pct = (unrealized / pos.cost_basis * 100) if pos.cost_basis > 0 and pd.notna(unrealized) else float("nan")
    realized_pct = (pos.realized_pnl / pos.cost_basis_sold * 100) if pos.cost_basis_sold > 0 else float("nan")
    unrealized_pct_total = (unrealized / pos.total_invested * 100) if pos.total_invested > 0 and pd.notna(unrealized) else float("nan")
    realized_pct_total = (pos.realized_pnl / pos.total_invested * 100) if pos.total_invested > 0 else float("nan")

    return {
        "ticker": ticker,
        "name": ctx.company_names.get(ticker, ticker),
        "quantity": pos.quantity,
        "avg_entry": pos.avg_price if pos.is_open else None,
        "current_price": safe_float(current_price),
        "unrealized_pnl": safe_float(unrealized),
        "unrealized_pct": safe_float(unrealized_pct),
        "realized_pnl": pos.realized_pnl,
        "realized_pct": safe_float(realized_pct),
        "dividends": pos.dividends,
        "total_invested": pos.total_invested,
        "currently_invested": pos.cost_basis,
        "unrealized_pct_of_total_invested": safe_float(unrealized_pct_total),
        "realized_pct_of_total_invested": safe_float(realized_pct_total),
    }


@router.get("/{ticker}/beta")
def stock_beta(ticker: str, ctx: PortfolioContext = Depends(get_portfolio_context)):
    _get_position(ctx, ticker)
    stock_hist = get_price_history(ticker, period="1y")
    benchmark_hist = get_price_history(BENCHMARK_TICKER, period="1y")
    if stock_hist.empty or benchmark_hist.empty:
        return None

    stock_returns = stock_hist.set_index(stock_hist["Date"].dt.normalize())["Close"].pct_change().dropna()
    market_returns = benchmark_hist.set_index(benchmark_hist["Date"].dt.normalize())["Close"].pct_change().dropna()
    beta, alpha, r_squared = compute_beta(stock_returns, market_returns)
    if pd.isna(beta):
        return None

    aligned = pd.concat([market_returns.rename("market"), stock_returns.rename("stock")], axis=1, join="inner").dropna()
    return {
        "beta": beta,
        "alpha_daily": alpha,
        "r_squared": r_squared,
        "benchmark_name": BENCHMARK_NAME,
        "scatter": {
            "market_returns": aligned["market"].tolist(),
            "stock_returns": aligned["stock"].tolist(),
        },
    }


@router.get("/{ticker}/since-invested")
def stock_since_invested(ticker: str, ctx: PortfolioContext = Depends(get_portfolio_context)):
    pos = _get_position(ctx, ticker)
    if pos.trades.empty:
        return None
    invest_start = pos.trades["date"].min().normalize()
    stock_hist = get_price_history(ticker, start=invest_start.strftime("%Y-%m-%d"))
    benchmark_hist = get_price_history(BENCHMARK_TICKER, start=invest_start.strftime("%Y-%m-%d"))
    if stock_hist.empty or benchmark_hist.empty:
        return None

    stock_index = price_return_index(stock_hist.set_index(stock_hist["Date"].dt.normalize())["Close"])
    bench_index = price_return_index(benchmark_hist.set_index(benchmark_hist["Date"].dt.normalize())["Close"])
    if stock_index.dropna().empty or bench_index.dropna().empty:
        return None

    all_dates = sorted(set(stock_index.index) | set(bench_index.index))
    return {
        "benchmark_name": BENCHMARK_NAME,
        "start_date": invest_start.strftime("%Y-%m-%d"),
        "dates": [d.strftime("%Y-%m-%d") for d in all_dates],
        "stock_index": [safe_float(stock_index.get(d)) for d in all_dates],
        "benchmark_index": [safe_float(bench_index.get(d)) for d in all_dates],
        "stock_return_pct": safe_float(stock_index.dropna().iloc[-1] - 100),
        "benchmark_return_pct": safe_float(bench_index.dropna().iloc[-1] - 100),
    }


@router.get("/{ticker}/price-history")
def stock_price_history(ticker: str, range: str = "6M", ctx: PortfolioContext = Depends(get_portfolio_context)):
    pos = _get_position(ctx, ticker)
    period, interval = PRICE_HISTORY_RANGES.get(range.upper(), PRICE_HISTORY_RANGES["6M"])
    history = get_price_history(ticker, period=period, interval=interval)
    if history.empty:
        return {"dates": [], "close": [], "buys": [], "sells": [], "intraday": False}

    buys = pos.trades[pos.trades["type"].isin(BUY_TYPES)] if not pos.trades.empty else pd.DataFrame()
    sells = pos.trades[pos.trades["type"].isin(SELL_TYPES)].copy() if not pos.trades.empty else pd.DataFrame()
    if not sells.empty:
        # Bond redemptions carry no per-share price; not relevant here since
        # bonds are excluded, but keep the same fallback for symmetry with
        # the original app in case a SELL row is ever missing price_usd.
        sells["price_usd"] = sells["price_usd"].fillna(sells["amount_usd"] / sells["quantity"])

    return {
        # Full ISO timestamp, not just the date — intraday ranges (1D/5D)
        # need the time-of-day too; the frontend picks the display format.
        "dates": [timestamp_to_str(d) for d in history["Date"]],
        "close": [safe_float(v) for v in history["Close"]],
        "buys": [
            {"date": timestamp_to_str(row.date), "price": safe_float(row.price_usd)} for row in buys.itertuples()
        ],
        "sells": [
            {"date": timestamp_to_str(row.date), "price": safe_float(row.price_usd)} for row in sells.itertuples()
        ],
        "intraday": interval.endswith("m") or interval.endswith("h"),
    }


@router.get("/{ticker}/trades")
def stock_trades(ticker: str, ctx: PortfolioContext = Depends(get_portfolio_context)):
    pos = _get_position(ctx, ticker)
    if pos.trades.empty:
        return []
    return [
        {
            "date": timestamp_to_str(row.date),
            "type": row.type,
            "quantity": safe_float(row.quantity),
            "price_usd": safe_float(row.price_usd),
            "amount_usd": safe_float(row.amount_usd),
        }
        for row in pos.trades.itertuples()
    ]
