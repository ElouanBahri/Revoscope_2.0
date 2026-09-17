import { CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistory } from "../types";
import { money } from "../format";
import { gridline, seriesColor, statusCritical, statusGood, textMuted } from "../palette";

export function PriceHistoryChart({ history }: { history: PriceHistory }) {
  const data = history.dates.map((date, i) => ({ date, close: history.close[i] }));
  const buys = history.buys.map((b) => ({ date: b.date?.slice(0, 10), price: b.price }));
  const sells = history.sells.map((s) => ({ date: s.date?.slice(0, 10), price: s.price }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridline} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: textMuted }} tickLine={false} axisLine={{ stroke: gridline }} minTickGap={50} />
        <YAxis
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={false}
          width={64}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="close" name="Close price" stroke={seriesColor(1)} strokeWidth={2} dot={false} />
        <Scatter data={buys} dataKey="price" name="Buy" fill={statusGood} shape="triangle" />
        <Scatter data={sells} dataKey="price" name="Sell" fill={statusCritical} shape="triangle" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
