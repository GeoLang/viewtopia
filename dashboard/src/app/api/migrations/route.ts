import { NextRequest, NextResponse } from "next/server";
import { dockerCompose } from "@/lib/docker";
import { COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  if (!["status", "run"].includes(action)) {
    return NextResponse.json({ error: "Invalid action (status or run)" }, { status: 400 });
  }

  // Run migration via ptolemy CLI inside the container
  try {
    if (action === "status") {
      const { stdout } = await dockerCompose(
        `exec ptolemy ptolemy migrate status`,
        COMPOSE_DIR,
        COMPOSE_FILE
      );
      return NextResponse.json({ ok: true, output: stdout });
    } else {
      const { stdout } = await dockerCompose(
        `exec ptolemy ptolemy migrate run`,
        COMPOSE_DIR,
        COMPOSE_FILE
      );
      return NextResponse.json({ ok: true, output: stdout });
    }
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, output: (e as Error).message },
      { status: 500 }
    );
  }
}
