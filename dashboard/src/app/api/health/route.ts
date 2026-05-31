import { NextResponse } from "next/server";
import { SERVICES, COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";
import { getContainerStatuses } from "@/lib/docker";

export const dynamic = "force-dynamic";

interface ServiceHealth {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  latency?: number;
  containerState?: string;
}

export async function GET() {
  // Get container statuses from docker compose
  const containers = await getContainerStatuses(COMPOSE_DIR, COMPOSE_FILE);

  const results: ServiceHealth[] = await Promise.all(
    SERVICES.map(async (svc) => {
      const container = containers.find(
        (c) => c.name === svc.composeName || c.name.includes(svc.composeName)
      );

      // If no health URL (e.g. PostGIS), check container state only
      if (!svc.healthUrl) {
        const isRunning = container?.state === "running";
        const isHealthy = container?.health === "healthy";
        return {
          id: svc.id,
          name: svc.name,
          status: isHealthy
            ? "operational"
            : isRunning
              ? "degraded"
              : "down",
          containerState: container?.state,
        };
      }

      // Ping health endpoint
      const t0 = Date.now();
      try {
        const res = await fetch(svc.healthUrl, {
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - t0;
        return {
          id: svc.id,
          name: svc.name,
          status: res.ok ? "operational" : "degraded",
          latency,
          containerState: container?.state,
        };
      } catch {
        return {
          id: svc.id,
          name: svc.name,
          status: "down",
          latency: Date.now() - t0,
          containerState: container?.state || "not running",
        };
      }
    })
  );

  return NextResponse.json({ services: results, timestamp: new Date().toISOString() });
}
