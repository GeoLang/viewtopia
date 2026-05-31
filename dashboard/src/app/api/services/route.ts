import { NextRequest, NextResponse } from "next/server";
import { controlService } from "@/lib/docker";
import { SERVICES, COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { service, action } = body as { service: string; action: string };

  // Validate service name
  const valid = SERVICES.find((s) => s.composeName === service);
  if (!valid) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  // Validate action
  if (!["start", "stop", "restart"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await controlService(
    service,
    action as "start" | "stop" | "restart",
    COMPOSE_DIR,
    COMPOSE_FILE
  );

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
