"""Connection status for every data source, and a manual refresh — the API
equivalent of the old sidebar's file uploader + "Refresh live prices" button.
"""
from __future__ import annotations

import yfinance as yf
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..datasources.base import DataSourceError
from ..services import bonds, news, prices
from ..state import app_state

router = APIRouter(prefix="/datasources", tags=["datasources"])


@router.get("/status")
def get_status():
    transactions, warnings = app_state.get_transactions()
    statuses = [s.status() for s in app_state.sources()]
    return {
        "sources": [{"name": s.name, "state": s.state, "detail": s.detail, "is_example": s.is_example} for s in statuses],
        "warnings": [{"source": w.source, "message": w.message} for w in warnings],
        "transaction_count": int(len(transactions)),
    }


@router.post("/revolut/upload")
async def upload_revolut_csv(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        import io

        app_state.revolut.load(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't parse that CSV: {exc}") from exc
    return app_state.revolut.status().__dict__


@router.post("/refresh")
def refresh_caches():
    """Clear every live-data cache (prices, sectors, names, news, bond
    lookups) so the next request pulls fresh data — same effect as the old
    Streamlit sidebar's refresh button."""
    for fn in [
        prices.get_live_prices,
        prices.get_price_history,
        prices.get_sectors,
        prices.get_company_names,
        prices.get_ticker_info,
        news.search_news,
        news.get_ticker_news,
        bonds.get_treasury_security,
        bonds.get_current_treasury_yield_curve,
    ]:
        fn.clear()
    return {"ok": True}


@router.get("/debug/yf-info/{ticker}")
def debug_yf_info(ticker: str):
    """Temporary diagnostic: bypasses get_ticker_info's caching and
    exception-swallowing to surface the raw error from yfinance's `.info`
    lookup directly in the response, so it's checkable with curl instead of
    needing the Render dashboard's log viewer. Remove once sector/company
    name fetching is confirmed working again."""
    try:
        info = yf.Ticker(prices.to_yahoo_symbol(ticker)).info
        return {"ok": True, "keys": sorted(info.keys()), "sector": info.get("sector"), "shortName": info.get("shortName")}
    except Exception as exc:
        return {"ok": False, "error_type": type(exc).__name__, "error": str(exc)}
