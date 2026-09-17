"""Revolut CSV export data source — the original revoscope's only source,
wrapped behind the shared DataSource interface so it can be combined with
Binance/IBKR positions.
"""
from __future__ import annotations

from typing import IO

import pandas as pd

from ..services.parser import load_transactions
from .base import ConnectionState, DataSourceStatus


class RevolutCsvSource:
    name = "revolut_csv"

    def __init__(self) -> None:
        self._transactions: pd.DataFrame | None = None
        self._error: str | None = None

    def load(self, csv_source: str | IO[bytes]) -> None:
        """Parse and hold an uploaded CSV in memory for this process's
        lifetime — same single-user, no-database model as the original
        Streamlit app, just moved behind an explicit upload endpoint instead
        of a file re-read on every script rerun."""
        try:
            self._transactions = load_transactions(csv_source)
            self._error = None
        except Exception as exc:
            self._transactions = None
            self._error = str(exc)
            raise

    def status(self) -> DataSourceStatus:
        if self._error:
            return DataSourceStatus(self.name, ConnectionState.ERROR, self._error)
        if self._transactions is None:
            return DataSourceStatus(self.name, ConnectionState.NOT_CONFIGURED, "No CSV uploaded yet.")
        return DataSourceStatus(self.name, ConnectionState.CONNECTED, f"{len(self._transactions)} transactions loaded.")

    def fetch_transactions(self) -> pd.DataFrame:
        from .base import empty_transactions

        return self._transactions if self._transactions is not None else empty_transactions()
