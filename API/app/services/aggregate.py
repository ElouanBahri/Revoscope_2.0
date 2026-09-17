"""Portfolio aggregation: turns a merged transactions DataFrame into the
JSON-serializable structures the frontend renders (overview metrics,
holdings table, sector allocation, benchmark comparison, correlation
matrix). This is the same "compute" logic the original Streamlit app.py had
inline, factored out so multiple API endpoints can share it.
"""
from __future__ import annotations

from functools import cached_property

import pandas as pd

from ..utils import safe_float as _safe
from .bonds import (
    classify_bond_sector,
    estimate_bond_economics,
    get_treasury_security,
    is_bond_position,
    isin_to_us_cusip,
    price_from_yield_curve,
)
from .parser import BUY_TYPES, SELL_TYPES, find_unknown_types
from .performance import (
    BENCHMARK_NAME,
    BENCHMARK_TICKER,
    build_benchmark_shadow_series,
    build_portfolio_series,
)
from .portfolio import Position, build_positions, cash_balance
from .prices import ALL_SECTORS, get_company_names, get_live_prices, get_price_history, get_sectors




class PortfolioContext:
    """Computed once per request from the merged transactions, then reused
    across whichever aggregate_* functions a given endpoint needs."""

    def __init__(self, transactions: pd.DataFrame):
        self.transactions = transactions
        self.unknown_types = find_unknown_types(transactions) if not transactions.empty else []
        self.positions: dict[str, Position] = build_positions(transactions) if not transactions.empty else {}
        self.cash = cash_balance(transactions) if not transactions.empty else 0.0

        self.open_positions = {t: p for t, p in self.positions.items() if p.is_open}
        self.closed_positions = {t: p for t, p in self.positions.items() if not p.is_open}
        self.bond_positions = {t: p for t, p in self.positions.items() if is_bond_position(t, p)}
        self.open_bond_tickers = set(self.bond_positions) & set(self.open_positions)
        self.stock_tickers = sorted(set(self.open_positions) - self.open_bond_tickers)

    # Lazy + cached-per-request: an endpoint like /stocks (just listing
    # tickers) or /transactions never touches Yahoo Finance at all, while
    # one that does (e.g. /portfolio/overview) still only pays for each of
    # these once even if it reads live_prices/sectors/company_names more
    # than once while building its response.
    @cached_property
    def live_prices(self) -> dict[str, float]:
        prices = get_live_prices(tuple(sorted(set(self.open_positions) - self.open_bond_tickers)))
        for ticker, pos in self.bond_positions.items():
            if not pos.is_open:
                continue
            econ = estimate_bond_economics(pos)
            cusip = isin_to_us_cusip(ticker)
            treasury = get_treasury_security(cusip) if cusip else None
            market_price = (
                price_from_yield_curve(100.0, treasury.coupon_rate, treasury.payments_per_year, treasury.maturity_date)
                if treasury is not None
                else None
            )
            prices[ticker] = market_price if market_price is not None else econ.face_value
        return prices

    @cached_property
    def sectors(self) -> dict[str, str]:
        sectors = get_sectors(tuple(sorted(set(self.open_positions) - self.open_bond_tickers)))
        for ticker in self.open_bond_tickers:
            cusip = isin_to_us_cusip(ticker)
            treasury = get_treasury_security(cusip) if cusip else None
            sectors[ticker] = classify_bond_sector(treasury)
        return sectors

    @cached_property
    def company_names(self) -> dict[str, str]:
        names = get_company_names(tuple(sorted(set(self.open_positions) - self.open_bond_tickers)))
        for ticker in self.open_bond_tickers:
            cusip = isin_to_us_cusip(ticker)
            treasury = get_treasury_security(cusip) if cusip else None
            names[ticker] = f"{treasury.security_type} ({treasury.security_term})" if treasury else "Bond"
        return names

    def holdings(self) -> list[dict]:
        rows = []
        for ticker, pos in self.open_positions.items():
            current_price = self.live_prices.get(ticker, float("nan"))
            market_value = pos.quantity * current_price if pd.notna(current_price) else float("nan")
            unrealized = market_value - pos.cost_basis if pd.notna(market_value) else float("nan")
            unrealized_pct = (unrealized / pos.cost_basis * 100) if pos.cost_basis > 0 and pd.notna(unrealized) else float("nan")
            rows.append(
                {
                    "ticker": ticker,
                    "name": self.company_names.get(ticker, ticker),
                    "quantity": pos.quantity,
                    "avg_entry": pos.avg_price,
                    "current_price": _safe(current_price),
                    "market_value": _safe(market_value),
                    "unrealized_pnl": _safe(unrealized),
                    "unrealized_pct": _safe(unrealized_pct),
                    "realized_pnl": pos.realized_pnl,
                    "dividends": pos.dividends,
                    "is_bond": ticker in self.bond_positions,
                }
            )
        rows.sort(key=lambda r: r["market_value"] or 0, reverse=True)
        return rows

    def overview(self) -> dict:
        holdings = self.holdings()
        total_market_value = sum(h["market_value"] or 0 for h in holdings)
        total_cost_basis = sum(p.cost_basis for p in self.open_positions.values())
        total_unrealized = total_market_value - total_cost_basis
        total_realized = sum(p.realized_pnl for p in self.positions.values())
        total_dividends = sum(p.dividends for p in self.positions.values())
        account_value = total_market_value + self.cash
        failed_price_tickers = sorted(t for t in self.open_positions if pd.isna(self.live_prices.get(t, float("nan"))))

        return {
            "account_value": account_value,
            "unrealized_pnl": total_unrealized,
            "unrealized_pct": _safe(total_unrealized / total_cost_basis * 100) if total_cost_basis else None,
            "realized_pnl": total_realized,
            "dividends": total_dividends,
            "cash": self.cash,
            "open_bond_tickers": sorted(self.open_bond_tickers),
            "failed_price_tickers": failed_price_tickers,
            "unknown_transaction_types": self.unknown_types,
            "closed_positions": [
                {"ticker": t, "realized_pnl": p.realized_pnl, "dividends": p.dividends}
                for t, p in self.closed_positions.items()
            ],
        }

    def sector_allocation(self) -> list[dict]:
        holdings = self.holdings()
        total_market_value = sum(h["market_value"] or 0 for h in holdings)
        sector_value: dict[str, float] = {}
        for h in holdings:
            sector = self.sectors.get(h["ticker"], "Unknown")
            sector_value[sector] = sector_value.get(sector, 0.0) + (h["market_value"] or 0.0)

        all_sector_names = list(dict.fromkeys(ALL_SECTORS + [s for s in sector_value if s not in ALL_SECTORS]))
        rows = []
        for sector in all_sector_names:
            amount = sector_value.get(sector, 0.0)
            pct = (amount / total_market_value * 100) if total_market_value else 0.0
            rows.append({"sector": sector, "amount": amount, "pct": pct})
        rows.sort(key=lambda r: r["amount"], reverse=True)
        return rows

    def benchmark_comparison(self) -> dict | None:
        all_trade_dates = self.transactions.loc[self.transactions["ticker"].notna(), "date"] if not self.transactions.empty else pd.Series(dtype="datetime64[ns]")
        if all_trade_dates.empty:
            return None
        perf_start = all_trade_dates.min().normalize()
        benchmark_hist = get_price_history(BENCHMARK_TICKER, start=perf_start.strftime("%Y-%m-%d"))
        if benchmark_hist.empty:
            return None

        date_index = pd.DatetimeIndex(sorted(benchmark_hist["Date"].dt.normalize().unique()))
        price_histories = {
            ticker: get_price_history(ticker, start=perf_start.strftime("%Y-%m-%d")) for ticker in self.positions
        }
        portfolio_value, cash_flows = build_portfolio_series(self.positions, price_histories, date_index)
        benchmark_price_series = benchmark_hist.set_index(benchmark_hist["Date"].dt.normalize())["Close"]
        shadow_value = build_benchmark_shadow_series(cash_flows, benchmark_price_series)

        if portfolio_value.dropna().empty:
            return None

        return {
            "benchmark_name": BENCHMARK_NAME,
            "start_date": perf_start.strftime("%Y-%m-%d"),
            "dates": [d.strftime("%Y-%m-%d") for d in portfolio_value.index],
            "portfolio_value": [_safe(v) for v in portfolio_value],
            "benchmark_value": [_safe(v) for v in shadow_value.reindex(portfolio_value.index)],
            "final_portfolio": _safe(portfolio_value.dropna().iloc[-1]),
            "final_benchmark": _safe(shadow_value.dropna().iloc[-1]) if not shadow_value.dropna().empty else None,
        }

    def correlation(self) -> dict | None:
        if len(self.stock_tickers) < 2:
            return None
        stock_returns = {}
        for ticker in self.stock_tickers:
            hist = get_price_history(ticker, period="1y")
            if not hist.empty:
                daily_returns = hist.set_index("Date")["Close"].pct_change().dropna()
                if not daily_returns.empty:
                    stock_returns[ticker] = daily_returns
        if len(stock_returns) < 2:
            return None
        corr_matrix = pd.DataFrame(stock_returns).corr()
        return {
            "tickers": list(corr_matrix.columns),
            "matrix": [[_safe(v) for v in row] for row in corr_matrix.to_numpy()],
        }
