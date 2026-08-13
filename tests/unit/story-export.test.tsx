import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StoriesPanel } from '../../src/components/tools/StoriesPanel';
import { buildStoryHtml, type StoryStep } from '../../src/lib/storyExport';
import { BASEMAP_TILES } from '../../src/hooks/basemapTiles';
import { useAppStore } from '../../src/store/app';
import { installFakeBroadcastChannel } from './stubs/fakeBroadcastChannel';

installFakeBroadcastChannel();

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const downloads: { name: string; blob: Blob }[] = [];
const blobs = new Map<string, Blob>();
URL.createObjectURL = vi.fn((blob: Blob) => {
  const href = `blob:${blobs.size}`;
  blobs.set(href, blob);
  return href;
});
URL.revokeObjectURL = vi.fn();
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
  this: HTMLAnchorElement,
) {
  const blob = blobs.get(this.href);
  if (blob) downloads.push({ name: this.download, blob });
});

function step(overrides: Partial<StoryStep> = {}): StoryStep {
  return {
    id: crypto.randomUUID(),
    title: 'Harbour',
    description: 'Where the ferries dock',
    camera: { lng: 5.32, lat: 60.39, height: 9765.625, heading: 45, pitch: -60, roll: 0 },
    ...overrides,
  };
}

describe('building a story page', () => {
  it('carries every step and its camera', () => {
    const html = buildStoryHtml({
      title: 'Bergen',
      steps: [step(), step({ title: 'Fløyen', description: 'The hill above town' })],
      basemap: BASEMAP_TILES.osm,
    });

    expect(html).toContain('<h2>Harbour</h2>');
    expect(html).toContain('Where the ferries dock');
    expect(html).toContain('<h2>Fløyen</h2>');
    expect(html).toContain('The hill above town');
    expect(html).toContain('data-step="1"');

    const views = JSON.parse(html.match(/const views = (\[.*?\]);/s)?.[1] ?? '[]');
    expect(views).toHaveLength(2);
    expect(views[0].center).toEqual([5.32, 60.39]);
    // 4e7 / 2 ** 12 metres up is web-mercator zoom 12
    expect(views[0].zoom).toBeCloseTo(12, 6);
    expect(views[0].bearing).toBe(45);
    // cesium pitch is -90 looking straight down, maplibre 0
    expect(views[0].pitch).toBe(30);
  });

  it('flies to the step scrolled into view', () => {
    const html = buildStoryHtml({
      title: '',
      steps: [
        step(),
        step({ camera: { lng: 10, lat: 20, height: 9765.625, heading: 0, pitch: -90, roll: 0 } }),
      ],
      basemap: BASEMAP_TILES.osm,
    });
    document.body.innerHTML = html.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? '';

    const flyTo = vi.fn();
    const observed: Element[] = [];
    let notify: (entries: unknown[]) => void = () => {};
    vi.stubGlobal('maplibregl', {
      Map: class {
        flyTo = flyTo;
        jumpTo = vi.fn();
      },
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: unknown[]) => void) {
          notify = callback;
        }
        observe(element: Element) {
          observed.push(element);
        }
      },
    );

    const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1] ?? '';
    new Function(script)();

    expect(observed).toHaveLength(2);
    notify([{ isIntersecting: true, target: observed[1] }]);
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10, 20], pitch: 0 }));

    vi.unstubAllGlobals();
  });

  it('points at tiles a reader can actually load', () => {
    const html = buildStoryHtml({ title: '', steps: [step()], basemap: BASEMAP_TILES.osm });

    expect(html).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(html).not.toContain('cached://');
  });

  it('escapes step text instead of running it', () => {
    const html = buildStoryHtml({
      title: '',
      steps: [step({ title: '<script>alert(1)</script>', description: 'a & b' })],
      basemap: BASEMAP_TILES.osm,
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b');
  });
});

describe('exporting from the stories panel', () => {
  beforeEach(() => {
    downloads.length = 0;
    localStorage.setItem('viewtopia-stories', JSON.stringify([step({ title: 'Harbour' })]));
    useAppStore.setState({ basemap: 'osm', customBasemap: null });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    useAppStore.setState({ basemap: 'dark', localBasemap: null });
  });

  function openPanel() {
    render(
      <MantineProvider>
        <StoriesPanel onClose={() => {}} />
      </MantineProvider>,
    );
  }

  it('downloads a page holding the steps', async () => {
    openPanel();
    fireEvent.click(screen.getByTestId('stories-export'));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('story.html');
    expect(await downloads[0].blob.text()).toContain('<h2>Harbour</h2>');
  });

  it('keeps speaker notes out of the exported page', async () => {
    openPanel();
    fireEvent.change(screen.getByLabelText('Speaker notes for step 1'), {
      target: { value: 'mention the ferries' },
    });

    const stored = JSON.parse(localStorage.getItem('viewtopia-stories') ?? '[]');
    expect(stored[0].notes).toBe('mention the ferries');

    fireEvent.click(screen.getByTestId('stories-export'));
    expect(await downloads[0].blob.text()).not.toContain('mention the ferries');
  });

  it('refuses a basemap only this machine has', () => {
    useAppStore.setState({ basemap: 'local', localBasemap: { name: 'city.pmtiles', status: 'loaded', kind: 'vector' } });
    openPanel();
    fireEvent.click(screen.getByTestId('stories-export'));

    expect(downloads).toHaveLength(0);
    expect(screen.getByText(/stays on this machine/)).toBeInTheDocument();
  });
});
