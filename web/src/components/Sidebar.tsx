import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/news", label: "News" },
  { to: "/stocks", label: "Stock Detail" },
  { to: "/bonds", label: "Bond Detail" },
  { to: "/transactions", label: "Transactions" },
  { to: "/data-sources", label: "Data Sources" },
];

export function Sidebar() {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  // Held in memory only — never persisted, so closing the tab forgets it.
  const [pin, setPin] = useState("");
  const pinValid = /^\d{8}$/.test(pin);
  const fileInput = useRef<HTMLInputElement>(null);
  const status = useAsync(() => api.status(), [uploadMsg, refreshing]);

  async function onUpload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await api.uploadRevolutCsv(file, pin);
      setUploadMsg(res.detail ?? "Uploaded.");
    } catch (err) {
      setUploadMsg(`Upload failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await api.refresh(pin);
    } catch (err) {
      setRefreshMsg(`Refresh failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  const connectedCount = status.data?.sources.filter((s) => s.state === "connected").length ?? 0;

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-ink-primary/10 bg-surface px-4 py-5">
      <div className="mb-6 flex items-center justify-center rounded-card bg-white px-3 py-3">
        <img src="/logo-512.png" alt="revoscope — global data. smarter decisions." className="w-full max-w-[9rem]" />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-series-1/10 text-series-1" : "text-ink-secondary hover:bg-ink-primary/5"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 border-t border-ink-primary/10 pt-4">
        <label className="mb-1 block text-[11px] font-medium text-ink-muted" htmlFor="admin-pin">
          Admin PIN (owner only)
        </label>
        <input
          id="admin-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="8 digits"
          className="mb-2 w-full rounded-lg border border-ink-primary/10 bg-surface px-3 py-2 text-sm tracking-widest text-ink-primary placeholder:tracking-normal placeholder:text-ink-muted"
        />
        <input
          ref={fileInput}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || !pinValid}
          className="w-full rounded-lg bg-series-1 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload Revolut CSV"}
        </button>
        {uploadMsg && <p className="mt-2 text-xs leading-snug text-ink-secondary">{uploadMsg}</p>}

        <button
          onClick={onRefresh}
          disabled={refreshing || !pinValid}
          className="mt-2 w-full rounded-lg border border-ink-primary/10 px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-ink-primary/5 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh live data"}
        </button>
        {refreshMsg && <p className="mt-2 text-xs leading-snug text-ink-secondary">{refreshMsg}</p>}
      </div>

      <div className="mt-auto pt-4 text-[11px] text-ink-muted">
        <div>
          {connectedCount} data source{connectedCount === 1 ? "" : "s"} connected
        </div>
        <div className="mt-2">
          Built by <span className="font-medium text-ink-secondary">Elouan Bahri</span>
        </div>
        <a href="mailto:elouan.bahri1@berkeley.edu" className="text-series-1 hover:underline">
          elouan.bahri1@berkeley.edu
        </a>
      </div>
    </aside>
  );
}
