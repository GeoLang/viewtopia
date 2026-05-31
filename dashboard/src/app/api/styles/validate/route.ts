import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { sld } = (await req.json()) as { sld: string };

  // Basic SLD validation
  const errors: string[] = [];

  if (!sld.includes("<StyledLayerDescriptor")) {
    errors.push("Missing <StyledLayerDescriptor> root element");
  }
  if (!sld.includes("<NamedLayer>")) {
    errors.push("Missing <NamedLayer> element");
  }
  if (!sld.includes("<FeatureTypeStyle>")) {
    errors.push("Missing <FeatureTypeStyle> element");
  }

  // Check for unclosed tags (basic XML check)
  const openTags = (sld.match(/<[A-Z][A-Za-z]*[ >]/g) || []).length;
  const closeTags = (sld.match(/<\/[A-Z][A-Za-z]*>/g) || []).length;
  if (Math.abs(openTags - closeTags) > 2) {
    errors.push("XML structure appears malformed (unclosed tags)");
  }

  if (errors.length > 0) {
    return NextResponse.json({
      ok: false,
      message: `Validation errors:\n${errors.join("\n")}`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: "SLD is valid ✓",
  });
}
