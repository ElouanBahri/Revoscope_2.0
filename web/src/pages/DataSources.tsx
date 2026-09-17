import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";

const SETUP_NOTES: Record<string, { title: string; steps: string[] }> = {
  revolut_csv: {
    title: "Revolut (CSV export)",
    steps: [
      "In the Revolut app: Invest → Statements → Export → CSV.",
      "Upload it from the sidebar's \"Upload Revolut CSV\" button.",
      "The file is only held in this API process's memory — nothing is written to disk or committed to git.",
    ],
  },
  binance: {
    title: "Binance",
    steps: [
      "Create a Testnet account + API key at testnet.binance.vision (or a real, read-only key for a live account).",
      "Set BINANCE_API_KEY / BINANCE_API_SECRET in API/.env (copy API/.env.example).",
      "Set BINANCE_TESTNET=false only once you're intentionally pointing this at a live account.",
      "Restart the API — it reads .env once on startup.",
    ],
  },
  ibkr: {
    title: "Interactive Brokers",
    steps: [
      "Download and start IBKR's Client Portal Gateway (a small local Java process).",
      "Open https://localhost:5000 in a browser and log in there — this app never sees your IBKR credentials or 2FA.",
      "That login session is what \"Needs login\" below is waiting on; it re-checks automatically.",
      "On macOS, note port 5000 is also AirPlay Receiver's default — turn that off (System Settings → General → AirDrop & Handoff) or run the gateway on another port via IBKR_GATEWAY_URL in API/.env.",
    ],
  },
};

export function DataSources() {
  const status = useAsync(() => api.status(), []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Data Sources</h1>
      <p className="text-sm text-ink-secondary">
        Every connected source's transactions are merged into one portfolio. A source that's off is simply skipped;
        one that's misconfigured shows a warning here without breaking the rest of the app.
      </p>

      {status.data?.warnings.map((w) => (
        <div key={w.source} className="rounded-card border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-ink-secondary">
          <span className="font-medium">{w.source}:</span> {w.message}
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {status.data?.sources.map((s) => {
          const notes = SETUP_NOTES[s.name];
          return (
            <Card key={s.name} title={notes?.title ?? s.name}>
              <div className="mb-3">
                <StatusBadge state={s.state} />
              </div>
              <p className="mb-3 text-xs text-ink-secondary">{s.detail}</p>
              {notes && (
                <ol className="list-decimal space-y-1.5 pl-4 text-xs text-ink-muted">
                  {notes.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
