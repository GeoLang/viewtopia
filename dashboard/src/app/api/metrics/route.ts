import { NextResponse } from "next/server";
import { getResourceStats } from "@/lib/docker";
import { COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getResourceStats(COMPOSE_DIR, COMPOSE_FILE);
  return NextResponse.json({ stats, timestamp: new Date().toISOString() });
}
