"""Interactive Brokers data source via IBKR's Flex Web Service — the way to
get IBKR data on the *hosted* site. Unlike the Client Portal Gateway source
(ibkr.py), there's no local process and no daily 2FA login: a read-only
token (IBKR_FLEX_TOKEN) downloads a saved report (IBKR_FLEX_QUERY_ID) from
IBKR's servers, from anywhere. The token can only fetch that report — it
can't trade, move money, or change account settings.

Setup (Client Portal → Performance & Reports → Flex Queries):
  1. Create an Activity Flex Query with sections Trades (Execution), Open
     Positions (Summary), Cash Transactions, Cash Report; format XML;
     period "Last 365 Calendar Days".
  2. Flex Web Service Configuration → enable → generate a token.
  3. Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID (Render env / API/.env).

Fetching is two steps: SendRequest (token + query id → a reference code),
then GetStatement (reference code → the XML report), which returns
"generation in progress" for a few seconds first, so it's polled.

Two gaps in a 365-day report are reconciled against the report's own
snapshot sections, so current holdings and cash always match IBKR:
  - A position opened before the window has sells but no opening buy in
    Trades. Open Positions gives the true current quantity, so any shortfall
    becomes one synthetic buy at the window start, priced at IBKR's reported
    average cost (costBasisPrice). Positions fully opened *and* closed
    before the window aren't in the report at all, so their realized P&L
    isn't counted.
  - Deposits/fees/interest before the window are unknown, so the Cash
    Report's ending balance is matched with one synthetic cash row.

Only tickers, quantities, prices, amounts and dates leave this module — the
account number and other personal fields in the report are never exposed.

Report data is IBKR's snapshot (normally regenerated daily after the close),
so it's cached for a few hours; the last good report is kept and served if a
later refresh fails, so an IBKR hiccup doesn't blank the site.
"""
from __future__ import annotations

import re
import threading
import time
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd
import requests

from ..config import Settings
from .base import ConnectionState, DataSourceError, DataSourceStatus, TRANSACTION_COLUMNS

_SEND_REQUEST_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest"
_HEADERS = {"User-Agent": "revoscope/2.0"}
_REFRESH_SECONDS = 3 * 3600
_RETRY_AFTER_FAILURE_SECONDS = 10 * 60
_GENERATION_IN_PROGRESS = {"1019"}
_POLL_ATTEMPTS = 10
_POLL_DELAY_SECONDS = 3.0
_QTY_EPSILON = 1e-6
_IBKR_TZ = "America/New_York"

# IBKR listing exchange → Yahoo Finance symbol suffix, for non-US listings
# (US exchanges need no suffix). Anything unmapped falls back to the bare
# symbol, and shows up in the Overview's "couldn't fetch a price" warning if
# Yahoo can't resolve it — add it here then.
_YAHOO_SUFFIX_BY_EXCHANGE = {
    "IBIS": ".DE", "IBIS2": ".DE", "XETRA": ".DE", "FWB": ".F", "FWB2": ".F",
    "LSE": ".L", "LSEETF": ".L", "LSEIOB1": ".IL",
    "AEB": ".AS", "SBF": ".PA", "ENEXT.BE": ".BR", "BVL": ".LS",
    "EBS": ".SW", "SWX": ".SW", "BVME": ".MI", "BVME.ETF": ".MI", "BM": ".MC",
    "SFB": ".ST", "KFB": ".CO", "CPH": ".CO", "OSE": ".OL", "HEX": ".HE", "VSE": ".VI",
    "TSE": ".TO", "VENTURE": ".V", "ASX": ".AX", "SEHK": ".HK", "TSEJ": ".T", "SGX": ".SI",
}

_DIVIDEND_TYPES = {"dividends", "payment in lieu of dividends", "withholding tax"}


def _attr(el: ET.Element, name: str) -> str:
    return (el.get(name) or "").strip()


