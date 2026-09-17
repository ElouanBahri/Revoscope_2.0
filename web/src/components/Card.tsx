import type { ReactNode } from "react";

export function Card({
  title,
  caption,
  action,
  children,
  className = "",
}: {
  title?: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-ink-primary/10 bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-1 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>}
          {action}
        </div>
      )}
      {caption && <p className="mb-4 text-xs leading-relaxed text-ink-secondary">{caption}</p>}
      {children}
    </section>
  );
}
