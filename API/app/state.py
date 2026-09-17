"""Single process-wide app state: the data sources and the merged
transaction log they produce.

Same single-user, in-memory model as the original Streamlit app (no
database — a page reload there re-ran the whole script; here, the frontend
just re-fetches from an API that holds this in memory for the life of the
`uvicorn` process). Restarting the API loses the uploaded CSV; Binance/IBKR
data doesn't need to persist since it's re-fetched live each time.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .config import settings
from .datasources import BinanceSource, DataSourceError, IBKRSource, RevolutCsvSource
from .datasources.base import ConnectionState, TRANSACTION_COLUMNS

EXAMPLE_CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "example-portfolio.csv"


@dataclass
class FetchWarning:
    source: str
    message: str


class AppState:
    def __init__(self) -> None:
        self.revolut = RevolutCsvSource()
        self.binance = BinanceSource(settings)
        self.ibkr = IBKRSource(settings)
        if EXAMPLE_CSV_PATH.exists():
            self.revolut.load_example_if_empty(str(EXAMPLE_CSV_PATH))

    def sources(self):
        return [self.revolut, self.binance, self.ibkr]

    def get_transactions(self) -> tuple[pd.DataFrame, list[FetchWarning]]:
        """Merged transaction log across every connected source. A source
        that's not configured or not authenticated is silently skipped
        (that's its normal "off" state); one that IS configured but fails
        produces a warning surfaced to the frontend instead of aborting the
        whole portfolio view over one flaky source.
        """
        frames: list[pd.DataFrame] = []
        warnings: list[FetchWarning] = []

        for source in self.sources():
            status = source.status()
            if status.state == ConnectionState.NOT_CONFIGURED:
                continue
            if status.state == ConnectionState.NEEDS_AUTH:
                warnings.append(FetchWarning(source.name, status.detail))
                continue
            try:
                df = source.fetch_transactions()
                if not df.empty:
                    frames.append(df)
            except DataSourceError as exc:
                warnings.append(FetchWarning(source.name, str(exc)))

        if not frames:
            return pd.DataFrame(columns=TRANSACTION_COLUMNS), warnings

        combined = pd.concat(frames, ignore_index=True).sort_values("date").reset_index(drop=True)
        return combined, warnings


app_state = AppState()
