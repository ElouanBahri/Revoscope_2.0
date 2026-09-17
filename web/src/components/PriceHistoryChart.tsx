import { CartesianGrid, Legend, Line, ComposedChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistory } from "../types";
import { money, shortDate } from "../format";
import { gridline, seriesColor, statusCritical, statusGood, textMuted } from "../palette";

function toTs(date: string | null | undefined): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function PriceHistoryChart({ history, chartKey }: { history: PriceHistory; chartKey?: string }) {
  const data = history.dates.map((date, i) => ({ ts: toTs(date), close: history.close[i] })).filter((d) => d.ts !== null);
  const tsValues = data.map((d) => d.ts as number);
  const [minTs, maxTs] = tsValues.length ? [Math.min(...tsValues), Math.max(...tsValues)] : [-Infinity, Infinity];
  const inRange = (ts: number | null) => ts !== null && ts >= minTs && ts <= maxTs;
  const buys = history.buys.map((b) => ({ ts: toTs(b.date), price: b.price })).filter((d) => inRange(d.ts));
  const sells = history.sells.map((s) => ({ ts: toTs(s.date), price: s.price })).filter((d) => inRange(d.ts));

  const formatTs = (ts: number) =>
    history.intraday
      ? new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : shortDate(new Date(ts).toISOString());

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart key={chartKey} data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridline} vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={[minTs, maxTs]}
          tickFormatter={formatTs}
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
          labelFormatter={formatTs}
          formatter={(v: number) => money(v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          payload={[
            { value: "Close price", type: "line", color: seriesColor(1) },
            { value: "Buy", type: "triangle", color: statusGood },
            { value: "Sell", type: "triangle", color: statusCritical },
          ]}
        />
        <Line type="monotone" dataKey="close" name="Close price" stroke={seriesColor(1)} strokeWidth={2} dot={false} isAnimationActive={false} />
        {/* ReferenceDot draws directly on the chart's own established
            x/y scale instead of contributing a separate data series to
            axis domain calculation — Scatter (its natural alternative for
            this) kept corrupting the shared numeric time-axis domain on
            every range change no matter how the domain/keys were tuned,
            collapsing the whole line onto a sliver or a single point. */}
        {buys.map((b, i) => (
          <ReferenceDot key={`buy-${i}`} x={b.ts as number} y={b.price ?? undefined} r={6} fill={statusGood} stroke="none" isFront />
        ))}
        {sells.map((s, i) => (
          <ReferenceDot key={`sell-${i}`} x={s.ts as number} y={s.price ?? undefined} r={6} fill={statusCritical} stroke="none" isFront />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
