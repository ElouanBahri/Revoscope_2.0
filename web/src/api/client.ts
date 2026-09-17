// In dev, Vite proxies "/api" to the local backend (see vite.config.ts). In
// production there's no dev-server proxy, so a deployed frontend needs the
// real backend URL — set VITE_API_BASE_URL at build time (e.g. in Vercel's
// project settings) to something like "https://revoscope-api.onrender.com".
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

class ApiError extends Error {}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | string[] | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => usp.append(key, v));
    else usp.append(key, value);
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

import type {
  BenchmarkComparison,
  BondDetail,
  Correlation,
  DataSourcesStatus,
  EconomyOverview,
  Holding,
  Overview,
  PortfolioNewsEntry,
  PriceHistory,
  SectorRow,
  SinceInvested,
  StockBeta,
  StockDetail,
  Trade,
  TransactionsResponse,
} from "../types";

export const api = {
  status: () => request<DataSourcesStatus>("/datasources/status"),
  refresh: () => fetch(`${BASE}/datasources/refresh`, { method: "POST" }),
  uploadRevolutCsv: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/datasources/revolut/upload`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError(await res.text());
    return res.json();
  },

  overview: () => request<Overview>("/portfolio/overview"),
  holdings: () => request<Holding[]>("/portfolio/holdings"),
  sectors: () => request<SectorRow[]>("/portfolio/sectors"),
  benchmark: () => request<BenchmarkComparison | null>("/portfolio/benchmark"),
  correlation: () => request<Correlation | null>("/portfolio/correlation"),

  stockList: () => request<string[]>("/stocks"),
  stockDetail: (ticker: string) => request<StockDetail>(`/stocks/${encodeURIComponent(ticker)}`),
  stockBeta: (ticker: string) => request<StockBeta | null>(`/stocks/${encodeURIComponent(ticker)}/beta`),
  stockSinceInvested: (ticker: string) =>
    request<SinceInvested | null>(`/stocks/${encodeURIComponent(ticker)}/since-invested`),
  stockPriceHistory: (ticker: string) =>
    request<PriceHistory>(`/stocks/${encodeURIComponent(ticker)}/price-history`),
  stockTrades: (ticker: string) => request<Trade[]>(`/stocks/${encodeURIComponent(ticker)}/trades`),

  bondList: () => request<string[]>("/bonds"),
  bondDetail: (ticker: string) => request<BondDetail>(`/bonds/${encodeURIComponent(ticker)}`),

  economyNews: () => request<EconomyOverview>("/news/economy"),
  portfolioNews: (ticker?: string) => request<PortfolioNewsEntry[]>(`/news/portfolio${qs({ ticker })}`),

  transactions: (types?: string[], tickers?: string[]) =>
    request<TransactionsResponse>(`/transactions${qs({ types, tickers })}`),
};
