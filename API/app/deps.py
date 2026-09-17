"""FastAPI dependencies shared by routers."""
from __future__ import annotations

from .services.aggregate import PortfolioContext
from .state import app_state


def get_portfolio_context() -> PortfolioContext:
    transactions, _warnings = app_state.get_transactions()
    return PortfolioContext(transactions)
