"use client";

import { useState } from "react";
import { Palette, Eye } from "lucide-react";

const EXAMPLE_SLD = `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0">
  <NamedLayer>
    <Name>buildings</Name>
    <UserStyle>
      <Title>Building Style</Title>
      <FeatureTypeStyle>
        <Rule>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#3388ff</CssParameter>
              <CssParameter name="fill-opacity">0.6</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">#2266cc</CssParameter>
              <CssParameter name="stroke-width">1</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;

export default function StylesPage() {
  const [sld, setSld] = useState(EXAMPLE_SLD);
  const [previewUrl, setPreviewUrl] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);

  async function validateStyle() {
    try {
      const res = await fetch("/api/styles/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sld }),
      });
      const data = await res.json();
      setFeedback({ message: data.message || "Valid SLD", ok: data.ok ?? res.ok });
    } catch {
      setFeedback({ message: "Validation failed", ok: false });
    }
  }

  function previewWms() {
    // Construct a WMS GetMap URL to preview the style
    const params = new URLSearchParams({
      SERVICE: "WMS",
      REQUEST: "GetMap",
      LAYERS: "buildings",
      STYLES: "",
      CRS: "EPSG:4326",
      BBOX: "-180,-90,180,90",
      WIDTH: "512",
      HEIGHT: "256",
      FORMAT: "image/png",
    });
    setPreviewUrl(`http://localhost:3003/wms?${params}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Style Editor</h1>
        <p className="text-muted-foreground mt-1">
          Edit SLD/SE styles for WMS map rendering (Fenestra)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Palette className="h-4 w-4" /> SLD Document
            </h3>
            <div className="flex gap-2">
              <button
                onClick={validateStyle}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
              >
                Validate
              </button>
              <button
                onClick={previewWms}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
          </div>
          <textarea
            value={sld}
            onChange={(e) => setSld(e.target.value)}
            className="w-full h-[60vh] rounded-lg border border-border bg-black/50 p-4 font-mono text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            spellCheck={false}
          />
          {feedback && (
            <div
              className={`rounded-md border p-3 text-sm ${
                feedback.ok
                  ? "border-green-500/30 bg-green-500/5 text-green-300"
                  : "border-red-500/30 bg-red-500/5 text-red-300"
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4" /> Map Preview
          </h3>
          <div className="rounded-lg border border-border bg-card overflow-hidden h-[60vh] flex items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="WMS Preview"
                className="max-w-full max-h-full object-contain"
                onError={() =>
                  setFeedback({
                    message: "Preview failed — is Fenestra running on port 3003?",
                    ok: false,
                  })
                }
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Click &quot;Preview&quot; to render a WMS GetMap image
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
