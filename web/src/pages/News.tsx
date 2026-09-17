import { useState } from "react";
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
  const [selectedTicker, setSelectedTicker] = useState<string>("__all__");
  const news = useAsync(() => api.portfolioNews(selectedTicker === "__all__" ? undefined : selectedTicker), [selectedTicker]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">News</h1>

      <Card
        title="🌍 Economy Overview"
        caption="Current policy rates and each central bank's next scheduled meeting, plus recent macro headlines. Rates refresh hourly; headlines every 15 minutes."
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

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
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

      <Card
        title="📁 Your Portfolio News"
        caption="Recent headlines for each open position, pulled from Yahoo Finance's per-security news feed."
        action={
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="rounded-lg border border-ink-primary/10 bg-surface px-2 py-1 text-xs text-ink-primary"
          >
            <option value="__all__">All holdings</option>
            {news.data?.map((n) => (
              <option key={n.ticker} value={n.ticker}>
                {n.ticker}
              </option>
            ))}
          </select>
        }
      >
        {news.loading && <p className="text-sm text-ink-secondary">Loading…</p>}
        {news.data?.length === 0 && <p className="text-xs text-ink-muted">No open positions to show news for.</p>}
        <div className="flex flex-col gap-5">
          {news.data
            ?.filter((n) => n.headlines.length > 0 || n.is_bond)
            .map((n) => (
              <div key={n.ticker}>
                <div className="mb-1 text-xs font-semibold text-ink-primary">
                  {n.ticker} — {n.name}
                </div>
                {n.is_bond ? (
                  <p className="text-xs text-ink-muted">
                    No news feed available for bonds — Yahoo Finance doesn't index bond CUSIPs/ISINs.
                  </p>
                ) : (
                  <HeadlineList headlines={n.headlines} />
                )}
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
