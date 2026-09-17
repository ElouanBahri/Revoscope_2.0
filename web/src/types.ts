export interface Overview {
  account_value: number;
  unrealized_pnl: number;
  unrealized_pct: number | null;
  realized_pnl: number;
  dividends: number;
  cash: number;
  open_bond_tickers: string[];
  failed_price_tickers: string[];
  unknown_transaction_types: string[];
  closed_positions: { ticker: string; realized_pnl: number; dividends: number }[];
}

export interface Holding {
  ticker: string;
  name: string;
  quantity: number;
  avg_entry: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  realized_pnl: number;
  dividends: number;
  is_bond: boolean;
}

export interface SectorRow {
  sector: string;
  amount: number;
  pct: number;
}

export interface BenchmarkComparison {
  benchmark_name: string;
  start_date: string;
  dates: string[];
  portfolio_value: (number | null)[];
  benchmark_value: (number | null)[];
  final_portfolio: number | null;
  final_benchmark: number | null;
}

export interface Correlation {
  tickers: string[];
  matrix: (number | null)[][];
}

export interface StockDetail {
  ticker: string;
  name: string;
  quantity: number;
  avg_entry: number | null;
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  realized_pnl: number;
  realized_pct: number | null;
  dividends: number;
  total_invested: number;
  currently_invested: number;
  unrealized_pct_of_total_invested: number | null;
  realized_pct_of_total_invested: number | null;
}

export interface StockBeta {
  beta: number;
  alpha_daily: number;
  r_squared: number;
  benchmark_name: string;
  scatter: { market_returns: number[]; stock_returns: number[] };
}

export interface SinceInvested {
  benchmark_name: string;
  start_date: string;
  dates: string[];
  stock_index: (number | null)[];
  benchmark_index: (number | null)[];
  stock_return_pct: number | null;
  benchmark_return_pct: number | null;
}

export interface PriceHistoryPoint {
  date: string;
  price: number | null;
}

export interface PriceHistory {
  dates: string[];
  close: (number | null)[];
  buys: PriceHistoryPoint[];
  sells: PriceHistoryPoint[];
  intraday: boolean;
}

export const PRICE_HISTORY_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;
export type PriceHistoryRange = (typeof PRICE_HISTORY_RANGES)[number];

export interface Trade {
  date: string | null;
  type: string;
  quantity: number | null;
  price_usd: number | null;
  amount_usd: number | null;
}

export interface BondCharacteristics {
  source: "treasury" | "estimate";
  cusip?: string;
  security_type?: string;
  security_term?: string;
  issue_date?: string | null;
  maturity_date?: string | null;
  coupon_rate: number | null;
  payments_per_year: number | null;
  yield_at_auction?: number | null;
  face_value: number;
  market_price?: number | null;
}

export interface BondDetail {
  ticker: string;
  status: "Open" | "Redeemed";
  quantity: number | null;
  coupon_income: number;
  realized_pnl: number;
  characteristics: BondCharacteristics;
  duration: { macaulay_years: number; modified_years: number } | null;
  cash_flow_schedule: { date: string; amount: number | null; type: string; status: string }[] | null;
  trades: Trade[];
}

export interface Headline {
  title: string;
  source: string;
  url: string;
  published: string | null;
  time_ago: string;
}

export interface EconomyOverview {
  fed_rate: { display: string; as_of: string; source_name: string; source_url: string } | null;
  ecb_rate: { display: string; as_of: string; source_name: string; source_url: string } | null;
  next_fomc: { start: string; end: string; days_until: number } | null;
  next_ecb: { start: string; end: string; days_until: number } | null;
  fed_odds: {
    sources: { source_name: string; source_url: string; hike: number; hold: number; cut: number }[];
    average: { hike: number; hold: number; cut: number };
  } | null;
  sources: { fomc_calendar: string; ecb_calendar: string };
  regions: Record<string, { label: string; headlines: Headline[] }>;
}

export interface PortfolioNewsEntry {
  ticker: string;
  name: string;
  is_bond: boolean;
  headlines: Headline[];
}

export interface TransactionRow {
  date: string | null;
  ticker: string | null;
  type: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  currency: string;
  amount_usd: number | null;
}

export interface TransactionsResponse {
  types: string[];
  tickers: string[];
  rows: TransactionRow[];
}

export type ConnectionState = "not_configured" | "needs_auth" | "connected" | "error";

export interface DataSourceStatus {
  name: string;
  state: ConnectionState;
  detail: string;
  is_example: boolean;
}

export interface DataSourcesStatus {
  sources: DataSourceStatus[];
  warnings: { source: string; message: string }[];
  transaction_count: number;
}
