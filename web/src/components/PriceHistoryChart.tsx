import { CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistory } from "../types";
import { money, shortDate } from "../format";
import { gridline, seriesColor, statusCritical, statusGood, textMuted } from "../palette";

function toTs(date: string | null | undefined): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function PriceHistoryChart({ history }: { history: PriceHistory }) {
  // A category x-axis (Recharts' default for a string dataKey) shared
  // between a Line and Scatter series that each carry their own `data`
  // (the close-price line vs. the buy/sell markers) only picks up
  // categories from whichever series it resolves last — here that left
  // just the 5 buy/sell dates as the entire axis domain, so the 127-point
  // price line fell outside it and never rendered. A real numeric
  // (timestamp) axis is the standard fix for overlaying a line and a
  // scatter series together.
  const data = history.dates.map((date, i) => ({ ts: toTs(date), close: history.close[i] })).filter((d) => d.ts !== null);
  const buys = history.buys.map((b) => ({ ts: toTs(b.date), price: b.price })).filter((d) => d.ts !== null);
  const sells = history.sells.map((s) => ({ ts: toTs(s.date), price: s.price })).filter((d) => d.ts !== null);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridline} vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(ts: number) => shortDate(new Date(ts).toISOString())}
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={{ stroke: gridline }}
          minTickGap={50}
        />
        <YAxis
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={false}
          width={64}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          labelFormatter={(ts: number) => shortDate(new Date(ts).toISOString())}
          formatter={(v: number) => money(v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="close" name="Close price" stroke={seriesColor(1)} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Scatter data={buys} dataKey="price" name="Buy" fill={statusGood} shape="triangle" />
        <Scatter data={sells} dataKey="price" name="Sell" fill={statusCritical} shape="triangle" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
