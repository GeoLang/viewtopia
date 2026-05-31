import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const FENESTRA_CONFIG = process.env.FENESTRA_CONFIG || "/home/aaron/src/GeoLang/fenestra/config.json";

interface LayerConfig {
  name: string;
  title: string;
  srs: string[];
  bbox: number[];
  source: string;
}

interface Config {
  title: string;
  abstract_text: string;
  host: string;
  port: number;
  layers: LayerConfig[];
}

async function readConfig(): Promise<Config> {
  try {
    const content = await readFile(FENESTRA_CONFIG, "utf-8");
    return JSON.parse(content);
  } catch {
    // Return default config if file doesn't exist
    return {
      title: "Fenestra OGC Server",
      abstract_text: "OGC WMS/WFS/WMTS services",
      host: "0.0.0.0",
      port: 8080,
      layers: [],
    };
  }
}

async function writeConfig(config: Config): Promise<void> {
  await writeFile(FENESTRA_CONFIG, JSON.stringify(config, null, 2), "utf-8");
}

export async function GET() {
  const config = await readConfig();
  return NextResponse.json({ layers: config.layers });
}

export async function POST(req: NextRequest) {
  const layer = (await req.json()) as LayerConfig;
  const config = await readConfig();

  if (config.layers.some((l) => l.name === layer.name)) {
    return NextResponse.json({ error: "Layer already exists" }, { status: 409 });
  }

  config.layers.push(layer);
  await writeConfig(config);
  return NextResponse.json({ ok: true, message: "Layer added" });
}

export async function PUT(req: NextRequest) {
  const layer = (await req.json()) as LayerConfig;
  const config = await readConfig();

  const idx = config.layers.findIndex((l) => l.name === layer.name);
  if (idx === -1) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 });
  }

  config.layers[idx] = layer;
  await writeConfig(config);
  return NextResponse.json({ ok: true, message: "Layer updated" });
}

export async function DELETE(req: NextRequest) {
  const { name } = (await req.json()) as { name: string };
  const config = await readConfig();

  config.layers = config.layers.filter((l) => l.name !== name);
  await writeConfig(config);
  return NextResponse.json({ ok: true, message: "Layer deleted" });
}
