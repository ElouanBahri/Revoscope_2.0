import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./pages/Overview";
import { News } from "./pages/News";
import { StockDetail } from "./pages/StockDetail";
import { BondDetail } from "./pages/BondDetail";
import { Transactions } from "./pages/Transactions";
import { DataSources } from "./pages/DataSources";

export default function App() {
  return (
    <div className="flex min-h-screen bg-plane">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/news" element={<News />} />
          <Route path="/stocks" element={<StockDetail />} />
          <Route path="/stocks/:ticker" element={<StockDetail />} />
          <Route path="/bonds" element={<BondDetail />} />
          <Route path="/bonds/:ticker" element={<BondDetail />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/data-sources" element={<DataSources />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
