import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { Holding } from "../types";
import { money, pct } from "../format";
import { surface, textPrimaryOnColor } from "../palette";

interface Node {
  name: string;
  ticker: string;
  size: number;
  unrealizedPct: number | null;
}

function colorForPct(p: number | null): string {
  if (p === null || Number.isNaN(p)) return "rgb(var(--text-muted))";
  // Diverging by P&L polarity, using the reserved status colors (gain =
  // good, loss = critical) rather than the generic blue<->red diverging
  // pair — P&L sign is a state signal here, the case the status palette
  // exists for. Magnitude within each side maps to opacity, not hue.
  const clamped = Math.max(-30, Math.min(30, p));
  const t = Math.abs(clamped) / 30;
  const variable = clamped >= 0 ? "--status-good" : "--status-critical";
  const opacity = 0.25 + t * 0.6;
  return `rgb(var(${variable}) / ${opacity})`;
}

function CustomCell(props: any) {
  const { x, y, width, height, name, ticker, unrealizedPct } = props;
  if (width < 2 || height < 2) return null;
  const showLabel = width > 55 && height > 32;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colorForPct(unrealizedPct)}
        stroke={surface}
        strokeWidth={2}
        rx={4}
      />
      {showLabel && (
        <text x={x + 8} y={y + 18} fontSize={12} fontWeight={600} fill={textPrimaryOnColor}>
          {name.length > 18 ? `${ticker}` : name}
        </text>
      )}
      {showLabel && (
        <text x={x + 8} y={y + 34} fontSize={11} fill={textPrimaryOnColor} opacity={0.8}>
          {pct(unrealizedPct)}
        </text>
      )}
    </g>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Node = payload[0].payload;
  return (
    <div className="rounded-lg border border-ink-primary/10 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink-primary">
        {d.name} ({d.ticker})
      </div>
      <div className="mt-1 text-ink-secondary">Market value: {money(d.size)}</div>
      <div className="text-ink-secondary">Unrealized: {pct(d.unrealizedPct)}</div>
    </div>
  );
}

export function AllocationTreemap({ holdings }: { holdings: Holding[] }) {
  const data: Node[] = holdings
    .filter((h) => h.market_value !== null)
    .map((h) => ({ name: h.name, ticker: h.ticker, size: h.market_value as number, unrealizedPct: h.unrealized_pct }));

  if (data.length === 0) {
    return <p className="text-sm text-ink-secondary">No live prices available yet for an allocation chart.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <Treemap data={data} dataKey="size" stroke={surface} content={<CustomCell />} isAnimationActive={false}>
        <Tooltip content={<ChartTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}
