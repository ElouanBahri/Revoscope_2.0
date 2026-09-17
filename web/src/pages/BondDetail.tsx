import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { Table } from "../components/Table";
import { money, qty, shortDate } from "../format";
import { gridline, statusGood, textMuted } from "../palette";
import type { Trade } from "../types";

export function BondDetail() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const list = useAsync(() => api.bondList(), []);

  useEffect(() => {
    if (!ticker && list.data && list.data.length > 0) {
      navigate(`/bonds/${list.data[0]}`, { replace: true });
    }
  }, [ticker, list.data, navigate]);

  const detail = useAsync(() => (ticker ? api.bondDetail(ticker) : Promise.resolve(null)), [ticker]);

  if (list.data && list.data.length === 0) {
    return <p className="text-sm text-ink-secondary">No bond positions in this portfolio.</p>;
  }

  const c = detail.data?.characteristics;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Bond Detail</h1>
        <select
          value={ticker ?? ""}
          onChange={(e) => navigate(`/bonds/${e.target.value}`)}
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Status" value={detail.data.status} />
            <StatTile label="Quantity Held" value={detail.data.quantity !== null ? qty(detail.data.quantity) : "—"} />
            <StatTile label="Coupon Income" value={money(detail.data.coupon_income)} />
            <StatTile label="Realized P&L" value={money(detail.data.realized_pnl)} />
          </div>

          {c && (
            <Card
              title="Bond characteristics"
              caption={
                c.source === "treasury"
                  ? `Real terms from the U.S. Treasury's public Fiscal Data API, looked up by CUSIP (${c.cusip}).`
                  : "No Treasury record found (not a US Treasury security, or a corporate/foreign bond). Figures are estimated from your own coupon payment history — treat them as approximate."
              }
            >
              {c.source === "treasury" ? (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatTile label="Type" value={`${c.security_type} (${c.security_term})`} />
                    <StatTile label="Maturity" value={shortDate(c.maturity_date)} />
                    <StatTile label="Coupon Rate" value={`${c.coupon_rate?.toFixed(3)}%`} />
                    <StatTile
                      label="Payment Frequency"
                      value={c.payments_per_year === 0 ? "None (zero-coupon)" : `${c.payments_per_year}x / yr`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Issued {shortDate(c.issue_date)}
                    {c.yield_at_auction ? ` · Auction high yield ${c.yield_at_auction.toFixed(3)}%` : ""}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <StatTile
                      label="Est. Market Price"
                      value={c.market_price !== null && c.market_price !== undefined ? c.market_price.toFixed(2) : "n/a"}
                      delta={
                        c.market_price !== null && c.market_price !== undefined
                          ? `${(c.market_price - c.face_value >= 0 ? "+" : "")}${(c.market_price - c.face_value).toFixed(2)} vs. par`
                          : undefined
                      }
                    />
                    <StatTile label="Face Value (Par)" value={c.face_value.toFixed(2)} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <StatTile label="Face Value (assumed)" value={money(c.face_value)} />
                  <StatTile label="Est. Coupon Rate" value={c.coupon_rate !== null ? `${c.coupon_rate.toFixed(3)}%` : "Not enough data"} />
                  <StatTile label="Maturity" value={c.maturity_date ? `${shortDate(c.maturity_date)} (redeemed)` : "Unknown — still open"} />
                </div>
              )}
            </Card>
          )}

          {detail.data.duration && (
            <Card
              title="Duration"
              caption="Based on the security's original terms and its issue-time yield, not a live market price — there's no free live pricing source for individual bond CUSIPs."
            >
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Macaulay Duration" value={`${detail.data.duration.macaulay_years.toFixed(2)} yrs`} />
                <StatTile label="Modified Duration" value={`${detail.data.duration.modified_years.toFixed(2)} yrs`} />
              </div>
            </Card>
          )}

          {detail.data.cash_flow_schedule && detail.data.cash_flow_schedule.length > 0 && (
            <Card title="Cash flow schedule">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={detail.data.cash_flow_schedule} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={gridline} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: textMuted }} tickLine={false} axisLine={{ stroke: gridline }} />
                  <YAxis tick={{ fontSize: 11, fill: textMuted }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="amount" name="Per unit" fill={statusGood} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Table
                rowKey={(r, i) => `${r.date}-${i}`}
                columns={[
                  { key: "date", header: "Date", render: (r) => shortDate(r.date) },
                  { key: "amount", header: "Per Unit", align: "right", render: (r) => money(r.amount) },
                  { key: "type", header: "Type", render: (r) => r.type },
                  { key: "status", header: "Status", render: (r) => r.status },
                ]}
                rows={detail.data.cash_flow_schedule}
              />
            </Card>
          )}

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
              rows={detail.data.trades}
            />
          </Card>
        </>
      )}
    </div>
  );
}
