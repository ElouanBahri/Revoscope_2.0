"""Common interface every account data source (Revolut CSV, Binance,
Interactive Brokers, ...) implements.

The rest of the app — portfolio.py, performance.py, bonds.py — was written
against one shape: a "transactions" DataFrame with columns
`date, ticker, type, quantity, price, amount, currency, fx_rate, amount_usd,
price_usd` (see services/parser.py's docstring). Every data source's job is
just to produce a DataFrame in that same shape from whatever its native API
returns, so a portfolio can mix a Revolut CSV with live Binance/IBKR data
and still run through the same accounting/analytics code untouched.

`type` values must be drawn from services/parser.py's BUY_TYPES/SELL_TYPES/
INCOME_TYPES/CASH_TYPES vocabulary (e.g. "BUY - MARKET", "SELL - MARKET",
"DIVIDEND", "CASH TOP-UP") so downstream logic that switches on transaction
type keeps working regardless of which source produced the row.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

import pandas as pd

TRANSACTION_COLUMNS = [
    "date",
    "ticker",
    "type",
    "quantity",
    "price",
    "amount",
    "currency",
    "fx_rate",
    "amount_usd",
    "price_usd",
]


class DataSourceError(Exception):
    """Raised when a data source can't produce transactions right now —
    missing credentials, an unauthenticated gateway session, a network
    failure, etc. Callers show `str(error)` directly, so messages should be
    actionable (e.g. "log in at https://localhost:5000")."""


class ConnectionState(str, Enum):
    NOT_CONFIGURED = "not_configured"  # no credentials/config supplied
    NEEDS_AUTH = "needs_auth"  # configured, but the remote session isn't authenticated
    CONNECTED = "connected"
    ERROR = "error"


@dataclass
class DataSourceStatus:
    name: str
    state: ConnectionState
    detail: str = ""


def empty_transactions() -> pd.DataFrame:
    return pd.DataFrame(columns=TRANSACTION_COLUMNS)


class DataSource(Protocol):
    """Every data source exposes a stable `name` plus these two calls.
    `status()` must never raise — it's polled by the UI to render a
    connection badge. `fetch_transactions()` may raise DataSourceError."""

    name: str

    def status(self) -> DataSourceStatus: ...

    def fetch_transactions(self) -> pd.DataFrame: ...
