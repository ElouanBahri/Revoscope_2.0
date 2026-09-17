# revoscope 2.0

A ground-up rebuild of [revoscope](../revoscope) (a Streamlit dashboard for a
Revolut investing portfolio) as a real web app: a FastAPI backend and a
React + TypeScript + Tailwind frontend, with the same portfolio/performance
logic, plus Binance and Interactive Brokers as additional account sources
alongside the original Revolut CSV import.

The Streamlit app under `../revoscope` is untouched — this is a separate
project that reuses its accounting logic (cost basis, P&L, bonds, beta,
benchmark comparison, news) rather than replacing it in place.

## Layout

```
API/    FastAPI backend — portfolio logic, market data, news, data sources
web/    React + TypeScript + Tailwind frontend
```

## Running it locally

**Backend:**

```bash
cd API
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in what you use (see below)
uvicorn app.main:app --reload --port 8000
```

**Frontend** (separate terminal):

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api/*` to the backend
on port 8000 (see `web/vite.config.ts`).

## Data sources

Every connected source's transactions are merged into one portfolio — you
can have a Revolut CSV, a Binance account, and an IBKR account feeding the
same dashboard at once. A source that isn't set up is just skipped; the
**Data Sources** page in the app shows live connection status and setup
steps for each.

- **Revolut** — upload a CSV export (Revolut app: Invest → Statements →
  Export → CSV) from the sidebar. Never written to disk or committed.
- **Binance** — real signed REST calls, defaulting to **Binance Testnet**
  (paper trading, safe to experiment with). Create a testnet account/API key
  at testnet.binance.vision, set `BINANCE_API_KEY` / `BINANCE_API_SECRET` in
  `API/.env`. Set `BINANCE_TESTNET=false` only once you deliberately want a
  real account (use a read-only key with no withdrawal/trading permission).
- **Interactive Brokers** — via IBKR's Client Portal Web API. Run IBKR's
  Client Portal Gateway locally and log in at its own page
  (https://localhost:5000) — this app never sees your IBKR credentials or
  2FA, by IBKR's design. See `API/app/datasources/ibkr.py`'s module
  docstring for the full flow and a macOS-specific gotcha (AirPlay Receiver
  also defaults to port 5000).

## Architecture notes

- `API/app/services/` — the portfolio/performance/bonds/news/prices logic,
  ported from the original `revoscope/revoscope/` package with Streamlit's
  `st.cache_data` swapped for a plain in-process TTL cache (`app/cache.py`),
  since this now runs as a long-lived API process rather than a
  rerun-per-interaction Streamlit script.
- `API/app/datasources/` — one class per account source, all producing the
  same transactions shape (`date, ticker, type, quantity, price, amount,
  currency, fx_rate, amount_usd, price_usd`) so the rest of the app never
  needs to know which source a row came from.
- `API/app/services/aggregate.py` — turns merged transactions into the
  JSON the frontend renders; this is the original `app.py`'s inline "compute"
  section, factored into reusable, per-request-cached properties.
- No database — same single-user, in-memory model as the original app.
  Restarting the API loses an uploaded CSV; Binance/IBKR data is re-fetched
  live each time, so nothing is lost there.

## Deploying under your own subdomain

The frontend (`web/`) builds to static files (`npm run build`) deployable
anywhere (Vercel, Netlify, a static host). The backend needs a real host
(Render, Fly.io, a VPS) since it makes outbound calls to Yahoo Finance,
Frankfurter, the Treasury, FRED, and optionally Binance/IBKR — set
`CORS_ORIGINS` in `API/.env` to your deployed frontend's origin.

Interactive Brokers is the one piece that's inherently local-first: its
Client Portal Gateway is a process you run and log into by hand, so a fully
hosted 24/7 IBKR connection needs a VPS running the gateway continuously,
not just the API. Binance and Revolut have no such constraint.
