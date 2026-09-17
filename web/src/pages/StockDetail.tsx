import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { StatTile, toneFromSign } from "../components/StatTile";
import { PriceHistoryChart } from "../components/PriceHistoryChart";
import { BetaScatterChart } from "../components/BetaScatterChart";
import { ComparisonLineChart } from "../components/ComparisonLineChart";
import { Table } from "../components/Table";
import { money, pct, qty, shortDate } from "../format";
import { PRICE_HISTORY_RANGES, type PriceHistoryRange, type Trade } from "../types";

export function StockDetail() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const list = useAsync(() => api.stockList(), []);
  const [range, setRange] = useState<PriceHistoryRange>("6M");

  useEffect(() => {
    if (!ticker && list.data && list.data.length > 0) {
      navigate(`/stocks/${list.data[0]}`, { replace: true });
    }
  }, [ticker, list.data, navigate]);

  const detail = useAsync(() => (ticker ? api.stockDetail(ticker) : Promise.resolve(null)), [ticker]);
  const beta = useAsync(() => (ticker ? api.stockBeta(ticker) : Promise.resolve(null)), [ticker]);
  const sinceInvested = useAsync(() => (ticker ? api.stockSinceInvested(ticker) : Promise.resolve(null)), [ticker]);
  const priceHistory = useAsync(() => (ticker ? api.stockPriceHistory(ticker, range) : Promise.resolve(null)), [ticker, range]);
  const trades = useAsync(() => (ticker ? api.stockTrades(ticker) : Promise.resolve(null)), [ticker]);

  if (list.data && list.data.length === 0) {
    return <p className="text-sm text-ink-secondary">No stock/ETF positions yet — upload a CSV or connect a data source.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Stock Detail</h1>
        <select
          value={ticker ?? ""}
          onChange={(e) => navigate(`/stocks/${e.target.value}`)}
          className="rounded-lg border border-ink-primary/10 bg-surface px-3 py-1.5 text-sm text-ink-primary"
        >
          {list.data?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {detail.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile label="Quantity Held" value={qty(detail.data.quantity)} />
            <StatTile label="Avg Entry Price" value={money(detail.data.avg_entry)} />
            <StatTile label="Current Price" value={money(detail.data.current_price)} />
            <StatTile
              label="Unrealized P&L"
              value={money(detail.data.unrealized_pnl)}
              delta={detail.data.unrealized_pct !== null ? pct(detail.data.unrealized_pct) : undefined}
              deltaTone={toneFromSign(detail.data.unrealized_pnl)}
            />
            <StatTile
              label="Realized P&L"
              value={money(detail.data.realized_pnl)}
              delta={detail.data.realized_pct !== null ? pct(detail.data.realized_pct) : undefined}
              deltaTone={toneFromSign(detail.data.realized_pnl)}
            />
          </div>
          <p className="text-xs text-ink-muted">Dividends received: {money(detail.data.dividends)}</p>

          <Card title="Capital invested" caption="Unrealized/Realized % here are both against total capital ever invested in this stock.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Total Invested (all-time)" value={money(detail.data.total_invested)} />
              <StatTile label="Currently Invested" value={money(detail.data.currently_invested)} />
              <StatTile
                label="Unrealized P&L"
                value={money(detail.data.unrealized_pnl)}
                delta={detail.data.unrealized_pct_of_total_invested !== null ? pct(detail.data.unrealized_pct_of_total_invested) : undefined}
                deltaTone={toneFromSign(detail.data.unrealized_pnl)}
              />
              <StatTile
                label="Realized P&L"
                value={money(detail.data.realized_pnl)}
                delta={detail.data.realized_pct_of_total_invested !== null ? pct(detail.data.realized_pct_of_total_invested) : undefined}
                deltaTone={toneFromSign(detail.data.realized_pnl)}
              />
            </div>
          </Card>
        </>
      )}

      {beta.data && (
        <Card
          title={`Beta vs ${beta.data.benchmark_name}`}
          caption={`OLS regression of ${ticker}'s daily returns on ${beta.data.benchmark_name}'s daily returns over the trailing year. Beta above 1 means historically more volatile than the market; below 1, less.`}
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <StatTile label="Beta" value={beta.data.beta.toFixed(2)} />
            <StatTile label="Alpha (daily)" value={`${(beta.data.alpha_daily * 100).toFixed(3)}%`} />
            <StatTile label="R²" value={beta.data.r_squared.toFixed(2)} />
          </div>
          <BetaScatterChart beta={beta.data} />
        </Card>
      )}

      {sinceInvested.data && (
        <Card
          title={`${ticker} vs ${sinceInvested.data.benchmark_name} since your first trade`}
          caption={`Price only (excludes dividends), indexed to 100 on ${sinceInvested.data.start_date} — your first trade. Assumes a single buy-and-hold from that date.`}
        >
          <ComparisonLineChart
            dates={sinceInvested.data.dates}
            seriesA={sinceInvested.data.stock_index}
            seriesB={sinceInvested.data.benchmark_index}
            labelA={ticker ?? ""}
            labelB={sinceInvested.data.benchmark_name}
            valueFormatter={(v) => v.toFixed(1)}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label={ticker ?? ""} value={pct(sinceInvested.data.stock_return_pct)} deltaTone={toneFromSign(sinceInvested.data.stock_return_pct)} />
            <StatTile
              label={sinceInvested.data.benchmark_name}
              value={pct(sinceInvested.data.benchmark_return_pct)}
              deltaTone={toneFromSign(sinceInvested.data.benchmark_return_pct)}
            />
          </div>
        </Card>
      )}

      <Card
        title={`${ticker} price history with your trades`}
        action={
          <div className="flex gap-0.5 rounded-lg border border-ink-primary/10 p-0.5">
            {PRICE_HISTORY_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  range === r ? "bg-series-1 text-white" : "text-ink-secondary hover:bg-ink-primary/5"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      >
        {priceHistory.data ? (
          // key={range} forces a clean remount on range change — Recharts
          // doesn't reliably recompute its internal axis/tick state from a
          // changed `data` prop alone (a known gotcha with a numeric
          // domain=["dataMin","dataMax"] axis), so without this the chart
          // can keep showing the previous range's shape and tick labels
          // even though the correct new data already arrived.
          <PriceHistoryChart key={range} history={priceHistory.data} />
        ) : (
          <p className="text-sm text-ink-secondary">Loading…</p>
        )}
      </Card>

      {trades.data && (
        <Card title="Trade history">
          <Table<Trade>
            rowKey={(t, i) => `${t.date}-${i}`}
            columns={[
              { key: "date", header: "Date", render: (t) => shortDate(t.date) },
              { key: "type", header: "Type", render: (t) => t.type },
              { key: "qty", header: "Quantity", align: "right", render: (t) => qty(t.quantity) },
              { key: "price", header: "Price", align: "right", render: (t) => money(t.price_usd) },
              { key: "amount", header: "Amount", align: "right", render: (t) => money(t.amount_usd) },
            ]}
            rows={trades.data}
          />
        </Card>
      )}
    </div>
  );
}
