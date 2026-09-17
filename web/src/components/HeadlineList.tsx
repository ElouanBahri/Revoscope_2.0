import type { Headline } from "../types";

export function HeadlineList({ headlines, emptyText = "No headlines available right now." }: { headlines: Headline[]; emptyText?: string }) {
  if (headlines.length === 0) return <p className="text-xs text-ink-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {headlines.map((h) => (
        <li key={h.url}>
          <a
            href={h.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-series-1 hover:underline"
          >
            {h.title}
          </a>
          <div className="text-[11px] text-ink-muted">
            {h.source} · {h.time_ago}
          </div>
        </li>
      ))}
    </ul>
  );
}
