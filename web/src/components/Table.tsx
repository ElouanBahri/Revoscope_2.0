import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function Table<T>({ columns, rows, onRowClick, rowKey }: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-primary/10 text-left text-[11px] uppercase tracking-wide text-ink-muted">
            {columns.map((c) => (
              <th key={c.key} className={`py-2 pr-4 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-ink-primary/5 tabular-nums ${
                onRowClick ? "cursor-pointer hover:bg-ink-primary/5" : ""
              }`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`py-2 pr-4 text-ink-primary ${c.align === "right" ? "text-right" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-ink-muted">
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
