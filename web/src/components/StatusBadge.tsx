import type { ConnectionState } from "../types";

const LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  needs_auth: "Needs login",
  not_configured: "Not set up",
  error: "Error",
};

const DOT: Record<ConnectionState, string> = {
  connected: "bg-status-good",
  needs_auth: "bg-status-warning",
  not_configured: "bg-ink-muted",
  error: "bg-status-critical",
};

export function StatusBadge({ state }: { state: ConnectionState }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-primary/10 px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
      {LABELS[state]}
    </span>
  );
}
