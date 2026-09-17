import type { Correlation } from "../types";

/** Correlation is a genuine polarity measure (-1..+1), so this uses the
 * palette's diverging pair (blue<->red) with a neutral gray midpoint —
 * unlike the treemap's P&L coloring, which uses the status good/critical
 * colors for a gain/loss state signal instead. */
function cellColor(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "rgb(var(--gridline))";
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) return `rgb(var(--series-8) / ${0.12 + t * 0.75})`;
  return `rgb(var(--series-1) / ${0.12 + -t * 0.75})`;
}

export function CorrelationHeatmap({ data }: { data: Correlation }) {
  const { tickers, matrix } = data;
  const cellSize = tickers.length > 8 ? 36 : 44;

  return (
    <div className="overflow-x-auto">
      <div
        className="inline-grid gap-[2px]"
        style={{ gridTemplateColumns: `${cellSize + 8}px repeat(${tickers.length}, ${cellSize}px)` }}
      >
        <div />
        {tickers.map((t) => (
          <div key={t} className="flex items-end justify-center pb-1 text-[10px] font-medium text-ink-secondary">
            {t}
          </div>
        ))}
        {tickers.map((rowTicker, i) => (
          <FragmentRow key={rowTicker} rowTicker={rowTicker} row={matrix[i]} tickers={tickers} cellSize={cellSize} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
        <span>-1</span>
        <div
          className="h-2 w-32 rounded-full"
          style={{
            background: "linear-gradient(to right, rgb(var(--series-1)), rgb(var(--gridline)), rgb(var(--series-8)))",
          }}
        />
        <span>+1</span>
      </div>
    </div>
  );
}

function FragmentRow({
  rowTicker,
  row,
  tickers,
  cellSize,
}: {
  rowTicker: string;
  row: (number | null)[];
  tickers: string[];
  cellSize: number;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-2 text-[10px] font-medium text-ink-secondary">{rowTicker}</div>
      {row.map((v, j) => (
        <div
          key={tickers[j]}
          title={`${rowTicker} vs ${tickers[j]}: ${v === null ? "n/a" : v.toFixed(2)}`}
          className="flex items-center justify-center rounded-sm text-[10px] font-medium tabular-nums text-ink-primary"
          style={{ height: cellSize, backgroundColor: cellColor(v) }}
        >
          {v !== null ? v.toFixed(2) : "—"}
        </div>
      ))}
    </>
  );
}
