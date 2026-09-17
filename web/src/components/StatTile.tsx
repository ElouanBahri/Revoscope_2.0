export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  help,
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaTone?: "good" | "bad" | "neutral";
  help?: string;
}) {
  const deltaColor =
    deltaTone === "good" ? "text-status-good" : deltaTone === "bad" ? "text-status-critical" : "text-ink-secondary";
  return (
    <div className="rounded-card border border-ink-primary/10 bg-surface p-4" title={help}>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 tabular-nums text-xl font-semibold text-ink-primary">{value}</div>
      {delta && <div className={`mt-0.5 tabular-nums text-xs font-medium ${deltaColor}`}>{delta}</div>}
    </div>
  );
}

/** Convenience: derive good/bad tone from the sign of a P&L-like number. */
export function toneFromSign(value: number | null | undefined): "good" | "bad" | "neutral" {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  return value >= 0 ? "good" : "bad";
}
