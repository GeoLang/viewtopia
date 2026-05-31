"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, XCircle, Clock, RefreshCw } from "lucide-react";

interface ServiceHealth {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  latency?: number;
  containerState?: string;
}

export default function StatusPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState("");

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setServices(data.services);
      setLastChecked(new Date(data.timestamp).toLocaleTimeString());
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }

  const allOperational = services.every((s) => s.status === "operational");
  const anyDown = services.some((s) => s.status === "down");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Platform Status</h1>
          <p className="text-muted-foreground mt-1">
            Real-time health of GeoLang services
          </p>
        </div>
        <button
          onClick={checkHealth}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Overall status banner */}
      {!loading && (
        <div
          className={`rounded-lg border p-6 ${
            allOperational
              ? "border-green-500/30 bg-green-500/5"
              : anyDown
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            {allOperational ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : anyDown ? (
              <XCircle className="h-8 w-8 text-red-500" />
            ) : (
              <AlertCircle className="h-8 w-8 text-amber-500" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {allOperational
                  ? "All Systems Operational"
                  : anyDown
                    ? "Some Services Down"
                    : "Some Services Degraded"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {lastChecked ? `Last checked: ${lastChecked}` : "Checking..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Individual services */}
      <div className="space-y-3">
        {services.map((svc) => (
          <div
            key={svc.id}
            className="rounded-lg border border-border bg-card px-5 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              {svc.status === "operational" && (
                <span className="h-3 w-3 rounded-full bg-green-500" />
              )}
              {svc.status === "degraded" && (
                <span className="h-3 w-3 rounded-full bg-amber-500" />
              )}
              {svc.status === "down" && (
                <span className="h-3 w-3 rounded-full bg-red-500" />
              )}
              <div>
                <span className="font-medium">{svc.name}</span>
                {svc.containerState && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({svc.containerState})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {svc.latency !== undefined && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {svc.latency}ms
                </span>
              )}
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  svc.status === "operational"
                    ? "bg-green-500/10 text-green-400"
                    : svc.status === "degraded"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400"
                }`}
              >
                {svc.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          Checking services...
        </div>
      )}
    </div>
  );
}
