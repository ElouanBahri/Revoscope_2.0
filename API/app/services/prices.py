"""Live and historical market prices via yfinance (Revolut/Binance/IBKR CSVs
don't carry live valuations, see project README).

Ported from the original Streamlit revoscope's revoscope/prices.py, with
st.cache_data swapped for the plain TTL cache in app.cache.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Iterable, TypeVar

import pandas as pd
import yfinance as yf

# Stock Detail's 1D/5D/1M/... range buttons, mapped to yfinance's own
# (period, interval) strings. Short ranges need intraday bars (a "1D" chart
# with one point per day is useless); long ranges step up to weekly/monthly
# bars so a 5-10 year window doesn't ship thousands of daily points for no
# visual benefit.
PRICE_HISTORY_RANGES: dict[str, tuple[str, str]] = {
    "1D": ("1d", "5m"),
    "5D": ("5d", "15m"),
    "1M": ("1mo", "1d"),
    "6M": ("6mo", "1d"),
    "YTD": ("ytd", "1d"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
    "MAX": ("max", "1mo"),
}

from ..cache import cache_data
from .fx import get_latest_usd_rate, get_usd_rate_series

T = TypeVar("T")

# Revolut exports the bare ticker with no exchange suffix, but Yahoo Finance
# requires one for anything not listed on a US exchange (US stocks like AAPL
# resolve as-is; a European UCITS ETF like VUAA does not). If a ticker fails
# to resolve, look it up on https://finance.yahoo.com/lookup and add the
# Yahoo-qualified symbol here — matching the exchange/currency the position
# was actually bought in keeps prices consistent with the recorded cost
# basis (e.g. a EUR purchase should map to the Xetra ".DE" listing, not a
# GBP one on the LSE, even though both technically track the same fund).
TICKER_OVERRIDES: dict[str, str] = {
    "VUAA": "VUAA.DE",  # Vanguard S&P 500 UCITS ETF (Acc), Xetra
    "EUNM": "EUNM.DE",  # iShares Core MSCI EM IMI UCITS ETF, Xetra
    "1TY": "1TY.DE",  # short-duration bond ETF, Xetra
}

# The 11 standard GICS sectors, so the sector-allocation view can show every
# sector even at $0.
ALL_SECTORS = [
    "Information Technology",
    "Financials",
    "Health Care",
    "Consumer Discretionary",
    "Communication Services",
    "Industrials",
    "Consumer Staples",
    "Energy",
    "Utilities",
    "Real Estate",
    "Materials",
]

# Yahoo Finance reports sectors using Morningstar's names, not GICS. Map them
# onto the GICS names above; entries absent here (Communication Services,
# Industrials, Energy, Utilities, Real Estate) already match.
_YAHOO_TO_GICS_SECTOR = {
    "Technology": "Information Technology",
    "Financial Services": "Financials",
    "Healthcare": "Health Care",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Basic Materials": "Materials",
}

# Sectors for tickers already known to be in the portfolio, so they skip
# Yahoo's throttled `.info` lookup entirely (~2s per ticker). That matters on
# Render's free tier: the in-memory cache is lost every time the service
# sleeps, so without this every wake-up re-fetched every sector. A ticker's
# sector essentially never changes; one missing here just falls back to the
# live lookup. When adding a new holding, add it here too (GICS names, as in
# ALL_SECTORS above).
KNOWN_SECTORS: dict[str, str] = {
    "AAL": "Industrials",
    "AAPL": "Information Technology",
    "CMG": "Consumer Discretionary",
    "CNH": "Industrials",
    "IMAX": "Communication Services",
    "JPM": "Financials",
    "KO": "Consumer Staples",
    "LMT": "Industrials",
    "MA": "Financials",
    "MP": "Materials",
    "NFLX": "Communication Services",
    "NIO": "Consumer Discretionary",
    "NVDA": "Information Technology",
    "SPCX": "Industrials",
    "TM": "Consumer Discretionary",
    "TSLA": "Consumer Discretionary",
    "TSM": "Information Technology",
    "UBS": "Financials",
    "USAR": "Materials",
}


# Filled at runtime by data sources that know each ticker's listing exchange
# (IBKR's Flex report does) — TICKER_OVERRIDES above still wins on conflict.
_SOURCE_SYMBOLS: dict[str, str] = {}


def register_yahoo_symbols(mapping: dict[str, str]) -> None:
    _SOURCE_SYMBOLS.update(mapping)


def to_yahoo_symbol(ticker: str) -> str:
    """Map a Revolut ticker to the Yahoo Finance symbol it actually resolves
    under (see TICKER_OVERRIDES above). Public so other modules needing a
    Yahoo-qualified symbol — e.g. news.py's per-ticker news lookup — stay
    consistent with prices/sector/name lookups instead of re-deriving it."""
    return TICKER_OVERRIDES.get(ticker) or _SOURCE_SYMBOLS.get(ticker, ticker)


def _strip_tz(dates: pd.Series) -> pd.Series:
    """yfinance returns tz-aware timestamps (exchange local time); strip that
    so dates line up cleanly against our tz-naive transaction dates."""
    return dates.dt.tz_localize(None) if dates.dt.tz is not None else dates


# Yahoo's chart/history endpoint isn't rate-limited the way `.info` is, so
# per-ticker fetches against it can run concurrently — a cold cache for a
# ~20-ticker portfolio otherwise costs ~20 back-to-back round trips.
_FETCH_WORKERS = 8


_primed = False
_prime_lock = threading.Lock()


def _prime_yahoo_session() -> None:
    """yfinance fetches a Yahoo cookie/crumb on its very first request. On a
    fresh process (every Render restart), several threads doing that first
    request at once race each other and some get rejected — the "couldn't
    fetch a live price" warning on first load. One plain request first, on
    its own, sets the session up before the parallel fan-out."""
    global _primed
    if _primed:
        return
    with _prime_lock:
        if _primed:
            return
        try:
            yf.Ticker("SPY").history(period="5d")
        except Exception:
            pass
        _primed = True


def _with_retry(fn: Callable[[], T], attempts: int = 3) -> T:
    """Call fn(), retrying on an exception with a short backoff — Yahoo
    rejects the odd request (rate limiting, session hiccups) that succeeds a
    moment later."""
    for attempt in range(attempts):
        try:
            return fn()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(0.5 * (attempt + 1))
    raise AssertionError("unreachable")


def parallel_map(fn: Callable[[str], T], tickers: Iterable[str]) -> dict[str, T]:
    """{ticker: fn(ticker)} with the calls run concurrently."""
    tickers = list(dict.fromkeys(tickers))
    if not tickers:
        return {}
    _prime_yahoo_session()
    with ThreadPoolExecutor(max_workers=min(_FETCH_WORKERS, len(tickers))) as pool:
        return dict(zip(tickers, pool.map(fn, tickers)))


@cache_data(ttl=300)
def _recent_quote(ticker: str) -> tuple[float, dict]:
    """Latest native-currency close plus Yahoo's chart metadata (currency,
    instrumentType, shortName/longName) from one cheap history request.

    A few days, not one: some exchanges report today's close with a lag, and
    a bare period="1d" fetch can land on that one row while it's still NaN,
    showing "no price" for an otherwise perfectly resolvable ticker until the
    feed catches up.
    """
    yf_ticker = yf.Ticker(to_yahoo_symbol(ticker))
    closes = yf_ticker.history(period="5d")["Close"].dropna()
    if closes.empty:
        # Raise rather than return NaN, so a failed fetch isn't cached for 5
        # minutes — the next call (or retry) tries again.
        raise LookupError(f"no recent close for {ticker!r}")
    return float(closes.iloc[-1]), dict(yf_ticker.history_metadata or {})


@cache_data(ttl=86400)
def get_ticker_meta(ticker: str) -> dict:
    """Chart metadata for one ticker, cached for a day — listing currency,
    instrument type and name essentially never change. Raises (so nothing is
    cached) if Yahoo returned no metadata, letting the next call retry."""
    meta = _with_retry(lambda: _recent_quote(ticker))[1]
    if not meta:
        raise LookupError(f"no chart metadata for {ticker!r}")
    return meta


def _meta_or_empty(ticker: str) -> dict:
    try:
        return get_ticker_meta(ticker)
    except Exception:
        return {}


def _currency(ticker: str) -> str:
    return (_meta_or_empty(ticker).get("currency") or "USD").upper()


def _live_price_usd(ticker: str) -> float:
    try:
        native_price = _with_retry(lambda: _recent_quote(ticker))[0]
        rate = get_latest_usd_rate(_currency(ticker))
        return native_price * rate if rate is not None else native_price
    except Exception:
        return float("nan")


@cache_data(ttl=300)
def get_live_prices(tickers: tuple[str, ...]) -> dict[str, float]:
    """Latest close price per ticker, converted to USD. Missing/unresolvable
    tickers map to NaN rather than raising, so one bad symbol doesn't break
    the dashboard.

    Yahoo Finance quotes each ticker in its own listing currency — a
    Xetra-listed UCITS ETF like VUAA.DE comes back in EUR, not USD — so a
    non-USD quote is converted at today's rate before being reported,
    keeping every position comparable in the same currency.
    """
    return parallel_map(_live_price_usd, tickers)


_info_fetch_lock = threading.Lock()
_last_info_fetch = 0.0
_MIN_INFO_FETCH_INTERVAL = 2.0  # seconds between actual (uncached) .info calls


def _throttle_info_fetch() -> None:
    """Yahoo's `.info` endpoint (unlike the plain price-history one) rate-
    limits on request bursts specifically — a cold cache means every ticker
    in a portfolio gets fetched back-to-back in one loop, which is exactly
    the burst pattern that trips it. This only ever delays actual network
    fetches (cache hits return before calling this), so a warm cache stays
    instant."""
    global _last_info_fetch
    with _info_fetch_lock:
        wait = _MIN_INFO_FETCH_INTERVAL - (time.monotonic() - _last_info_fetch)
        if wait > 0:
            time.sleep(wait)
        _last_info_fetch = time.monotonic()


@cache_data(ttl=3600)
def get_ticker_info(ticker: str) -> dict:
    """Cached raw Yahoo Finance `.info` for one ticker. Sector and company
    name both need this, so sharing one cached fetch (instead of each
    calling yfinance separately) halves the Yahoo requests per ticker —
    which also means less exposure to Yahoo's rate-limiting.
    """
    _throttle_info_fetch()
    try:
        return yf.Ticker(to_yahoo_symbol(ticker)).info
    except Exception as exc:
        # `.info` needs a Yahoo "crumb" token (unlike the plain price-history
        # endpoint), which is a notoriously flaky mechanism for any
        # non-browser client — logged rather than silently swallowed so a
        # real block/outage is visible in the server logs instead of just
        # showing up as "Unknown" sector / ticker-as-name everywhere.
        print(f"get_ticker_info({ticker!r}) failed: {exc!r}")
        return {}


_FUND_QUOTE_TYPES = {"ETF", "MUTUALFUND", "INDEX"}

ETF_SECTOR = "ETF & Others"


@cache_data(ttl=3600)
def get_sectors(tickers: tuple[str, ...]) -> dict[str, str]:
    """GICS sector per ticker. ETFs/funds structurally have no single GICS
    sector (Yahoo reports none), so they're labeled 'ETF & Others' instead of
    'Unknown' — that label is reserved for genuine fetch failures on an
    individual stock.

    Cached for an hour, not a day: a transient fetch failure (e.g. Yahoo
    rate-limiting) falls back to 'Unknown' same as a real gap, and caching
    that failure for 24h would leave it looking broken for a full day with
    no way to retry sooner than that.
    """
    sectors: dict[str, str] = {t: KNOWN_SECTORS[t] for t in tickers if t in KNOWN_SECTORS}
    unknown = [t for t in tickers if t not in sectors]
    # The (unthrottled) chart metadata already says whether each ticker is a
    # fund, so ETFs skip the slow, rate-limited `.info` call entirely.
    metas = parallel_map(_meta_or_empty, unknown)
    for ticker in unknown:
        instrument_type = (metas[ticker].get("instrumentType") or "").upper()
        if instrument_type in _FUND_QUOTE_TYPES:
            sectors[ticker] = ETF_SECTOR
            continue
        info = get_ticker_info(ticker)
        raw = info.get("sector")
        if not raw:
            quote_type = (info.get("quoteType") or "").upper()
            sectors[ticker] = ETF_SECTOR if quote_type in _FUND_QUOTE_TYPES else "Unknown"
        else:
            sectors[ticker] = _YAHOO_TO_GICS_SECTOR.get(raw, raw)
    return sectors


@cache_data(ttl=3600)
def get_company_names(tickers: tuple[str, ...]) -> dict[str, str]:
    """Short company/fund name per ticker, for display instead of the bare
    ticker symbol. Falls back to the ticker itself if Yahoo doesn't have a
    name for it (e.g. a fetch failure, or a ticker Yahoo can't resolve).

    Read from the chart metadata rather than `.info`: same names, but no
    rate-limit throttle, so every ticker can be fetched concurrently."""
    def name(ticker: str) -> str:
        meta = _meta_or_empty(ticker)
        raw = meta.get("shortName") or meta.get("longName") or ticker
        return " ".join(raw.split())  # Yahoo pads some names with runs of spaces

    return parallel_map(name, tickers)


def get_price_history(ticker: str, period: str = "6mo", start: str | None = None, interval: str = "1d") -> pd.DataFrame:
    """Close-price history for one ticker in USD, or an empty DataFrame if
    unavailable — see _price_history below. Failures are retried and never
    cached (a transient Yahoo rejection used to leave a chart missing that
    ticker for a full hour)."""
    try:
        return _with_retry(lambda: _price_history(ticker, period=period, start=start, interval=interval))
    except Exception:
        return pd.DataFrame(columns=["Date", "Close"])


@cache_data(ttl=3600)
def _price_history(ticker: str, period: str = "6mo", start: str | None = None, interval: str = "1d") -> pd.DataFrame:
    """Close-price history for one ticker in USD; raises if Yahoo returned
    nothing, so that failure isn't cached. Pass `start` (as 'YYYY-MM-DD') for a fixed start date
    instead of a relative `period` — used for since-investment and beta
    comparisons against a fixed benchmark window. `interval` matches
    yfinance's own strings ("1d", "5m", "15m", "1wk", "1mo", ...) — used for
    the Stock Detail chart's 1D/5D range buttons, which need intraday bars
    rather than one point per day.

    A non-USD-listed ticker (e.g. a Xetra ETF quoted in EUR) is converted
    using that day's actual exchange rate (not one flat rate) at each row's
    own calendar day, so the shape of the return series isn't distorted by
    FX drift over the window — this matters for beta/backtest comparisons,
    not just the current value, and still applies correctly to intraday
    rows since the FX series is daily and each row just carries forward its
    day's rate.
    """
    yf_ticker = yf.Ticker(to_yahoo_symbol(ticker))
    history = (
        yf_ticker.history(start=start, interval=interval)
        if start
        else yf_ticker.history(period=period, interval=interval)
    )
    if history.empty:
        raise LookupError(f"no price history for {ticker!r}")
    history = history.reset_index()
    # Intraday intervals (<1d) come back with the index column named
    # "Datetime" instead of "Date" — normalize so the rest of this
    # function (and every caller) doesn't need to know the difference.
    date_col = "Datetime" if "Datetime" in history.columns else "Date"
    df = history[[date_col, "Close"]].rename(columns={date_col: "Date"}).dropna(subset=["Close"])
    df["Date"] = _strip_tz(df["Date"])

    currency = _currency(ticker)
    if currency != "USD" and not df.empty:
        start_str = df["Date"].min().strftime("%Y-%m-%d")
        end_str = df["Date"].max().strftime("%Y-%m-%d")
        rate_series = get_usd_rate_series(currency, start_str, end_str)
        if rate_series:
            rates = pd.Series(rate_series, name="rate")
            rates.index = pd.to_datetime(rates.index)
            rates = rates.sort_index().reindex(df["Date"].sort_values().unique(), method="ffill").bfill()
            df["Close"] = df["Close"] * df["Date"].map(rates)

    return df


get_price_history.clear = _price_history.clear  # type: ignore[attr-defined]