def _num(el: ET.Element, name: str) -> float | None:
    raw = _attr(el, name).replace(",", "")
    try:
        return float(raw) if raw else None
    except ValueError:
        return None


def _date(el: ET.Element, *names: str) -> pd.Timestamp | None:
    """Flex dates are yyyyMMdd, datetimes yyyyMMdd;HHmmss (separator varies
    with the query's settings) — read the digits, whatever the separator."""
    for name in names:
        digits = re.sub(r"\D", "", _attr(el, name))
        if len(digits) >= 8:
            try:
                return pd.to_datetime(digits[:14].ljust(14, "0"), format="%Y%m%d%H%M%S")
            except ValueError:
                continue
    return None


def _yahoo_symbol(symbol: str, exchange: str) -> str:
    base = symbol.replace(" ", "-")  # IBKR "BRK B" → Yahoo "BRK-B"
    suffix = _YAHOO_SUFFIX_BY_EXCHANGE.get(exchange.upper(), "")
    if suffix == ".HK" and base.isdigit():
        base = base.zfill(4)
    return base + suffix


def _is_detail_row(el: ET.Element, *allowed: str) -> bool:
    """Some sections can also emit summary/lot rows alongside the detail ones
    depending on the query's options; keep only the requested level."""
    level = _attr(el, "levelOfDetail").upper()
    return not level or level in allowed


