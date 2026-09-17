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

## Deploying to revoscope.elouanbahri.com

Frontend on **Vercel**, backend on **Render** — both free-tier, both deploy
straight from the `ElouanBahri/Revoscope_2.0` GitHub repo.

**Backend (Render):**
1. In Render: New → Blueprint → point it at this repo. It picks up
   `render.yaml` at the repo root (root dir `API/`, installs
   `requirements.txt`, runs `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
2. `render.yaml` already sets `CORS_ORIGINS` to
   `["https://revoscope.elouanbahri.com"]`. Add `BINANCE_API_KEY` /
   `BINANCE_API_SECRET` there too if you want Binance live on the deployed
   site (Testnet is on by default).
3. Note the service's `*.onrender.com` URL once deployed — that's the
   backend URL the frontend needs (next step).

**Frontend (Vercel):**
1. In Vercel: New Project → import `ElouanBahri/Revoscope_2.0` → set **Root
   Directory** to `web`. It auto-detects Vite (`npm run build`, output
   `dist`); `web/vercel.json` adds the SPA rewrite so client-side routes
   (`/stocks/AAPL`, etc.) don't 404 on a hard refresh.
2. Add an environment variable `VITE_API_BASE_URL` = your Render backend URL
   from above (e.g. `https://revoscope-api.onrender.com`) — the frontend
   reads this at build time (`web/src/api/client.ts`) instead of the dev-only
   `/api` proxy.
3. In the Vercel project's Domains settings, add `revoscope.elouanbahri.com`.
   Vercel gives you a CNAME target (typically `cname.vercel-dns.com`).
4. At whatever DNS provider hosts `elouanbahri.com`, add:
   `CNAME  revoscope  →  cname.vercel-dns.com` (exact target as shown in
   Vercel's dashboard — it can differ). DNS propagation is usually minutes,
   sometimes longer.

**Interactive Brokers stays local-only** in this setup: its Client Portal
Gateway is a process you run and log into by hand, so the *hosted* site's
Data Sources page will correctly show IBKR as unreachable — that's expected,
not a bug. Run the API locally (`uvicorn app.main:app`) with the gateway
running alongside it whenever you want IBKR data; Binance and Revolut CSV
work the same locally or hosted.
