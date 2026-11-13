import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Matrix4, type Cesium3DTileset, type Viewer } from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import { useElementStore } from '../../src/features/elements/store';
import { ElementEditPreviews, noteElementEditsChanged } from '../../src/features/scene/ElementEditPreviews';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const TOWER = { id: 'tower', name: 'tower.ifc', url: '/tiles/v1/assets/tower/tileset.json', visible: true };
const ANNEX = { id: 'annex', name: 'annex.ifc', url: '/tiles/v1/assets/annex/tileset.json', visible: true };
const TRIANGLE = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };

function edit(elementId: string) {
  return { elementId, kind: 'translate', hideOriginal: true, ...TRIANGLE };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const towerFails = { now: false };
const tiletopia = vi.fn(async (path: string) => {
  if (path === '/v1/assets/tower/element-edits') {
    return towerFails.now
      ? json({ code: 'INTERNAL', message: 'element-edits.json is not valid JSON' }, 500)
      : json({ edits: [edit('wall')] });
  }
  if (path === '/v1/assets/annex/element-edits') return json({ edits: [edit('stair')] });
  return json({ code: 'ResourceNotFound', message: path }, 404);
});

const primitivesInScene = new Set<unknown>();
const primitives = {
  add: vi.fn((primitive: unknown) => primitivesInScene.add(primitive)),
  remove: vi.fn((primitive: unknown) => primitivesInScene.delete(primitive)),
};

function tileset() {
  return { root: { computedTransform: Matrix4.IDENTITY } } as unknown as Cesium3DTileset;
}

beforeEach(() => {
  towerFails.now = false;
  tiletopia.mockClear();
  vi.stubGlobal('fetch', tiletopia);
  primitivesInScene.clear();
  primitives.add.mockClear();
  primitives.remove.mockClear();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useTiles3dLayerStore.setState({ layers: [TOWER, ANNEX], loaded: { tower: tileset(), annex: tileset() } });
  useElementStore.setState({ model: null });
  useElementStore.getState().openModel(TOWER);
  setActiveCesiumViewer({
    isDestroyed: () => false,
    scene: { primitives, requestRender: vi.fn() },
  } as unknown as Viewer);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveCesiumViewer(null);
});

describe('ElementEditPreviews', () => {
  it('reports a failed edits request, removes the stale previews and still draws the other model', async () => {
    render(
      <MantineProvider env="test">
        <Notifications />
        <ElementEditPreviews />
      </MantineProvider>,
    );
    await waitFor(() => expect(primitivesInScene.size).toBe(2));
    expect([...useElementStore.getState().suppressed]).toEqual(['wall']);
    const firstRun = [...primitivesInScene];

    towerFails.now = true;
    await act(async () => noteElementEditsChanged());

    expect(await screen.findByText('Could not read the element edits of tower.ifc')).toBeInTheDocument();
    expect(screen.getByText('element-edits.json is not valid JSON')).toBeInTheDocument();
    expect(firstRun.some((primitive) => primitivesInScene.has(primitive))).toBe(false);
    expect(primitivesInScene.size).toBe(1);
    expect(useElementStore.getState().suppressed.size).toBe(0);
  });
});
