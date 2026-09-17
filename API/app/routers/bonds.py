"""Bond Detail tab: characteristics, duration, cash-flow schedule, trades."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_portfolio_context
from ..services import bonds as bonds_service
from ..services.aggregate import PortfolioContext
from ..utils import safe_float, timestamp_to_str

router = APIRouter(prefix="/bonds", tags=["bonds"])


@router.get("")
def list_bonds(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return sorted(ctx.bond_positions)


@router.get("/{ticker}")
def bond_detail(ticker: str, ctx: PortfolioContext = Depends(get_portfolio_context)):
    if ticker not in ctx.bond_positions:
        raise HTTPException(status_code=404, detail=f"No bond position for {ticker!r}.")
    pos = ctx.bond_positions[ticker]

    cusip = bonds_service.isin_to_us_cusip(ticker)
    treasury = bonds_service.get_treasury_security(cusip) if cusip else None
    econ = bonds_service.estimate_bond_economics(pos)

    if treasury is not None:
        face_value = 100.0
        coupon_rate = treasury.coupon_rate
        payments_per_year = treasury.payments_per_year
        maturity_date = treasury.maturity_date
        yield_proxy = treasury.yield_at_auction or coupon_rate
        market_price = bonds_service.price_from_yield_curve(face_value, coupon_rate, payments_per_year, maturity_date)
        characteristics = {
            "source": "treasury",
            "cusip": treasury.cusip,
            "security_type": treasury.security_type,
            "security_term": treasury.security_term,
            "issue_date": timestamp_to_str(treasury.issue_date),
            "maturity_date": timestamp_to_str(maturity_date),
            "coupon_rate": coupon_rate,
            "payments_per_year": payments_per_year,
            "yield_at_auction": treasury.yield_at_auction,
            "face_value": face_value,
            "market_price": safe_float(market_price),
        }
    else:
        face_value = econ.face_value
        coupon_rate = econ.coupon_rate
        payments_per_year = econ.payments_per_year
        maturity_date = econ.maturity_date
        yield_proxy = coupon_rate
        characteristics = {
            "source": "estimate",
            "face_value": face_value,
            "coupon_rate": coupon_rate,
            "payments_per_year": payments_per_year,
            "maturity_date": timestamp_to_str(maturity_date),
        }

    duration = None
    can_compute = (
        coupon_rate is not None
        and payments_per_year is not None
        and payments_per_year > 0
        and maturity_date is not None
        and pos.is_open
    )
    if can_compute:
        macaulay, modified = bonds_service.compute_duration(face_value, coupon_rate, payments_per_year, maturity_date, yield_proxy)
        if macaulay is not None:
            duration = {"macaulay_years": macaulay, "modified_years": modified}

    schedule = None
    if coupon_rate is not None and payments_per_year and payments_per_year > 0 and maturity_date is not None:
        issue_date = treasury.issue_date if treasury is not None else pos.trades["date"].min().normalize()
        schedule_df = bonds_service.build_cash_flow_schedule(face_value, coupon_rate, payments_per_year, issue_date, maturity_date)
        if not schedule_df.empty:
            import pandas as pd

            now = pd.Timestamp.now(tz=schedule_df["date"].dt.tz) if schedule_df["date"].dt.tz is not None else pd.Timestamp.now()
            schedule = [
                {
                    "date": timestamp_to_str(row.date),
                    "amount": safe_float(row.amount),
                    "type": row.type,
                    "status": "Paid" if row.date <= now else "Projected",
                }
                for row in schedule_df.itertuples()
            ]

    return {
        "ticker": ticker,
        "status": "Open" if pos.is_open else "Redeemed",
        "quantity": pos.quantity if pos.is_open else None,
        "coupon_income": pos.dividends,
        "realized_pnl": pos.realized_pnl,
        "characteristics": characteristics,
        "duration": duration,
        "cash_flow_schedule": schedule,
        "trades": [
            {
                "date": timestamp_to_str(row.date),
                "type": row.type,
                "quantity": safe_float(row.quantity),
                "price_usd": safe_float(row.price_usd),
                "amount_usd": safe_float(row.amount_usd),
            }
            for row in pos.trades.itertuples()
        ],
    }
