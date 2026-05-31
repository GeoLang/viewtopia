import { NextRequest, NextResponse } from "next/server";
import { getServiceLogs } from "@/lib/docker";
import { SERVICES, COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get("service");
  const tail = parseInt(req.nextUrl.searchParams.get("tail") || "100", 10);

  if (!service) {
    return NextResponse.json({ error: "service param required" }, { status: 400 });
  }

  // Validate service name
  const valid = SERVICES.find((s) => s.composeName === service);
  if (!valid) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  const logs = await getServiceLogs(service, COMPOSE_DIR, COMPOSE_FILE, tail);

  return NextResponse.json({ service, logs, tail });
}
