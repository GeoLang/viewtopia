"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Cpu, HardDrive, Wifi } from "lucide-react";

interface ResourceStat {
  name: string;
  cpu: string;
  memory: string;
  memLimit: string;
  netIO: string;
}

export default function MetricsPage() {
  const [stats, setStats] = useState<ResourceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/metrics");
      const data = await res.json();
      setStats(data.stats);
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Resource Metrics</h1>
          <p className="text-muted-foreground mt-1">
            CPU, memory, and network usage per container
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated: {lastUpdated}
            </span>
          )}
          <button
            onClick={fetchStats}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading metrics...
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No containers running. Start the platform first.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map((s) => (
            <div
              key={s.name}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <h3 className="font-semibold text-sm truncate">{s.name}</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Cpu className="h-3 w-3" /> CPU
                  </div>
                  <div className="text-lg font-bold">{s.cpu}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <HardDrive className="h-3 w-3" /> Memory
                  </div>
                  <div className="text-lg font-bold">{s.memory}</div>
                  <div className="text-xs text-muted-foreground">
                    / {s.memLimit}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Wifi className="h-3 w-3" /> Net I/O
                  </div>
                  <div className="text-sm font-medium">{s.netIO}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
