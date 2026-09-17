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
  const fileInput = useRef<HTMLInputElement>(null);
  const status = useAsync(() => api.status(), [uploadMsg, refreshing]);

  async function onUpload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await api.uploadRevolutCsv(file);
      setUploadMsg(res.detail ?? "Uploaded.");
    } catch (err) {
      setUploadMsg(`Upload failed: ${err}`);
    } finally {
      setUploading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await api.refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  const connectedCount = status.data?.sources.filter((s) => s.state === "connected").length ?? 0;

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-ink-primary/10 bg-surface px-4 py-5">
      <div className="mb-6 flex items-center gap-2 px-1">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <div>
          <div className="text-base font-semibold leading-tight text-ink-primary">revoscope</div>
          <div className="text-[11px] leading-tight text-ink-muted">2.0</div>
        </div>
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
        <input
          ref={fileInput}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg bg-series-1 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload Revolut CSV"}
        </button>
        {uploadMsg && <p className="mt-2 text-xs leading-snug text-ink-secondary">{uploadMsg}</p>}

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-2 w-full rounded-lg border border-ink-primary/10 px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-ink-primary/5 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh live data"}
        </button>
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
