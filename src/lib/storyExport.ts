import type { BasemapTiles } from '../hooks/basemapTiles';
import { standaloneRasterStyle } from '../hooks/basemapTiles';
import { cameraZoom } from '../hooks/cameraSync';
import type { CameraState } from '../store/cameraViews';

export interface StoryStep {
  id: string;
  title: string;
  description: string;
  /** speaker notes: the presenter window shows them, the exported page never does */
  notes?: string;
  camera: CameraState;
}

export interface StoryExportOptions {
  title: string;
  steps: StoryStep[];
  basemap: BasemapTiles;
}

/** Pinned major, so a future MapLibre release cannot change an exported page. */
const MAPLIBRE_CDN = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl';

const MAX_MAPLIBRE_PITCH = 85;

interface StoryView {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

function storyView(step: StoryStep): StoryView {
  return {
    center: [step.camera.lng, step.camera.lat],
    zoom: cameraZoom(step.camera.height),
    bearing: step.camera.heading,
    pitch: Math.min(MAX_MAPLIBRE_PITCH, Math.max(0, step.camera.pitch + 90)),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `</script>` inside embedded JSON would end the script element early. */
function embeddedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Scroll-driven story page for opening straight off disk: the steps, their
 * cameras and all of the page's own code are in the file, the basemap tiles and
 * the MapLibre bundle come off the network.
 */
export function buildStoryHtml({ title, steps, basemap }: StoryExportOptions): string {
  const views = steps.map(storyView);
  const first = views[0];
  const pageTitle = escapeHtml(title || 'ViewTopia Story');
  const cards = steps
    .map(
      (step, index) => `      <section class="step" data-step="${index}">
        <div class="card">
          <h2>${escapeHtml(step.title)}</h2>
          ${step.description ? `<p>${escapeHtml(step.description)}</p>` : ''}
        </div>
      </section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <link rel="stylesheet" href="${MAPLIBRE_CDN}.css">
  <script src="${MAPLIBRE_CDN}.js"></script>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #fff; }
    #map { position: fixed; inset: 0; }
    main { position: relative; z-index: 1; width: min(420px, 84vw); margin-left: 5vw; }
    .step { min-height: 100vh; display: flex; align-items: center; }
    .card { background: rgba(18, 18, 22, 0.88); border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px; padding: 20px 24px; }
    .card h2 { margin: 0 0 8px; font-size: 20px; }
    .card p { margin: 0; line-height: 1.5; color: #d5d5dd; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="map"></div>
  <main>
${cards}
  </main>
  <script>
    const views = ${embeddedJson(views)};
    const map = new maplibregl.Map({
      container: 'map',
      style: ${embeddedJson(standaloneRasterStyle(basemap))},
      center: ${embeddedJson(first?.center ?? [0, 20])},
      zoom: ${first?.zoom ?? 2},
      bearing: ${first?.bearing ?? 0},
      pitch: ${first?.pitch ?? 0},
      interactive: false,
    });
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shown = -1;
    const show = (index) => {
      if (index === shown) return;
      shown = index;
      const view = views[index];
      const camera = { center: view.center, zoom: view.zoom, bearing: view.bearing, pitch: view.pitch };
      if (still) map.jumpTo(camera);
      else map.flyTo({ ...camera, duration: 2000 });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)[0];
        if (visible) show(Number(visible.target.dataset.step));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const step of document.querySelectorAll('.step')) observer.observe(step);
  </script>
</body>
</html>
`;
}
