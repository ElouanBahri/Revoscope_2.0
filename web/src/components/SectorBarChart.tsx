import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SectorRow } from "../types";
import { money, pct } from "../format";
import { gridline, seriesColor, textMuted } from "../palette";

const MUTED = "rgb(var(--text-muted) / 0.35)";

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

/** One fixed categorical color per non-zero sector, in slot order — never
 * cycled, per the palette's fixed-order rule. A sector with nothing
 * allocated to it gets a low-emphasis neutral instead of competing for a
 * hue slot; past the 8 available slots (rare — more sectors held than the
 * palette has hues), further sectors also fall back to that same neutral
 * rather than reusing an earlier hue. */
function colorsFor(rows: SectorRow[]): string[] {
  let slot = 0;
  return rows.map((r) => {
    if (r.amount <= 0) return MUTED;
    slot += 1;
    return slot <= 8 ? seriesColor(slot as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) : MUTED;
  });
}

export function SectorBarChart({ rows }: { rows: SectorRow[] }) {
  const height = Math.max(240, rows.length * 32);
  const colors = colorsFor(rows);
  const legendRows = rows.filter((r) => r.amount > 0);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <ResponsiveContainer width="100%" height={height} className="flex-1">
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
              <Cell key={i} fill={colors[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {legendRows.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5 pt-1 md:w-40">
          {legendRows.map((r) => (
            <div key={r.sector} className="flex items-center gap-2 text-xs text-ink-secondary">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[rows.indexOf(r)] }} />
              <span className="truncate">{r.sector}</span>
              <span className="ml-auto shrink-0 tabular-nums text-ink-muted">{r.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