class IBKRFlexSource:
    name = "ibkr_flex"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.Lock()
        self._transactions: pd.DataFrame | None = None
        self._symbol_map: dict[str, str] = {}
        self._fetched_at = 0.0
        self._generated_at: str | None = None
        self._last_attempt = 0.0
        self._last_error: str | None = None

    @property
    def configured(self) -> bool:
        return bool(self._settings.ibkr_flex_token and self._settings.ibkr_flex_query_id)

    def status(self) -> DataSourceStatus:
        # Never hits the network — this runs on every portfolio request.
        if not self.configured:
            return DataSourceStatus(self.name, ConnectionState.NOT_CONFIGURED, "No Flex token/query configured.")
        if self._transactions is not None:
            detail = f"Flex report generated {self._generated_at or 'recently'}."
            if self._last_error:
                detail += f" Latest refresh failed, showing the previous report: {self._last_error}"
            return DataSourceStatus(self.name, ConnectionState.CONNECTED, detail)
        if self._last_error:
            return DataSourceStatus(self.name, ConnectionState.ERROR, self._last_error)
        return DataSourceStatus(self.name, ConnectionState.CONNECTED, "Configured — report loads on first use.")

    def yahoo_symbols(self) -> dict[str, str]:
        """{ticker: Yahoo symbol} for this account's non-US listings."""
        return dict(self._symbol_map)

    def fetch_transactions(self) -> pd.DataFrame:
        if not self.configured:
            return pd.DataFrame(columns=TRANSACTION_COLUMNS)
        # One fetch at a time: concurrent page requests after a restart wait
        # for the same download instead of each spending IBKR's rate limit.
        with self._lock:
            now = time.monotonic()
            fresh = self._transactions is not None and now - self._fetched_at < _REFRESH_SECONDS
            backing_off = self._last_error is not None and now - self._last_attempt < _RETRY_AFTER_FAILURE_SECONDS
            if not fresh and not backing_off:
                self._last_attempt = now
                try:
                    root = self._download()
                    self._transactions, self._symbol_map, self._generated_at = self._parse(root)
                    self._fetched_at = time.monotonic()
                    self._last_error = None
                except DataSourceError as exc:
                    self._last_error = str(exc)
                except Exception as exc:  # network errors, malformed XML, ...
                    self._last_error = f"Couldn't load the Flex report: {exc.__class__.__name__}"
            if self._transactions is not None:
                return self._transactions
            raise DataSourceError(self._last_error or "Flex report unavailable.")

    def refresh(self) -> None:
        """Force the next fetch to re-download (the sidebar's refresh)."""
        with self._lock:
            self._fetched_at = 0.0
            self._last_attempt = 0.0
            self._last_error = None

    # --- network -----------------------------------------------------------

    def _download(self) -> ET.Element:
        token = self._settings.ibkr_flex_token
        response = requests.get(
            _SEND_REQUEST_URL,
            params={"t": token, "q": self._settings.ibkr_flex_query_id, "v": "3"},
            headers=_HEADERS,
            timeout=30,
        )
        response.raise_for_status()
        ack = ET.fromstring(response.content)
        if _text(ack, "Status") != "Success":
            raise DataSourceError(_flex_error(ack))
        reference = _text(ack, "ReferenceCode")
        statement_url = _text(ack, "Url")
        if not reference or not statement_url.startswith("https://"):
            raise DataSourceError("IBKR Flex returned no report reference.")

        for _ in range(_POLL_ATTEMPTS):
            time.sleep(_POLL_DELAY_SECONDS)
            response = requests.get(
                statement_url, params={"t": token, "q": reference, "v": "3"}, headers=_HEADERS, timeout=60
            )
            response.raise_for_status()
            root = ET.fromstring(response.content)
            if root.tag == "FlexQueryResponse":
                return root
            if _text(root, "ErrorCode") not in _GENERATION_IN_PROGRESS:
                raise DataSourceError(_flex_error(root))
        raise DataSourceError("IBKR is still generating the Flex report — try again in a minute.")

    # --- parsing -----------------------------------------------------------

    def _parse(self, root: ET.Element) -> tuple[pd.DataFrame, dict[str, str], str | None]:
        from ..services.fx import convert_amounts_to_usd, get_latest_usd_rate

        statements = root.findall(".//FlexStatement")
        if not statements:
            raise DataSourceError("The Flex report contains no statement — check the query's sections.")

        rows: list[dict] = []
        symbol_map: dict[str, str] = {}
        cash_by_currency: dict[str, float] = {}
        has_cash_report = False
        generated_at = None

        for statement in statements:
            window_start = _date(statement, "fromDate") or pd.Timestamp.now().normalize()
            when = _date(statement, "whenGenerated")
            if when is not None:
                generated_at = when.strftime("%Y-%m-%d %H:%M")

            net_traded: dict[str, float] = {}
            for trade in statement.iter("Trade"):
                if _attr(trade, "assetCategory") != "STK" or not _is_detail_row(trade, "EXECUTION"):
                    continue
                side = _attr(trade, "buySell").upper()
                symbol = _attr(trade, "symbol")
                qty = _num(trade, "quantity")
                date = _date(trade, "dateTime", "tradeDate")
                if side not in {"BUY", "SELL"} or not symbol or not qty or date is None:
                    continue
                qty = abs(qty)
                price = _num(trade, "tradePrice")
                net_cash = _num(trade, "netCash")
                if net_cash is None:
                    net_cash = (_num(trade, "proceeds") or 0.0) + (_num(trade, "ibCommission") or 0.0)
                self._remember_symbol(symbol_map, trade)
                net_traded[symbol] = net_traded.get(symbol, 0.0) + (qty if side == "BUY" else -qty)
                rows.append(_row(date, symbol, f"{side} - MARKET", qty, price, abs(net_cash), _attr(trade, "currency")))

            for position in statement.iter("OpenPosition"):
                if _attr(position, "assetCategory") != "STK" or not _is_detail_row(position, "SUMMARY"):
                    continue
                symbol = _attr(position, "symbol")
                held = _num(position, "position") or 0.0
                self._remember_symbol(symbol_map, position)
                missing = held - net_traded.get(symbol, 0.0)
                if missing > _QTY_EPSILON:
                    price = _num(position, "costBasisPrice") or _num(position, "markPrice") or 0.0
                    rows.append(
                        _row(window_start, symbol, "BUY - MARKET", missing, price, missing * price, _attr(position, "currency"))
                    )

            for cash_tx in statement.iter("CashTransaction"):
                if _attr(cash_tx, "type").lower() not in _DIVIDEND_TYPES or not _is_detail_row(cash_tx, "DETAIL"):
                    continue
                symbol = _attr(cash_tx, "symbol")
                amount = _num(cash_tx, "amount")
                date = _date(cash_tx, "dateTime", "settleDate", "reportDate")
                if not symbol or amount is None or date is None:
                    continue
                rows.append(_row(date, symbol, "DIVIDEND", float("nan"), float("nan"), amount, _attr(cash_tx, "currency")))

            for cash in statement.iter("CashReportCurrency"):
                currency = _attr(cash, "currency")
                ending = _num(cash, "endingCash")
                if currency and currency != "BASE_SUMMARY" and ending is not None:
                    has_cash_report = True
                    cash_by_currency[currency] = cash_by_currency.get(currency, 0.0) + ending

        df = pd.DataFrame(rows, columns=TRANSACTION_COLUMNS)
        if not df.empty:
            # Flex times are New York local time; store UTC-aware timestamps
            # to match the Revolut CSV's, so merged sources sort together.
            local = pd.to_datetime(df["date"])
            df["date"] = local.dt.tz_localize(
                _IBKR_TZ, ambiguous=np.zeros(len(local), dtype=bool), nonexistent="shift_forward"
            ).dt.tz_convert("UTC")
            df["amount_usd"] = convert_amounts_to_usd(df["amount"], df["currency"], df["date"])
            df["price_usd"] = convert_amounts_to_usd(df["price"], df["currency"], df["date"])

        if has_cash_report:
            ending_usd = 0.0
            for currency, amount in cash_by_currency.items():
                rate = get_latest_usd_rate(currency.upper())
                ending_usd += amount * rate if rate is not None else amount
            # cash_balance() (services/portfolio.py) nets BUY rows as outflows
            # and every other row as an inflow; one adjustment row makes that
            # total land exactly on IBKR's reported ending cash.
            is_buy = df["type"] == "BUY - MARKET"
            flows = df.loc[~is_buy, "amount_usd"].sum() - df.loc[is_buy, "amount_usd"].sum()
            adjustment = ending_usd - flows
            start = df["date"].min() if not df.empty else pd.Timestamp.now(tz="UTC").normalize()
            cash_row = _row(start, None, "CASH TOP-UP", float("nan"), float("nan"), adjustment, "USD")
            cash_row.update(fx_rate=1.0, amount_usd=adjustment)
            df = pd.DataFrame(df.to_dict("records") + [cash_row], columns=TRANSACTION_COLUMNS)

        df = df.sort_values("date", kind="stable").reset_index(drop=True)
        return df, symbol_map, generated_at

    @staticmethod
    def _remember_symbol(symbol_map: dict[str, str], el: ET.Element) -> None:
        symbol = _attr(el, "symbol")
        yahoo = _yahoo_symbol(symbol, _attr(el, "listingExchange"))
        if symbol and yahoo != symbol:
            symbol_map[symbol] = yahoo


def _row(date, ticker, type_, quantity, price, amount, currency) -> dict:
    return {
        "date": date,
        "ticker": ticker,
        "type": type_,
        "quantity": quantity,
        "price": price if price is not None else float("nan"),
        "amount": amount,
        "currency": (currency or "USD").upper(),
        "fx_rate": None,
        "amount_usd": None,
        "price_usd": None,
    }


def _text(root: ET.Element, tag: str) -> str:
    el = root.find(f".//{tag}")
    return (el.text or "").strip() if el is not None else ""


def _flex_error(root: ET.Element) -> str:
    code = _text(root, "ErrorCode")
    message = _text(root, "ErrorMessage") or "unknown error"
    return f"IBKR Flex error {code}: {message}" if code else f"IBKR Flex error: {message}"
