"""Interactive Brokers data source, via IBKR's Client Portal Web API.

Unlike Binance, there's no API-key auth here — the Client Portal Gateway
(a small Java process you download from IBKR and run locally: see
https://www.interactivebrokers.com/en/trading/ib-api.php#client-portal-api)
handles login itself, including 2FA, through its own browser page at
https://localhost:5000 (default port). This client only ever talks to that
already-authenticated local gateway; it cannot and does not attempt to
perform the login/2FA itself — IBKR designed it that way deliberately, and
there is no legitimate way around it. Flow:

  1. Download + start the Client Portal Gateway, then open
     https://localhost:5000 in a browser and log in there (once per
     gateway session — it stays authenticated for a while, not
     permanently).
  2. Point IBKR_GATEWAY_URL (API/.env) at it — defaults to
     https://localhost:5000/v1/api, i.e. no config needed for the common
     case of running the gateway on the same machine as this API.
  3. status() reports NEEDS_AUTH until step 1's login is done, then
     CONNECTED.

The gateway serves HTTPS with a self-signed cert (that's what "local
gateway" means here), so requests to it skip cert verification — safe only
because it's `localhost`, never a remote host.

Field names for /pa/transactions below follow IBKR's published Client
Portal API schema; IBKR has changed response shapes between API versions
before, so if transactions come back empty/malformed against a real
account, compare against your gateway's actual JSON (log
`_signed... response.json()`) and adjust the parsing in `_transactions_to_rows`.
"""
from __future__ import annotations

import warnings

import pandas as pd
import requests
import urllib3

from ..cache import cache_data
from ..config import Settings
from .base import ConnectionState, DataSourceError, DataSourceStatus, TRANSACTION_COLUMNS

warnings.filterwarnings("ignore", category=urllib3.exceptions.InsecureRequestWarning)

_STABLE_USD_CURRENCIES = {"USD"}


