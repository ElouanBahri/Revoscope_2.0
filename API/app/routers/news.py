"""News tab: macro economic & politics overview. Also serves per-ticker
headlines (GET /portfolio?ticker=X), used by Stock Detail rather than a
dedicated portfolio-news section on this tab."""
from __future__ import annotations

import gc

import pandas as pd
from fastapi import APIRouter, Depends, Query

from ..deps import get_portfolio_context
from ..services import news as news_service
from ..services.aggregate import PortfolioContext
from ..utils import timestamp_to_str

router = APIRouter(prefix="/news", tags=["news"])

_REGION_QUERIES = {
    # One query per region, not two — each yf.Search() call spins up its own
    # curl_cffi HTTP session, and this endpoint already makes several other
    # external calls (FRED, CME futures, Polymarket, Kalshi) in the same
    # request; on a memory-constrained host (e.g. Render's free 512MB tier)
    # stacking too many of these in one request risks the process getting
    # OOM-killed. Trading a little headline recall for reliability here.
    "us": ("United States / Fed", ["Federal Reserve"]),
    "europe": ("Europe", ["European Central Bank"]),
    "asia": ("Asia", ["China economy"]),
    "politics": ("Politics", ["US politics"]),
}


def _headline(h: dict, now_utc: pd.Timestamp) -> dict:
    return {
        "title": h["title"],
        "source": h["source"],
        "url": h["url"],
        "published": timestamp_to_str(h["published"]),
        "time_ago": news_service.time_ago(h["published"], now_utc),
    }


@router.get("/economy")
def economy_overview():
    now_utc = pd.Timestamp.now(tz="UTC")
    today = pd.Timestamp.now().normalize()

    fed_rate = news_service.get_fed_funds_target_range()
    ecb_rate = news_service.get_ecb_deposit_rate()
    next_fomc = news_service.next_meeting(news_service.FOMC_MEETINGS, today)
    next_ecb = news_service.next_meeting(news_service.ECB_MEETINGS, today)
    fed_odds = news_service.get_fed_meeting_probabilities(next_fomc, fed_rate)
    # These calls above each spin up their own yfinance/requests session
    # (CME futures, Polymarket, Kalshi); collecting here before the region
    # searches below start a fresh batch keeps peak memory lower on a
    # constrained host instead of letting every session's garbage pile up
    # for the rest of this already-heavy request.
    gc.collect()

    def _meeting(meeting):
        if meeting is None:
            return None
        start, end = meeting
        return {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d"), "days_until": (start - today).days}

    regions = {
        key: {"label": label, "headlines": [_headline(h, now_utc) for h in news_service.search_news_topics(queries, count_per_query=5, limit=5)]}
        for key, (label, queries) in _REGION_QUERIES.items()
    }
    gc.collect()

    return {
        "fed_rate": {**fed_rate, "as_of": timestamp_to_str(fed_rate["as_of"])} if fed_rate else None,
        "ecb_rate": {**ecb_rate, "as_of": timestamp_to_str(ecb_rate["as_of"])} if ecb_rate else None,
        "next_fomc": _meeting(next_fomc),
        "next_ecb": _meeting(next_ecb),
        "fed_odds": fed_odds,
        "sources": {
            "fomc_calendar": news_service.FOMC_SOURCE_URL,
            "ecb_calendar": news_service.ECB_SOURCE_URL,
        },
        "regions": regions,
    }


@router.get("/portfolio")
def portfolio_news(
    ticker: str | None = Query(default=None, description="One holding, or omit for all open positions"),
    ctx: PortfolioContext = Depends(get_portfolio_context),
):
    now_utc = pd.Timestamp.now(tz="UTC")
    tickers = [ticker] if ticker else sorted(ctx.open_positions.keys())
    per_ticker_count = 8 if ticker else 3

    results = []
    for t in tickers:
        if t in ctx.open_bond_tickers:
            results.append({"ticker": t, "name": ctx.company_names.get(t, t), "is_bond": True, "headlines": []})
            continue
        headlines = news_service.get_ticker_news(t, count=per_ticker_count)
        results.append(
            {
                "ticker": t,
                "name": ctx.company_names.get(t, t),
                "is_bond": False,
                "headlines": [_headline(h, now_utc) for h in headlines],
            }
        )
    return results
