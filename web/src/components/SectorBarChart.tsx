import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SectorRow } from "../types";
import { money, pct } from "../format";
import { gridline, seriesColor, textMuted } from "../palette";

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: SectorRow = payload[0].payload;
  return (
    <div className="rounded-lg border border-ink-primary/10 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink-primary">{d.sector}</div>
      <div className="text-ink-secondary">
        {money(d.amount)} ({pct(d.pct).replace("+", "")})
      </div>
    </div>
  );
}

export function SectorBarChart({ rows }: { rows: SectorRow[] }) {
  const height = Math.max(240, rows.length * 32);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={gridline} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: textMuted }} tickLine={false} axisLine={{ stroke: gridline }} />
        <YAxis
          type="category"
          dataKey="sector"
          width={160}
          tick={{ fontSize: 12, fill: "rgb(var(--text-secondary))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: gridline, opacity: 0.4 }} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {rows.map((_, i) => (
            <Cell key={i} fill={seriesColor(1)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
