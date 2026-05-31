import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { COMPOSE_DIR, COMPOSE_FILE } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(COMPOSE_DIR, COMPOSE_FILE);
    const content = await readFile(filePath, "utf-8");
    return NextResponse.json({ content, file: COMPOSE_FILE });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { content } = body as { content: string };

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const filePath = join(COMPOSE_DIR, COMPOSE_FILE);
    await writeFile(filePath, content, "utf-8");
    return NextResponse.json({ message: "Configuration saved successfully" });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
