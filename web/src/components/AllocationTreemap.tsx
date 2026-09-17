import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { Holding } from "../types";
import { money, pct } from "../format";
import { surface } from "../palette";

interface Node {
  name: string;
  ticker: string;
  size: number;
  unrealizedPct: number | null;
  isBond: boolean;
}

const GRADIENT_RANGE = 30; // ±30% unrealized maps to the fully-saturated ends
// A dedicated pale yellow for the diverging midpoint — matching the classic
// red-yellow-green scale (this is deliberately not one of the app's
// reserved status/categorical colors: it exists only as this scale's
// midpoint, the same way a sequential ramp's lightest step is its own
// thing rather than a reused token).
const MIDPOINT_YELLOW = "#f5eeb0";
const GRADIENT_CSS = `linear-gradient(to top, rgb(var(--status-critical)), ${MIDPOINT_YELLOW}, rgb(var(--status-good)))`;

/** Diverging by P&L polarity: good (green) at the top, critical (red) at
 * the bottom, blending through a pale yellow at 0% — the classic
 * red-yellow-green scale. Mixing red directly into green instead (no
 * middle stop) passes through a muddy olive/brown that's both ugly and
 * low-contrast for the label text on top of it. */
function colorForPct(p: number | null): string {
  if (p === null || Number.isNaN(p)) return "rgb(var(--text-muted))";
  const clamped = Math.max(-GRADIENT_RANGE, Math.min(GRADIENT_RANGE, p));
  const t = (Math.abs(clamped) / GRADIENT_RANGE) * 100; // 0 at center, 100 at the extreme
  const pole = clamped >= 0 ? "--status-good" : "--status-critical";
  return `color-mix(in srgb, ${MIDPOINT_YELLOW} ${100 - t}%, rgb(var(${pole})) ${t}%)`;
}

/** "Company Name (TICKER)", truncating the name (never the ticker) to fit
 * the cell's actual pixel width — the ticker alone isn't informative enough
 * on its own, so it's always kept, in brackets, alongside the real name. */
function cellLabel(name: string, ticker: string, width: number): string {
  const full = `${name} (${ticker})`;
  const maxChars = Math.max(6, Math.floor(width / 6.5));
  if (full.length <= maxChars) return full;
  const maxNameChars = Math.max(3, maxChars - ticker.length - 4);
  return `${name.slice(0, maxNameChars).trimEnd()}… (${ticker})`;
}

function CustomCell(props: any) {
  const { x, y, width, height, name, ticker, unrealizedPct, isBond, onSelect } = props;
  if (width < 2 || height < 2) return null;
  // Recharts' Treemap calls this content renderer for internal layout
  // nodes too (e.g. the implicit root), not just our actual data leaves —
  // those carry none of our custom fields, so name/ticker can be undefined
  // here even though every real leaf always has them.
  if (!name || !ticker) return null;
  const showLabel = width > 55 && height > 32;
  return (
    <g onClick={() => onSelect?.(ticker, isBond)} style={{ cursor: "pointer" }}>
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
        <text
          x={x + 8}
          y={y + 18}
          fontSize={12}
          fontWeight={700}
          fill="#fff"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {cellLabel(name, ticker, width)}
        </text>
      )}
      {showLabel && (
        <text
          x={x + 8}
          y={y + 34}
          fontSize={11}
          fontWeight={600}
          fill="#fff"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {pct(unrealizedPct)}
        </text>
      )}
    </g>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Node = payload[0].payload;
  if (!d?.name || !d?.ticker) return null;
  return (
    <div className="rounded-lg border border-ink-primary/10 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink-primary">
        {d.name} ({d.ticker})
      </div>
      <div className="mt-1 text-ink-secondary">Market value: {money(d.size)}</div>
      <div className="text-ink-secondary">Unrealized: {pct(d.unrealizedPct)}</div>
      <div className="mt-1 text-[10px] text-ink-muted">Click for details</div>
    </div>
  );
}

export function AllocationTreemap({
  holdings,
  onSelect,
}: {
  holdings: Holding[];
  onSelect: (ticker: string, isBond: boolean) => void;
}) {
  const data: Node[] = holdings
    .filter((h) => h.market_value !== null)
    .map((h) => ({
      name: h.name,
      ticker: h.ticker,
      size: h.market_value as number,
      unrealizedPct: h.unrealized_pct,
      isBond: h.is_bond,
    }));

  if (data.length === 0) {
    return <p className="text-sm text-ink-secondary">No live prices available yet for an allocation chart.</p>;
  }

  return (
    <div className="flex gap-4">
      <ResponsiveContainer width="100%" height={320} className="flex-1">
        <Treemap
          data={data}
          dataKey="size"
          stroke={surface}
          content={<CustomCell onSelect={onSelect} />}
          isAnimationActive={false}
        >
          <Tooltip content={<ChartTooltip />} />
        </Treemap>
      </ResponsiveContainer>

      <div className="flex w-16 shrink-0 flex-col items-center gap-1 py-1">
        <div className="flex flex-1 gap-1.5">
          <div className="w-3 rounded-full" style={{ background: GRADIENT_CSS }} />
          <div className="flex flex-col justify-between py-0.5 text-[10px] text-ink-muted">
            <span>+{GRADIENT_RANGE}%</span>
            <span>+{GRADIENT_RANGE / 2}%</span>
            <span>0%</span>
            <span>-{GRADIENT_RANGE / 2}%</span>
            <span>-{GRADIENT_RANGE}%</span>
          </div>
        </div>
        <span className="text-[10px] text-ink-muted">Unrealized</span>
      </div>
    </div>
  );
}
