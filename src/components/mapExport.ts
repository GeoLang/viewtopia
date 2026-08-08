export function exportMapPng() {
  const canvas = document.querySelector(
    '#cesium-container canvas, #maplibre-container canvas, #leaflet-container canvas',
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  try {
    const link = document.createElement('a');
    link.download = `viewtopia-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    // canvas may be tainted by cross-origin tiles
  }
}
