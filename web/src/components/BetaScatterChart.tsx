import { CartesianGrid, Line, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { StockBeta } from "../types";
import { gridline, seriesColor, textMuted } from "../palette";

export function BetaScatterChart({ beta }: { beta: StockBeta }) {
  const points = beta.scatter.market_returns.map((m, i) => ({ market: m, stock: beta.scatter.stock_returns[i] }));
  const xs = points.map((p) => p.market);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const fitLine = [
    { market: min, fit: beta.alpha_daily + beta.beta * min },
    { market: max, fit: beta.alpha_daily + beta.beta * max },
  ];

  const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={gridline} />
        <XAxis
          type="number"
          dataKey="market"
          name={beta.benchmark_name}
          tickFormatter={pctFmt}
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={{ stroke: gridline }}
        />
        <YAxis
          type="number"
          dataKey="stock"
          name="Stock"
          tickFormatter={pctFmt}
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          formatter={(v: number) => pctFmt(v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          cursor={{ strokeDasharray: "3 3" }}
        />
        <Scatter data={points} fill={seriesColor(1)} fillOpacity={0.5} line={false} shape="circle" />
        <Line data={fitLine} dataKey="fit" stroke={seriesColor(8)} dot={false} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
