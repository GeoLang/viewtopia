"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";

const SERVICE_OPTIONS = [
  { value: "db", label: "PostGIS" },
  { value: "ptolemy", label: "Ptolemy" },
  { value: "tiletopia", label: "TileTopia" },
  { value: "geokode", label: "Geokode" },
  { value: "itinera", label: "Itinera" },
  { value: "geolang-api", label: "GeoLang AI" },
  { value: "sibyl", label: "Sibyl" },
  { value: "viewtopia", label: "ViewTopia" },
];

export default function LogsPage() {
  const [selectedService, setSelectedService] = useState("ptolemy");
  const [tail, setTail] = useState(100);
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/logs?service=${selectedService}&tail=${tail}`
      );
      const data = await res.json();
      setLogs(data.logs || data.error || "No logs available");
    } catch {
      setLogs("Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Service Logs</h1>
        <p className="text-muted-foreground mt-1">
          View container logs from running services
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          className="px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
        >
          {SERVICE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={tail}
          onChange={(e) => setTail(parseInt(e.target.value))}
          className="px-3 py-2 rounded-md border border-border bg-card text-foreground text-sm"
        >
          <option value={50}>Last 50 lines</option>
          <option value={100}>Last 100 lines</option>
          <option value={500}>Last 500 lines</option>
          <option value={1000}>Last 1000 lines</option>
        </select>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Fetch Logs
        </button>
      </div>

      {/* Log output */}
      <div className="rounded-lg border border-border bg-black/50 p-4 font-mono text-xs leading-relaxed overflow-auto max-h-[70vh] whitespace-pre-wrap">
        {logs || (
          <span className="text-muted-foreground">
            Select a service and click &quot;Fetch Logs&quot; to view output.
          </span>
        )}
      </div>
    </div>
  );
}
