import { CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistory } from "../types";
import { money, shortDate } from "../format";
import { gridline, seriesColor, statusCritical, statusGood, textMuted } from "../palette";

function toTs(date: string | null | undefined): number | null {
  if (!date) return null;
  const ts = new Date(date).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function PriceHistoryChart({ history, chartKey }: { history: PriceHistory; chartKey?: string }) {
  // A category x-axis (Recharts' default for a string dataKey) shared
  // between a Line and Scatter series that each carry their own `data`
  // (the close-price line vs. the buy/sell markers) only picks up
  // categories from whichever series it resolves last — here that left
  // just the 5 buy/sell dates as the entire axis domain, so the 127-point
  // price line fell outside it and never rendered. A real numeric
  // (timestamp) axis is the standard fix for overlaying a line and a
  // scatter series together.
  const data = history.dates.map((date, i) => ({ ts: toTs(date), close: history.close[i] })).filter((d) => d.ts !== null);
  const tsValues = data.map((d) => d.ts as number);
  const [minTs, maxTs] = tsValues.length ? [Math.min(...tsValues), Math.max(...tsValues)] : [-Infinity, Infinity];
  // Recharts computes a shared numeric axis's "dataMin"/"dataMax" domain
  // from every series bound to it, not just the Line's — an out-of-range
  // trade marker (e.g. an April buy showing up on a "1D" chart) silently
  // stretches the whole axis to fit it, squashing the actual visible price
  // line into a sliver. A short range shouldn't be trying to plot an old
  // trade anyway, so this filters markers to the currently displayed
  // window rather than just clipping their symptom on the axis.
  const inRange = (ts: number | null) => ts !== null && ts >= minTs && ts <= maxTs;
  const buys = history.buys.map((b) => ({ ts: toTs(b.date), price: b.price })).filter((d) => inRange(d.ts));
  const sells = history.sells.map((s) => ({ ts: toTs(s.date), price: s.price })).filter((d) => inRange(d.ts));

  const formatTs = (ts: number) =>
    history.intraday
      ? new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : shortDate(new Date(ts).toISOString());

  return (
    <ResponsiveContainer width="100%" height={320}>
      {/* Keying the inner chart (not ResponsiveContainer itself) forces
          Recharts to recompute its axis/tick state on range change without
          also remounting ResponsiveContainer's ResizeObserver — remounting
          that too made it briefly see a 0-width container and never
          recover, collapsing every point onto a single x position. */}
      <ComposedChart key={chartKey} data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridline} vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="close" name="Close price" stroke={seriesColor(1)} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Scatter data={buys} dataKey="price" name="Buy" fill={statusGood} shape="triangle" />
        <Scatter data={sells} dataKey="price" name="Sell" fill={statusCritical} shape="triangle" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
