import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { HeadlineList } from "../components/HeadlineList";
import { FedOddsBar } from "../components/FedOddsBar";
import type { EconomyOverview } from "../types";

function meetingDelta(meeting: EconomyOverview["next_fomc"]): string | undefined {
  if (!meeting) return undefined;
  return meeting.days_until >= 0 ? `in ${meeting.days_until}d` : "underway / just concluded";
}

export function News() {
  const economy = useAsync(() => api.economyNews(), []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">News</h1>

      <Card
        title="🏛️ Economic & Politics News"
        caption="Current policy rates and each central bank's next scheduled meeting, plus recent macro and political headlines. Rates refresh hourly; headlines every 15 minutes. Per-holding news now lives on each stock's own Stock Detail page."
      >
        {economy.loading && <p className="text-sm text-ink-secondary">Loading…</p>}
        {economy.data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Fed Funds Target Range" value={economy.data.fed_rate?.display ?? "n/a"} />
              <StatTile
                label="Next FOMC Meeting"
                value={economy.data.next_fomc ? `${economy.data.next_fomc.start} → ${economy.data.next_fomc.end}` : "Not on file"}
                delta={meetingDelta(economy.data.next_fomc)}
              />
              <StatTile label="ECB Deposit Rate" value={economy.data.ecb_rate?.display ?? "n/a"} />
              <StatTile
                label="Next ECB Meeting"
                value={economy.data.next_ecb ? `${economy.data.next_ecb.start} → ${economy.data.next_ecb.end}` : "Not on file"}
                delta={meetingDelta(economy.data.next_ecb)}
              />
            </div>

            {economy.data.fed_odds ? (
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold text-ink-primary">Fed Rate Decision Odds — next meeting</div>
                <FedOddsBar {...economy.data.fed_odds.average} />
                <p className="mt-2 text-[11px] text-ink-muted">
                  Average of {economy.data.fed_odds.sources.length} live source(s):{" "}
                  {economy.data.fed_odds.sources
                    .map((s) => `${s.source_name} (cut ${s.cut.toFixed(0)}% / hold ${s.hold.toFixed(0)}% / hike ${s.hike.toFixed(0)}%)`)
                    .join(" · ")}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-ink-muted">Fed rate-move odds unavailable right now.</p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(economy.data.regions).map(([key, region]) => (
                <div key={key}>
                  <div className="mb-2 text-xs font-semibold text-ink-primary">{region.label}</div>
                  <HeadlineList headlines={region.headlines} />
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
