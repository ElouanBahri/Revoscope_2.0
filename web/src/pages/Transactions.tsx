import { useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../hooks";
import { Card } from "../components/Card";
import { Table } from "../components/Table";
import { money, qty, shortDate } from "../format";
import type { TransactionRow } from "../types";

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-secondary">
      {label}
      <select
        multiple
        value={selected}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
        className="h-24 min-w-[10rem] rounded-lg border border-ink-primary/10 bg-surface px-2 py-1 text-sm text-ink-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Transactions() {
  const [types, setTypes] = useState<string[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const data = useAsync(() => api.transactions(types, tickers), [types, tickers]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Transactions</h1>
      <Card
        title="Full transaction log"
        caption="Price/Amount are as recorded, in the trade's own currency; Amount (USD) is converted at that day's actual exchange rate — the figure used everywhere else in this app."
      >
        {data.data && (
          <>
            <div className="mb-4 flex flex-wrap gap-4">
              <MultiSelect label="Filter by type" options={data.data.types} selected={types} onChange={setTypes} />
              <MultiSelect label="Filter by ticker" options={data.data.tickers} selected={tickers} onChange={setTickers} />
            </div>
            <Table<TransactionRow>
              rowKey={(r, i) => `${r.date}-${i}`}
              columns={[
                { key: "date", header: "Date", render: (r) => shortDate(r.date) },
                { key: "ticker", header: "Ticker", render: (r) => r.ticker ?? "—" },
                { key: "type", header: "Type", render: (r) => r.type },
                { key: "qty", header: "Quantity", align: "right", render: (r) => qty(r.quantity) },
                { key: "price", header: "Price", align: "right", render: (r) => (r.price !== null ? r.price.toFixed(2) : "—") },
                { key: "amount", header: "Amount", align: "right", render: (r) => (r.amount !== null ? r.amount.toFixed(2) : "—") },
                { key: "currency", header: "Currency", render: (r) => r.currency },
                { key: "amount_usd", header: "Amount (USD)", align: "right", render: (r) => money(r.amount_usd) },
              ]}
              rows={data.data.rows}
            />
          </>
        )}
      </Card>
    </div>
  );
}
