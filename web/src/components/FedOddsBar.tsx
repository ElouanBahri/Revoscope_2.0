import { statusCritical, statusGood, textMuted } from "../palette";

export function FedOddsBar({ cut, hold, hike }: { cut: number; hold: number; hike: number }) {
  const segments = [
    { label: "Cut 25bp+", value: cut, color: statusGood },
    { label: "Hold", value: hold, color: textMuted },
    { label: "Hike 25bp+", value: hike, color: statusCritical },
  ];
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.value}%`, backgroundColor: s.color }}
            className="flex items-center justify-center text-[11px] font-medium text-white"
            title={`${s.label}: ${s.value.toFixed(0)}%`}
          >
            {s.value >= 8 ? `${s.value.toFixed(0)}%` : ""}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-ink-secondary">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
