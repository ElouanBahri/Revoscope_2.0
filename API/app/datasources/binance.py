"""Binance data source — real signed REST calls against either Binance
Testnet (https://testnet.binance.vision, paper-trading, the default here)
or live Binance (https://api.binance.com), depending on config.

Binance's spot API has no single "all my trades ever" endpoint — trades are
fetched per symbol (GET /api/v3/myTrades). This source lists the account's
non-zero balances, cross-references Binance's published symbol list to find
which of a configured set of quote assets each one actually trades against,
and pulls trade history for each match. That's the same limitation any
Binance portfolio tool runs into without a paid data feed; widening
BINANCE_QUOTE_ASSETS (see config.py) covers more pairs at the cost of more
requests.

Stablecoins (USDT/USDC/BUSD/FDUSD/TUSD) are treated as USD 1:1 — Frankfurter
(services/fx.py's rate source) has no crypto-stablecoin rates, and that peg
is the standard assumption every portfolio tool built on Binance data makes.
Any other quote asset (e.g. a fiat EUR pair) goes through the normal fx
conversion since "EUR" is a real ISO code Frankfurter understands.

Setup: create a Binance Testnet account/API key at
https://testnet.binance.vision, then set BINANCE_API_KEY/BINANCE_API_SECRET
(and BINANCE_TESTNET=true, the default) in API/.env. Use a real, read-only
key (no withdrawal/trading permission) if pointing this at a live account.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

import pandas as pd
import requests

from ..cache import cache_data
from ..config import Settings
from .base import ConnectionState, DataSourceError, DataSourceStatus, TRANSACTION_COLUMNS

_STABLECOINS = {"USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI"}

_TESTNET_BASE = "https://testnet.binance.vision/api"
_LIVE_BASE = "https://api.binance.com/api"


class BinanceSource:
    name = "binance"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._last_error: str | None = None

    @property
    def _base_url(self) -> str:
        return _TESTNET_BASE if self._settings.binance_testnet else _LIVE_BASE

    @property
    def _configured(self) -> bool:
        return bool(self._settings.binance_api_key and self._settings.binance_api_secret)

    def _signed_get(self, path: str, params: dict | None = None) -> dict | list:
        if not self._configured:
            raise DataSourceError("Binance API key/secret not configured (set BINANCE_API_KEY / BINANCE_API_SECRET).")
        params = dict(params or {})
        params["timestamp"] = int(time.time() * 1000)
        params.setdefault("recvWindow", 10000)
        query = urlencode(params)
        signature = hmac.new(
            self._settings.binance_api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        url = f"{self._base_url}{path}?{query}&signature={signature}"
        headers = {"X-MBX-APIKEY": self._settings.binance_api_key}
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            raise DataSourceError(f"Binance API error {response.status_code}: {response.text[:300]}")
        return response.json()

    @cache_data(ttl=3600)
    def _exchange_symbols(self) -> set[str]:
        """All tradable symbol strings (e.g. "BTCUSDT"), public endpoint, no
        signing required. Cached for an hour — this list barely changes."""
        response = requests.get(f"{self._base_url}/v3/exchangeInfo", timeout=15)
        response.raise_for_status()
        return {s["symbol"] for s in response.json().get("symbols", [])}

    def get_account(self) -> dict:
        return self._signed_get("/v3/account")  # type: ignore[return-value]

    def status(self) -> DataSourceStatus:
        if not self._configured:
            return DataSourceStatus(self.name, ConnectionState.NOT_CONFIGURED, "No API key configured.")
        try:
            account = self.get_account()
            mode = "Testnet" if self._settings.binance_testnet else "Live"
            balances = [b for b in account.get("balances", []) if float(b["free"]) + float(b["locked"]) > 0]
            return DataSourceStatus(
                self.name, ConnectionState.CONNECTED, f"{mode} account connected — {len(balances)} non-zero balance(s)."
            )
        except DataSourceError as exc:
            return DataSourceStatus(self.name, ConnectionState.ERROR, str(exc))
        except Exception as exc:  # network errors etc.
            return DataSourceStatus(self.name, ConnectionState.ERROR, f"Unreachable: {exc}")

    def _trades_to_rows(self, asset: str, quote: str, trades: list[dict]) -> list[dict]:
        rows = []
        is_stable_quote = quote in _STABLECOINS
        for t in trades:
            qty = float(t["qty"])
            price = float(t["price"])
            quote_qty = float(t["quoteQty"])
            currency = "USD" if is_stable_quote else quote
            rows.append(
                {
                    "date": pd.Timestamp(t["time"], unit="ms", tz="UTC").tz_localize(None),
                    "ticker": asset,
                    "type": "BUY - MARKET" if t["isBuyer"] else "SELL - MARKET",
                    "quantity": qty,
                    "price": price,
                    "amount": quote_qty,
                    "currency": currency,
                    "fx_rate": 1.0 if is_stable_quote else None,
                    "amount_usd": quote_qty if is_stable_quote else None,
                    "price_usd": price if is_stable_quote else None,
                }
            )
        return rows

    def fetch_transactions(self) -> pd.DataFrame:
        if not self._configured:
            return pd.DataFrame(columns=TRANSACTION_COLUMNS)

        from ..services.fx import convert_amounts_to_usd

        account = self.get_account()
        symbols = self._exchange_symbols()
        quote_assets = self._settings.binance_quote_assets

        balance_assets = {b["asset"] for b in account.get("balances", []) if float(b["free"]) + float(b["locked"]) > 0}

        all_rows: list[dict] = []
        for asset in balance_assets:
            if asset in quote_assets:
                continue
            for quote in quote_assets:
                symbol = f"{asset}{quote}"
                if symbol not in symbols:
                    continue
                try:
                    trades = self._signed_get("/v3/myTrades", {"symbol": symbol, "limit": 1000})
                except DataSourceError:
                    continue
                if trades:
                    all_rows.extend(self._trades_to_rows(asset, quote, trades))  # type: ignore[arg-type]

        df = pd.DataFrame(all_rows, columns=TRANSACTION_COLUMNS)
        if df.empty:
            return df
        df = df.sort_values("date").reset_index(drop=True)

        needs_fx = df["amount_usd"].isna()
        if needs_fx.any():
            df.loc[needs_fx, "amount_usd"] = convert_amounts_to_usd(
                df.loc[needs_fx, "amount"], df.loc[needs_fx, "currency"], df.loc[needs_fx, "date"]
            )
            df.loc[needs_fx, "price_usd"] = convert_amounts_to_usd(
                df.loc[needs_fx, "price"], df.loc[needs_fx, "currency"], df.loc[needs_fx, "date"]
            )
        return df
