/** Chart color roles, referencing the CSS custom properties in index.css so
 * every chart automatically follows light/dark mode. Modern browsers resolve
 * var() inside SVG presentation attributes (fill/stroke), so these strings
 * can be passed straight to Recharts props. */
export const seriesColor = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => `rgb(var(--series-${n}))`;

export const statusGood = "rgb(var(--status-good))";
export const statusCritical = "rgb(var(--status-critical))";
export const statusWarning = "rgb(var(--status-warning))";
export const gridline = "rgb(var(--gridline))";
export const baseline = "rgb(var(--baseline))";
export const textSecondary = "rgb(var(--text-secondary))";
export const textMuted = "rgb(var(--text-muted))";
export const textPrimaryOnColor = "rgb(var(--text-primary))";
export const surface = "rgb(var(--surface-1))";

/** Fixed categorical order — never cycle/reassign by rank; a chart with more
 * series than slots should fold the remainder into "Other" or facet. */
export const CATEGORICAL = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => seriesColor(n as 1)) as string[];
