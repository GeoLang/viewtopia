"use client";

import { useState, useEffect } from "react";
import { Play, Square, RotateCcw, Loader2 } from "lucide-react";

interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  composeName: string;
  port: number;
}

const SERVICES: ServiceInfo[] = [
  { id: "db", name: "PostGIS", description: "Spatial database (PostGIS 16)", composeName: "db", port: 5432 },
  { id: "ptolemy", name: "Ptolemy", description: "Enterprise geodatabase & geoprocessing API", composeName: "ptolemy", port: 3000 },
  { id: "tiletopia", name: "TileTopia", description: "3D Tiles, terrain, and asset server", composeName: "tiletopia", port: 3100 },
  { id: "geokode", name: "Geokode", description: "Geocoding service", composeName: "geokode", port: 3001 },
  { id: "itinera", name: "Itinera", description: "Routing & isochrones", composeName: "itinera", port: 3002 },
  { id: "geolang", name: "GeoLang AI", description: "AI/NLP geospatial agent", composeName: "geolang", port: 8080 },
  { id: "letta", name: "Letta", description: "Agent memory server", composeName: "letta", port: 8283 },
  { id: "viewtopia", name: "ViewTopia", description: "Frontend viewer & A2UI", composeName: "viewtopia", port: 5174 },
];

export default function ServicesPage() {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ service: string; message: string; ok: boolean } | null>(null);

  async function handleAction(service: string, action: "start" | "stop" | "restart") {
    setActionInProgress(`${service}-${action}`);
    setFeedback(null);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, action }),
      });
      const data = await res.json();
      setFeedback({ service, message: data.message || data.error, ok: data.ok ?? res.ok });
    } catch (e) {
      setFeedback({ service, message: "Request failed", ok: false });
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Service Management</h1>
        <p className="text-muted-foreground mt-1">
          Start, stop, and restart platform services
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            feedback.ok
              ? "border-green-500/30 bg-green-500/5 text-green-300"
              : "border-red-500/30 bg-red-500/5 text-red-300"
          }`}
        >
          <strong>{feedback.service}:</strong> {feedback.message}
        </div>
      )}

      <div className="space-y-3">
        {SERVICES.map((svc) => (
          <div
            key={svc.id}
            className="rounded-lg border border-border bg-card px-5 py-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{svc.name}</div>
              <div className="text-sm text-muted-foreground">
                {svc.description} — port {svc.port}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAction(svc.composeName, "start")}
                disabled={actionInProgress !== null}
                className="p-2 rounded-md border border-border hover:bg-green-500/10 hover:border-green-500/30 transition-colors disabled:opacity-50"
                title="Start"
              >
                {actionInProgress === `${svc.composeName}-start` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 text-green-400" />
                )}
              </button>
              <button
                onClick={() => handleAction(svc.composeName, "stop")}
                disabled={actionInProgress !== null}
                className="p-2 rounded-md border border-border hover:bg-red-500/10 hover:border-red-500/30 transition-colors disabled:opacity-50"
                title="Stop"
              >
                {actionInProgress === `${svc.composeName}-stop` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 text-red-400" />
                )}
              </button>
              <button
                onClick={() => handleAction(svc.composeName, "restart")}
                disabled={actionInProgress !== null}
                className="p-2 rounded-md border border-border hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors disabled:opacity-50"
                title="Restart"
              >
                {actionInProgress === `${svc.composeName}-restart` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 text-amber-400" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
