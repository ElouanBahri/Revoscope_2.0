"""Overview tab: account metrics, holdings table, sector allocation,
benchmark comparison, and stock correlation."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_portfolio_context
from ..services.aggregate import PortfolioContext

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/overview")
def overview(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return ctx.overview()


@router.get("/holdings")
def holdings(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return ctx.holdings()


@router.get("/sectors")
def sectors(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return ctx.sector_allocation()


@router.get("/benchmark")
def benchmark(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return ctx.benchmark_comparison()


@router.get("/correlation")
def correlation(ctx: PortfolioContext = Depends(get_portfolio_context)):
    return ctx.correlation()
