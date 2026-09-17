"""App configuration, loaded from environment variables / API/.env.

Nothing here is committed with real values — see API/.env.example.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General -----------------------------------------------------
    cors_origins: list[str] = ["http://localhost:5173"]

    # --- Binance -------------------------------------------------------
    binance_api_key: str | None = None
    binance_api_secret: str | None = None
    binance_testnet: bool = True
    # Quote assets to try each held asset against when reconstructing trade
    # history (Binance has no single "all my trades" endpoint — see
    # datasources/binance.py). Widen this list to cover more pairs.
    binance_quote_assets: list[str] = ["USDT", "USDC", "BUSD", "FDUSD", "BTC", "EUR"]

    # --- Interactive Brokers -------------------------------------------
    ibkr_gateway_url: str = "https://localhost:5000/v1/api"
    ibkr_account_id: str | None = None  # auto-detected from the gateway session if unset


settings = Settings()
