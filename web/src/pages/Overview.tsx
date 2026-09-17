import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { StatTile, toneFromSign } from "../components/StatTile";
import { AllocationTreemap } from "../components/AllocationTreemap";
import { ComparisonLineChart } from "../components/ComparisonLineChart";
import { SectorBarChart } from "../components/SectorBarChart";
import { CorrelationHeatmap } from "../components/CorrelationHeatmap";
import { Table } from "../components/Table";
import { money, pct, qty } from "../format";
import type { Holding } from "../types";

export function Overview() {
  const navigate = useNavigate();
  const overview = useAsync(() => api.overview(), []);
  const holdings = useAsync(() => api.holdings(), []);
  const sectors = useAsync(() => api.sectors(), []);
  const benchmark = useAsync(() => api.benchmark(), []);
  const correlation = useAsync(() => api.correlation(), []);
  const status = useAsync(() => api.status(), []);

  if (overview.loading) return <p className="text-sm text-ink-secondary">Loading…</p>;
  if (overview.error) return <p className="text-sm text-status-critical">{overview.error}</p>;
  const o = overview.data;
  if (!o) return null;

  const usingExample = status.data?.sources.some((s) => s.name === "revolut_csv" && s.is_example) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Overview</h1>

      {usingExample && (
        <div className="rounded-card border border-series-1/30 bg-series-1/10 p-3 text-xs text-ink-secondary">
          👀 You're viewing an <span className="font-medium text-ink-primary">example portfolio</span> — real trades,
          in companies picked for demo purposes, so you can see how revoscope works. Upload your own Revolut CSV in
          the sidebar to see your own data instead.
        </div>
      )}

      {o.failed_price_tickers.length > 0 && (
        <div className="rounded-card border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-ink-secondary">
          Couldn't fetch a live price for: {o.failed_price_tickers.join(", ")}. Account value, unrealized P&L, and the
          charts below exclude them until the next successful fetch — try "Refresh live data" in the sidebar.
        </div>
      )}
      {o.unknown_transaction_types.length > 0 && (
        <div className="rounded-card border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-ink-secondary">
          Found transaction type(s) not recognized yet: {o.unknown_transaction_types.join(", ")}. Those rows are
          skipped, so positions/cash may be understated.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Account Value" value={money(o.account_value)} />
        <StatTile
          label="Unrealized P&L"
          value={money(o.unrealized_pnl)}
          delta={o.unrealized_pct !== null ? pct(o.unrealized_pct) : undefined}
          deltaTone={toneFromSign(o.unrealized_pnl)}
        />
        <StatTile label="Realized P&L" value={money(o.realized_pnl)} deltaTone={toneFromSign(o.realized_pnl)} />
        <StatTile label="Dividends Received" value={money(o.dividends)} />
        <StatTile label="Cash Balance" value={money(o.cash)} />
      </div>
      {o.open_bond_tickers.length > 0 && (
        <p className="text-xs text-ink-muted">
          Bonds ({o.open_bond_tickers.join(", ")}) in the figures above: US Treasuries are priced by discounting
          remaining cash flows at today's market yield; anything else falls back to par. See Bond Detail for terms.
        </p>
      )}

      <Card title="Allocation" caption="Click a holding for its full detail page.">
        {holdings.data && (
          <AllocationTreemap
            holdings={holdings.data}
            onSelect={(ticker, isBond) => navigate(isBond ? `/bonds/${ticker}` : `/stocks/${ticker}`)}
          />
        )}
      </Card>

      {benchmark.data && (
        <Card
          title={`What if you'd bought ${benchmark.data.benchmark_name} instead?`}
          caption={`Simulates putting every dollar you actually invested — same cost basis, same dates — into ${benchmark.data.benchmark_name} instead of your stock picks, since ${benchmark.data.start_date}.`}
        >
          <ComparisonLineChart
            dates={benchmark.data.dates}
            seriesA={benchmark.data.portfolio_value}
            seriesB={benchmark.data.benchmark_value}
            labelA="Your portfolio"
            labelB={`If ${benchmark.data.benchmark_name} instead`}
            valueFormatter={money}
            yTickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile label="Your portfolio" value={money(benchmark.data.final_portfolio)} />
            <StatTile label={`If ${benchmark.data.benchmark_name} instead`} value={money(benchmark.data.final_benchmark)} />
            <StatTile
              label="Difference"
              value={money((benchmark.data.final_portfolio ?? 0) - (benchmark.data.final_benchmark ?? 0))}
              deltaTone={toneFromSign((benchmark.data.final_portfolio ?? 0) - (benchmark.data.final_benchmark ?? 0))}
            />
          </div>
        </Card>
      )}

      <Card
        title="Sector Allocation"
        caption='Percentage of invested (non-cash) portfolio value per sector. "ETF & Others" covers funds; "Unknown" means a fetch gap, usually temporary.'
      >
        {sectors.data && <SectorBarChart rows={sectors.data} />}
      </Card>

      <Card title="Holdings">
        {holdings.data && (
          <Table<Holding>
            rowKey={(h) => h.ticker}
            onRowClick={(h) => navigate(h.is_bond ? `/bonds/${h.ticker}` : `/stocks/${h.ticker}`)}
            columns={[
              { key: "ticker", header: "Ticker", render: (h) => <span className="font-medium">{h.ticker}</span> },
              { key: "name", header: "Name", render: (h) => h.name },
              { key: "qty", header: "Quantity", align: "right", render: (h) => qty(h.quantity) },
              { key: "avg", header: "Avg Entry", align: "right", render: (h) => money(h.avg_entry) },
              { key: "price", header: "Current Price", align: "right", render: (h) => money(h.current_price) },
              { key: "mv", header: "Market Value", align: "right", render: (h) => money(h.market_value) },
              {
                key: "u",
                header: "Unrealized P&L",
                align: "right",
                render: (h) => (
                  <span
                    className={
                      h.unrealized_pnl === null
                        ? "text-ink-muted"
                        : h.unrealized_pnl < 0
                          ? "text-status-critical"
                          : "text-status-good"
                    }
                  >
                    {money(h.unrealized_pnl)}
                  </span>
                ),
              },
              { key: "up", header: "Unrealized %", align: "right", render: (h) => pct(h.unrealized_pct) },
              { key: "r", header: "Realized P&L", align: "right", render: (h) => money(h.realized_pnl) },
              { key: "d", header: "Dividends", align: "right", render: (h) => money(h.dividends) },
            ]}
            rows={holdings.data}
          />
        )}
        {o.closed_positions.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-ink-secondary">
              Closed positions ({o.closed_positions.length})
            </summary>
            <div className="mt-2">
              <Table
                rowKey={(c) => c.ticker}
                columns={[
                  { key: "t", header: "Ticker", render: (c) => c.ticker },
                  { key: "r", header: "Realized P&L", align: "right", render: (c) => money(c.realized_pnl) },
                  { key: "d", header: "Dividends", align: "right", render: (c) => money(c.dividends) },
                ]}
                rows={o.closed_positions}
              />
            </div>
          </details>
        )}
      </Card>

      {correlation.data && (
        <Card
          title="Stock Correlation"
          caption="Pairwise correlation of daily returns over the past year, for open stock/ETF positions only."
        >
          <CorrelationHeatmap data={correlation.data} />
        </Card>
      )}
    </div>
  );
}