class IBKRSource:
    name = "ibkr"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def _base_url(self) -> str:
        return self._settings.ibkr_gateway_url.rstrip("/")

    def _get(self, path: str, params: dict | None = None, timeout: float = 15) -> dict | list:
        try:
            response = requests.get(f"{self._base_url}{path}", params=params, verify=False, timeout=timeout)
        except requests.exceptions.RequestException as exc:
            raise DataSourceError(
                f"Can't reach the IBKR Client Portal Gateway at {self._base_url}. "
                "Is it running? Start it and log in at its web page first. (On macOS, note that "
                "AirPlay Receiver also listens on port 5000 by default and will hang instead of "
                "refusing the connection if it's on — turn it off in System Settings > General > "
                "AirDrop & Handoff, or run the gateway on a different port.)"
            ) from exc
        if response.status_code != 200:
            raise DataSourceError(f"IBKR gateway error {response.status_code}: {response.text[:300]}")
        return response.json()

    def _post(self, path: str, body: dict) -> dict | list:
        try:
            response = requests.post(f"{self._base_url}{path}", json=body, verify=False, timeout=20)
        except requests.exceptions.RequestException as exc:
            raise DataSourceError(f"Can't reach the IBKR Client Portal Gateway at {self._base_url}.") from exc
        if response.status_code != 200:
            raise DataSourceError(f"IBKR gateway error {response.status_code}: {response.text[:300]}")
        return response.json()

    def auth_status(self) -> dict:
        # Short timeout: this is polled on every single portfolio request
        # (via status()) to render a connection badge, so an absent/hanging
        # gateway shouldn't add many seconds of latency to unrelated pages.
        return self._get("/iserver/auth/status", timeout=1.5)  # type: ignore[return-value]

    def get_accounts(self) -> list[str]:
        data = self._get("/iserver/accounts")
        return data.get("accounts", []) if isinstance(data, dict) else []  # type: ignore[union-attr]

    def _resolve_account_id(self) -> str:
        if self._settings.ibkr_account_id:
            return self._settings.ibkr_account_id
        accounts = self.get_accounts()
        if not accounts:
            raise DataSourceError("No IBKR account visible on this gateway session.")
        return accounts[0]

    @cache_data(ttl=20)
    def status(self) -> DataSourceStatus:
        # Never raise — this is polled unconditionally on every portfolio
        # request to render a connection badge, so any exception here (a
        # gateway hanging instead of refusing, a malformed response, ...)
        # must degrade to an ERROR status, not break the whole request.
        # Cached briefly so that polling doesn't cost a gateway round trip
        # (or the short timeout above) on every single page load.
        try:
            try:
                auth = self.auth_status()
            except DataSourceError as exc:
                return DataSourceStatus(self.name, ConnectionState.ERROR, str(exc))
            if not isinstance(auth, dict) or not auth.get("authenticated"):
                return DataSourceStatus(
                    self.name,
                    ConnectionState.NEEDS_AUTH,
                    f"Gateway reachable but not logged in — open {self._base_url.replace('/v1/api', '')} and sign in.",
                )
            try:
                account_id = self._resolve_account_id()
            except DataSourceError as exc:
                return DataSourceStatus(self.name, ConnectionState.ERROR, str(exc))
            return DataSourceStatus(self.name, ConnectionState.CONNECTED, f"Authenticated — account {account_id}.")
        except Exception as exc:
            return DataSourceStatus(self.name, ConnectionState.ERROR, f"Unexpected error: {exc}")

    def get_positions(self, account_id: str) -> list[dict]:
        data = self._get(f"/portfolio/{account_id}/positions/0")
        return data if isinstance(data, list) else []  # type: ignore[return-value]

    def get_ledger(self, account_id: str) -> dict:
        data = self._get(f"/portfolio/{account_id}/ledger")
        return data if isinstance(data, dict) else {}  # type: ignore[return-value]

    def _transactions_to_rows(self, transactions: list[dict]) -> list[dict]:
        rows = []
        for t in transactions:
            raw_type = (t.get("type") or "").lower()
            if "buy" in raw_type or (t.get("qty", 0) or 0) > 0 and "trade" in raw_type:
                row_type = "BUY - MARKET"
            elif "sell" in raw_type:
                row_type = "SELL - MARKET"
            elif "dividend" in raw_type:
                row_type = "DIVIDEND"
            else:
                # Unrecognized IBKR transaction type — surfaced via
                # find_unknown_types() same as an unfamiliar Revolut type,
                # rather than silently mis-bucketed.
                row_type = raw_type.upper() or "UNKNOWN"

            currency = t.get("cur") or "USD"
            amount = float(t.get("amt") or 0.0)
            qty = float(t.get("qty") or 0.0)
            price = t.get("pr")
            is_usd = currency in _STABLE_USD_CURRENCIES
            rows.append(
                {
                    "date": pd.to_datetime(t.get("date"), errors="coerce"),
                    "ticker": t.get("symbol") or str(t.get("conid")),
                    "type": row_type,
                    "quantity": abs(qty),
                    "price": float(price) if price is not None else float("nan"),
                    "amount": abs(amount),
                    "currency": currency,
                    "fx_rate": 1.0 if is_usd else None,
                    "amount_usd": abs(amount) if is_usd else None,
                    "price_usd": float(price) if (is_usd and price is not None) else None,
                }
            )
        return rows

    def get_transactions(self, account_id: str, conids: list[int], days: int = 365) -> list[dict]:
        if not conids:
            return []
        body = {"acctIds": [account_id], "conids": conids, "currency": "USD", "days": days}
        data = self._post("/pa/transactions", body)
        if isinstance(data, dict):
            return data.get("transactions", [])
        return []

    def fetch_transactions(self) -> pd.DataFrame:
        from ..services.fx import convert_amounts_to_usd

        auth = self.auth_status()
        if not isinstance(auth, dict) or not auth.get("authenticated"):
            raise DataSourceError("IBKR gateway session is not authenticated — log in at its web page first.")

        account_id = self._resolve_account_id()
        positions = self.get_positions(account_id)
        conids = [p["conid"] for p in positions if p.get("conid")]
        raw_transactions = self.get_transactions(account_id, conids)
        rows = self._transactions_to_rows(raw_transactions)

        df = pd.DataFrame(rows, columns=TRANSACTION_COLUMNS)
        if df.empty:
            return df
        df = df.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)

        needs_fx = df["amount_usd"].isna()
        if needs_fx.any():
            df.loc[needs_fx, "amount_usd"] = convert_amounts_to_usd(
                df.loc[needs_fx, "amount"], df.loc[needs_fx, "currency"], df.loc[needs_fx, "date"]
            )
            df.loc[needs_fx, "price_usd"] = convert_amounts_to_usd(
                df.loc[needs_fx, "price"], df.loc[needs_fx, "currency"], df.loc[needs_fx, "date"]
            )
        return df

    @cache_data(ttl=30)
    def cash_balance_usd(self, account_id: str) -> float:
        """Live IBKR cash balance across currencies, converted to USD — the
        ledger already reports a "BASE" pseudo-currency line that IBKR itself
        computes in the account's base currency, used here if present."""
        ledger = self.get_ledger(account_id)
        base = ledger.get("BASE")
        if base and "cashbalance" in base:
            return float(base["cashbalance"])
        total = 0.0
        for currency, entry in ledger.items():
            if currency == "BASE" or "cashbalance" not in entry:
                continue
            balance = float(entry["cashbalance"])
            if currency == "USD":
                total += balance
            else:
                from ..services.fx import get_latest_usd_rate

                rate = get_latest_usd_rate(currency)
                total += balance * rate if rate is not None else balance
        return total
