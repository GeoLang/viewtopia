import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  Intersect,
  Matrix4,
  Transforms,
  type Cesium3DTileset,
  type GeometryInstance,
  type Primitive,
  type Viewer,
} from 'cesium';
import '../../src/actions/tileset';
import { runAction } from '../../src/actions/registry';
import { useAuthStore } from '../../src/features/auth/store';
import { useElementStore } from '../../src/features/elements/store';
import { restoreModelStates } from '../../src/features/project/modelStates';
import { SECTION_REQUEST_DELAY_MILLISECONDS, SectionCapsOnGlobe } from '../../src/features/scene/SectionCaps';
import { SectionCapPick, type SectionCut, type SectionPoint } from '../../src/features/scene/sectionCut';
import { TilesetSectionPanel } from '../../src/features/scene/TilesetSectionPanel';
import {
  addFacePlane,
  applyTilesetSection,
  armedFaceClipTileset,
  armFaceClip,
  disableTilesetSection,
  facePlaneFromWorld,
  readFacePlanes,
  readTilesetSection,
  removeFacePlane,
  replaceFacePlanes,
  setTilesetSectionOutline,
  tilesetSectionOutlined,
  tilesetSectionRange,
} from '../../src/features/scene/tilesetSection';
import { useAppStore } from '../../src/store/app';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import { tileHighlightColor } from '../../src/viewer/tilesetStyle';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const RADIUS = 20;
const LOCAL_CENTRE = new Cartesian3(5, 2, 10);
const PLACEMENT = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));

function transformedTileset(): Cesium3DTileset {
  const sphere = new BoundingSphere(
    Matrix4.multiplyByPoint(PLACEMENT, LOCAL_CENTRE, new Cartesian3()),
    RADIUS,
  );
  return {
    root: { computedTransform: PLACEMENT, boundingSphere: sphere },
    boundingSphere: sphere,
    clippingPlanes: undefined,
  } as unknown as Cesium3DTileset;
}

function earthFixedTileset(): Cesium3DTileset {
  const sphere = new BoundingSphere(Cartesian3.fromDegrees(-71, 42, 10), RADIUS);
  return {
    root: { computedTransform: Matrix4.IDENTITY, boundingSphere: sphere },
    boundingSphere: sphere,
    clippingPlanes: undefined,
  } as unknown as Cesium3DTileset;
}

describe('tilesetSectionRange', () => {
  it('measures in the root frame when the root carries a placement', () => {
    const tileset = transformedTileset();

    const z = tilesetSectionRange(tileset, 'z');
    expect(z.min).toBeCloseTo(LOCAL_CENTRE.z - RADIUS, 5);
    expect(z.max).toBeCloseTo(LOCAL_CENTRE.z + RADIUS, 5);

    const x = tilesetSectionRange(tileset, 'x');
    expect(x.min).toBeCloseTo(LOCAL_CENTRE.x - RADIUS, 5);
  });

  it('measures from the centre of the model when coordinates are earth-fixed', () => {
    const z = tilesetSectionRange(earthFixedTileset(), 'z');

    expect(z.min).toBeCloseTo(-RADIUS, 5);
    expect(z.max).toBeCloseTo(RADIUS, 5);
  });
});

describe('applyTilesetSection', () => {
  it('keeps the side below the position, and the side above when flipped', () => {
    const tileset = transformedTileset();
    const requestRender = vi.fn();

    applyTilesetSection(tileset, { axis: 'z', position: 12, flip: false, enabled: true }, requestRender);
    let plane = tileset.clippingPlanes.get(0);
    // Cesium keeps the side where dot(normal, point) + distance is above zero
    expect(plane.normal.z * 11 + plane.distance).toBeGreaterThan(0);
    expect(plane.normal.z * 13 + plane.distance).toBeLessThan(0);

    applyTilesetSection(tileset, { axis: 'z', position: 12, flip: true, enabled: true }, requestRender);
    plane = tileset.clippingPlanes.get(0);
    expect(plane.normal.z * 13 + plane.distance).toBeGreaterThan(0);
    expect(plane.normal.z * 11 + plane.distance).toBeLessThan(0);

    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it('reuses the one collection, and reads back what it wrote', () => {
    const tileset = transformedTileset();
    const requestRender = vi.fn();
    applyTilesetSection(tileset, { axis: 'x', position: 3, flip: false, enabled: true }, requestRender);
    const collection = tileset.clippingPlanes;

    applyTilesetSection(tileset, { axis: 'y', position: -4, flip: true, enabled: true }, requestRender);

    expect(tileset.clippingPlanes).toBe(collection);
    expect(readTilesetSection(tileset)).toEqual({ axis: 'y', position: -4, flip: true, enabled: true });
  });

  it('turns the cut off without dropping it, and has nothing to read on a whole model', () => {
    const tileset = transformedTileset();
    expect(readTilesetSection(tileset)).toBeNull();

    applyTilesetSection(tileset, { axis: 'z', position: 1, flip: false, enabled: true }, vi.fn());
    disableTilesetSection(tileset, vi.fn());

    expect(tileset.clippingPlanes.enabled).toBe(false);
    expect(readTilesetSection(tileset)?.position).toBe(1);
  });
});

describe('face planes', () => {
  it('keeps the axis cut and clips the removed side of each extra plane', () => {
    const tileset = transformedTileset();
    const requestRender = vi.fn();
    applyTilesetSection(tileset, { axis: 'z', position: 4, flip: false, enabled: true }, requestRender);
    addFacePlane(tileset, { id: 'roof', normal: [0, 0, 1], offset: 8 }, requestRender);
    addFacePlane(tileset, { id: 'wall', normal: [1, 0, 0], offset: 2 }, requestRender);

    expect(tileset.clippingPlanes.length).toBe(3);
    expect(tileset.clippingPlanes.enabled).toBe(true);
    expect(tileset.clippingPlanes.get(1).normal.z).toBeCloseTo(-1);
    expect(tileset.clippingPlanes.get(1).distance).toBeCloseTo(8);
    expect(readFacePlanes(tileset).map((plane) => plane.id)).toEqual(['roof', 'wall']);
    expect(readTilesetSection(tileset)).toMatchObject({ axis: 'z', position: 4, enabled: true });

    removeFacePlane(tileset, 'missing', requestRender);
    expect(readFacePlanes(tileset)).toHaveLength(2);
    removeFacePlane(tileset, 'roof', requestRender);
    expect(readFacePlanes(tileset).map((plane) => plane.id)).toEqual(['wall']);
    expect(tileset.clippingPlanes.length).toBe(2);
    expect(tileset.clippingPlanes.get(1).normal.x).toBeCloseTo(-1);
    expect(requestRender).toHaveBeenCalledTimes(5);
  });

  it('clips with a face plane while the axis section stays off, and clears both', () => {
    const tileset = transformedTileset();
    applyTilesetSection(tileset, { axis: 'y', position: 1, flip: true, enabled: false }, vi.fn());
    addFacePlane(tileset, { id: 'face', normal: [0, 1, 0], offset: 3 }, vi.fn());

    expect(tileset.clippingPlanes.enabled).toBe(true);
    expect(tileset.clippingPlanes.length).toBe(1);
    expect(readTilesetSection(tileset)).toMatchObject({ enabled: false, position: 1 });

    replaceFacePlanes(tileset, [], vi.fn());
    expect(readFacePlanes(tileset)).toEqual([]);
    expect(tileset.clippingPlanes.enabled).toBe(false);
    expect(readTilesetSection(tileset)?.position).toBe(1);
  });

  it('keeps clipping with the face planes when the axis section turns off', () => {
    const faceOnly = transformedTileset();
    addFacePlane(faceOnly, { id: 'face', normal: [1, 0, 0], offset: 2 }, vi.fn());
    disableTilesetSection(faceOnly, vi.fn());
    expect(faceOnly.clippingPlanes.enabled).toBe(true);
    expect(readFacePlanes(faceOnly)).toHaveLength(1);

    const both = transformedTileset();
    applyTilesetSection(both, { axis: 'z', position: 4, flip: false, enabled: true }, vi.fn());
    addFacePlane(both, { id: 'face', normal: [1, 0, 0], offset: 2 }, vi.fn());
    disableTilesetSection(both, vi.fn());
    expect(both.clippingPlanes.enabled).toBe(true);
    expect(both.clippingPlanes.length).toBe(1);
    expect(readTilesetSection(both)).toMatchObject({ position: 4, enabled: false });
  });

  it('turns a world click into a plane in the section frame and refuses a zero normal', () => {
    const tileset = transformedTileset();
    const point = Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(1, 2, 3), new Cartesian3());
    const normal = Matrix4.multiplyByPointAsVector(PLACEMENT, new Cartesian3(0, 0, 2), new Cartesian3());

    const plane = facePlaneFromWorld(tileset, point, normal);

    expect(plane?.normal[0]).toBeCloseTo(0, 5);
    expect(plane?.normal[1]).toBeCloseTo(0, 5);
    expect(plane?.normal[2]).toBeCloseTo(1, 5);
    expect(plane?.offset).toBeCloseTo(3, 5);
    expect(facePlaneFromWorld(tileset, point, new Cartesian3())).toBeNull();
  });
});

describe('the outline along a cut', () => {
  it('draws in red until turned off, and turns off with no width', () => {
    const tileset = transformedTileset();
    expect(tilesetSectionOutlined(tileset)).toBe(true);
    applyTilesetSection(tileset, { axis: 'z', position: 1, flip: false, enabled: true }, vi.fn());
    expect(tileset.clippingPlanes.edgeColor).toEqual(Color.RED);
    expect(tileset.clippingPlanes.edgeWidth).toBeGreaterThan(0);

    const requestRender = vi.fn();
    setTilesetSectionOutline(tileset, { visible: false }, requestRender);

    expect(tileset.clippingPlanes.edgeWidth).toBe(0);
    expect(tilesetSectionOutlined(tileset)).toBe(false);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});

describe('TilesetSectionPanel', () => {
  const requestRender = vi.fn();
  const primitivesAdd = vi.fn((primitive: Primitive) => primitive);
  const primitivesRemove = vi.fn((_primitive: Primitive) => true);

  // ViewerArea mounts SectionCapsOnGlobe beside the panels
  const renderPanel = async () => {
    render(
      <MantineProvider env="test">
        <SectionCapsOnGlobe />
        <TilesetSectionPanel onClose={() => {}} />
      </MantineProvider>,
    );
    await act(async () => {});
  };

  const renderCapsWithPanelClosed = async () => {
    render(<SectionCapsOnGlobe />);
    await act(async () => {});
  };

  beforeEach(() => {
    requestRender.mockClear();
    primitivesAdd.mockClear();
    primitivesRemove.mockClear();
    useAppStore.setState({ renderer: 'cesium', activeTab: 'globe' });
    useTiles3dLayerStore.setState({ layers: [], loaded: {} });
    setActiveCesiumViewer({
      isDestroyed: () => false,
      scene: { requestRender, primitives: { add: primitivesAdd, remove: primitivesRemove } },
    } as unknown as Viewer);
  });

  it('says so when no model is loaded', async () => {
    await renderPanel();

    expect(screen.getByTestId('model-section-empty')).toBeInTheDocument();
  });

  it('cuts the model at its middle, flips, and removes the cut', async () => {
    const tileset = transformedTileset();
    useTiles3dLayerStore.setState({
      layers: [{ id: 'model', name: 'model.ifc', url: '/m/tileset.json', visible: true }],
      loaded: { model: tileset },
    });
    await renderPanel();
    expect(tileset.clippingPlanes).toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Section' }));
    });
    expect(readTilesetSection(tileset)).toMatchObject({ axis: 'z', flip: false, enabled: true });
    expect(readTilesetSection(tileset)?.position).toBeCloseTo(LOCAL_CENTRE.z, 5);
    expect(requestRender).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Flip the side that stays' }));
    });
    expect(readTilesetSection(tileset)?.flip).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Section' }));
    });
    expect(tileset.clippingPlanes.enabled).toBe(false);
  });

  it('turns the outline off and on from its switch, and says a model outside tiletopia keeps an open cut', async () => {
    const tileset = transformedTileset();
    useTiles3dLayerStore.setState({
      layers: [{ id: 'model', name: 'model.ifc', url: '/m/tileset.json', visible: true }],
      loaded: { model: tileset },
    });
    await renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply Section' }));
    });
    expect(tileset.clippingPlanes.edgeWidth).toBeGreaterThan(0);
    expect(screen.getByTestId('model-section-cap-note')).toHaveTextContent(
      'Only a model stored in tiletopia gets a filled cut',
    );
    expect(primitivesAdd).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Red outline along the cut' }));
    });
    expect(tileset.clippingPlanes.edgeWidth).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Red outline along the cut' }));
    });
    expect(tileset.clippingPlanes.edgeWidth).toBeGreaterThan(0);
  });

  it('shows a cut the chat already made', async () => {
    const tileset = transformedTileset();
    applyTilesetSection(tileset, { axis: 'x', position: 3, flip: true, enabled: true }, vi.fn());
    useTiles3dLayerStore.setState({
      layers: [{ id: 'model', name: 'model.ifc', url: '/m/tileset.json', visible: true }],
      loaded: { model: tileset },
    });

    await renderPanel();

    expect(screen.getByRole('button', { name: 'Remove Section' })).toBeInTheDocument();
    expect(screen.getByText('Position: 3.0 m')).toBeInTheDocument();
    expect(readTilesetSection(tileset)).toEqual({ axis: 'x', position: 3, flip: true, enabled: true });
  });

  it('stops waiting for a face click when the panel closes or the model goes away', async () => {
    const tileset = transformedTileset();
    const showModel = () =>
      useTiles3dLayerStore.setState({
        layers: [{ id: 'model', name: 'model.ifc', url: '/m/tileset.json', visible: true }],
        loaded: { model: tileset },
      });
    const armFromPanel = async () => {
      const view = render(
        <MantineProvider env="test">
          <TilesetSectionPanel onClose={() => {}} />
        </MantineProvider>,
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Add a plane from a face' }));
      });
      expect(armedFaceClipTileset()).toBe(tileset);
      return view;
    };

    showModel();
    const closed = await armFromPanel();
    act(() => closed.unmount());
    expect(armedFaceClipTileset()).toBeNull();

    await armFromPanel();
    await act(async () => {
      useTiles3dLayerStore.getState().removeLayer('model');
    });
    expect(armedFaceClipTileset()).toBeNull();
  });

  it('follows a cut made outside it while it is open', async () => {
    const tileset = transformedTileset();
    useTiles3dLayerStore.setState({
      layers: [{ id: 'model', name: 'model.ifc', url: '/m/tileset.json', visible: true }],
      loaded: { model: tileset },
    });
    await renderPanel();
    expect(screen.getByRole('button', { name: 'Apply Section' })).toBeInTheDocument();

    act(() => {
      applyTilesetSection(tileset, { axis: 'x', position: 3, flip: true, enabled: true }, vi.fn());
    });

    expect(screen.getByRole('button', { name: 'Remove Section' })).toBeInTheDocument();
    expect(screen.getByText('Position: 3.0 m')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'X' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Flip the side that stays' })).toBeChecked();

    act(() => {
      disableTilesetSection(tileset, vi.fn());
    });

    expect(screen.getByRole('button', { name: 'Apply Section' })).toBeInTheDocument();
  });

  describe('caps on the cut', () => {
    const TILETOPIA_MODEL = { id: 'model', name: 'model.ifc', url: '/v1/assets/7/tileset.json', visible: true };
    const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

    function json(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }

    // a 4 m square slab around the model's centre with a 2 m square hole, cut at the plane
    function slabCut(position: number, { elementId, openChainsDropped }: { elementId: string; openChainsDropped: number }): SectionCut {
      const ring = (half: number): SectionPoint[] => [
        [LOCAL_CENTRE.x - half, LOCAL_CENTRE.y - half, position],
        [LOCAL_CENTRE.x + half, LOCAL_CENTRE.y - half, position],
        [LOCAL_CENTRE.x + half, LOCAL_CENTRE.y + half, position],
        [LOCAL_CENTRE.x - half, LOCAL_CENTRE.y + half, position],
      ];
      return { axis: 'z', position, openChainsDropped, polygons: [{ elementId, rings: [ring(2), ring(1)] }] };
    }

    function sectionCalls(): [string, RequestInit | undefined][] {
      return fetchMock.mock.calls.filter(([url]) => String(url).includes('/section')) as [
        string,
        RequestInit | undefined,
      ][];
    }

    function answerFetch(section: (url: string, init?: RequestInit) => Promise<Response>): void {
      fetchMock.mockImplementation(async (url, init) => {
        if (String(url).includes('/alignments')) return json([]);
        return section(String(url), init);
      });
    }

    function request(index: number) {
      const call = sectionCalls()[index];
      if (!call) throw new Error(`no section request ${index}`);
      const [url, init] = call;
      const parsed = new URL(url, window.location.origin);
      return {
        path: parsed.pathname,
        axis: parsed.searchParams.get('axis'),
        position: Number(parsed.searchParams.get('position')),
        authorization: new Headers(init?.headers).get('Authorization'),
        signal: init?.signal,
      };
    }

    function wallCut(at: number): SectionCut {
      const ring: SectionPoint[] = [
        [at, 0, 0],
        [at, 4, 0],
        [at, 4, 4],
        [at, 0, 4],
      ];
      return {
        axis: 'z',
        position: 0,
        normal: [1, 0, 0],
        offset: at,
        openChainsDropped: 0,
        polygons: [{ elementId: 'wall', rings: [ring] }],
      };
    }

    function answerWithSlabAndWall(wallAt: number) {
      answerFetch(async (url) => {
        const query = new URL(url, window.location.origin).searchParams;
        if (query.has('nx')) return json(wallCut(wallAt));
        return json(slabCut(Number(query.get('position')), { elementId: 'slab', openChainsDropped: 0 }));
      });
    }

    function answerWithSlab({ elementId = 'slab', openChainsDropped = 0 } = {}) {
      answerFetch(async (url) => {
        const position = Number(new URL(url, window.location.origin).searchParams.get('position'));
        return json(slabCut(position, { elementId, openChainsDropped }));
      });
    }

    function deferredAnswer() {
      let resolve: (response: Response) => void = () => {};
      const promise = new Promise<Response>((settle) => {
        resolve = settle;
      });
      return { promise, resolve };
    }

    async function settle(): Promise<void> {
      await act(async () => {
        // a macrotask runs only after every promise of the answer has settled
        await new Promise((resolve) => setImmediate(resolve));
      });
    }

    async function afterTheDelay(): Promise<void> {
      act(() => {
        vi.advanceTimersByTime(SECTION_REQUEST_DELAY_MILLISECONDS);
      });
      await settle();
    }

    function fillDraws(): number {
      return primitivesAdd.mock.calls.filter(([primitive]) => {
        const instances = primitive.geometryInstances as GeometryInstance[];
        return instances[0]?.geometry instanceof CoplanarPolygonGeometry;
      }).length;
    }

    function drawnCaps(): GeometryInstance[] {
      const calls = primitivesAdd.mock.calls;
      for (let index = calls.length - 1; index >= 0; index -= 1) {
        const primitive = calls[index][0];
        const instances = primitive.geometryInstances as GeometryInstance[];
        if (instances[0]?.geometry instanceof CoplanarPolygonGeometry) return instances;
      }
      throw new Error('no caps were drawn');
    }

    function capShape(instance: GeometryInstance): { area: number; heights: number[] } {
      const geometry = CoplanarPolygonGeometry.createGeometry(
        instance.geometry as unknown as CoplanarPolygonGeometry,
      );
      const values = geometry?.attributes.position?.values;
      const indices = geometry?.indices;
      if (!values || !indices) throw new Error('the cap has no triangles');
      const flat = Array.from(values);
      const corner = (index: number) => Cartesian3.fromArray(flat, index * 3);
      let area = 0;
      for (let start = 0; start < indices.length; start += 3) {
        const a = corner(indices[start]);
        const ab = Cartesian3.subtract(corner(indices[start + 1]), a, new Cartesian3());
        const ac = Cartesian3.subtract(corner(indices[start + 2]), a, new Cartesian3());
        area += Cartesian3.magnitude(Cartesian3.cross(ab, ac, new Cartesian3())) / 2;
      }
      const heights = flat.filter((_, index) => index % 3 === 2);
      return { area, heights };
    }

    async function applySection() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Apply Section' }));
      });
    }

    function showModel(tileset: Cesium3DTileset) {
      useTiles3dLayerStore.setState({ layers: [TILETOPIA_MODEL], loaded: { model: tileset } });
    }

    function capColor(instance: GeometryInstance): number[] {
      return Array.from((instance.attributes as { color: ColorGeometryInstanceAttribute }).color.value);
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
      useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('asks tiletopia for the cut at the plane once it stops moving, and fills it on the removed side', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerWithSlab({ openChainsDropped: 2 });
      await renderPanel();

      await applySection();
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
      expect(sectionCalls()).toHaveLength(0);
      await afterTheDelay();

      expect(sectionCalls()).toHaveLength(1);
      const plane = readTilesetSection(tileset);
      if (!plane) throw new Error('no section was applied');
      expect(request(0)).toMatchObject({
        path: '/v1/assets/7/section',
        axis: plane.axis,
        position: plane.position,
        authorization: 'Bearer jwt-token',
      });
      expect(plane.position).toBeGreaterThan(LOCAL_CENTRE.z);

      const [cap] = drawnCaps();
      expect(cap.id).toBeInstanceOf(SectionCapPick);
      expect(cap.id).toMatchObject({ tileset, elementId: 'slab' });
      expect(Matrix4.equals(cap.modelMatrix, PLACEMENT)).toBe(true);
      const { area, heights } = capShape(cap);
      expect(area).toBeCloseTo(16 - 4, 5);
      for (const height of heights) {
        expect(height).toBeGreaterThan(plane.position);
        expect(height).toBeLessThan(plane.position + 0.1);
      }
      expect(screen.getByTestId('model-section-cap-note')).toHaveTextContent(
        '2 outlines of the cut did not close and stay open.',
      );
    });

    it('flips the caps with the panel without asking again', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerWithSlab();
      await renderPanel();
      await applySection();
      await afterTheDelay();
      const first = primitivesAdd.mock.lastCall?.[0];

      await act(async () => {
        fireEvent.click(screen.getByRole('switch', { name: 'Flip the side that stays' }));
      });

      expect(sectionCalls()).toHaveLength(1);
      expect(primitivesRemove).toHaveBeenCalledWith(first);
      expect(fillDraws()).toBe(2);
      const plane = readTilesetSection(tileset);
      if (!plane) throw new Error('no section was applied');
      expect(plane.flip).toBe(true);
      for (const height of capShape(drawnCaps()[0]).heights) {
        expect(height).toBeLessThan(plane.position);
      }
      expect(screen.queryByTestId('model-section-cap-note')).toBeNull();
    });

    it('drops an answer for a plane that has since moved on', async () => {
      showModel(transformedTileset());
      const older = deferredAnswer();
      const newer = deferredAnswer();
      const pending = [older.promise, newer.promise];
      answerFetch(async () => {
        const next = pending.shift();
        if (!next) throw new Error('unexpected section fetch');
        return next;
      });
      await renderPanel();
      await applySection();
      await afterTheDelay();

      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
      await afterTheDelay();
      expect(sectionCalls()).toHaveLength(2);
      expect(request(0).signal?.aborted).toBe(true);
      expect(request(1).signal?.aborted).toBe(false);

      newer.resolve(json(slabCut(request(1).position, { elementId: 'newer', openChainsDropped: 0 })));
      await settle();
      older.resolve(json(slabCut(request(0).position, { elementId: 'older', openChainsDropped: 0 })));
      await settle();

      expect(fillDraws()).toBe(1);
      expect(drawnCaps()[0].id).toMatchObject({ elementId: 'newer' });
    });

    it('removes the caps when the cut turns off and when the model closes', async () => {
      showModel(transformedTileset());
      answerWithSlab();
      await renderPanel();
      await applySection();
      await afterTheDelay();
      const first = primitivesAdd.mock.lastCall?.[0];

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Remove Section' }));
      });
      expect(primitivesRemove).toHaveBeenCalledWith(first);

      await applySection();
      await afterTheDelay();
      const second = primitivesAdd.mock.lastCall?.[0];
      expect(second).not.toBe(first);

      await act(async () => {
        useTiles3dLayerStore.getState().removeLayer('model');
      });
      expect(primitivesRemove).toHaveBeenCalledWith(second);
      expect(fillDraws()).toBe(2);
    });

    it("shows tiletopia's refusal and draws nothing", async () => {
      showModel(transformedTileset());
      answerFetch(async () =>
        json(
          { code: 'ASSET_HAS_NO_MESH_SOURCE', message: "asset 7's source is a .las, which no mesh reader takes" },
          404,
        ),
      );
      await renderPanel();
      await applySection();
      await afterTheDelay();

      expect(screen.getByTestId('model-section-cap-error')).toHaveTextContent(
        "asset 7's source is a .las, which no mesh reader takes",
      );
      expect(primitivesAdd).not.toHaveBeenCalled();
    });

    it('leaves the cut of an earth-fixed model open without asking tiletopia', async () => {
      showModel(earthFixedTileset());
      await renderPanel();
      await applySection();
      await afterTheDelay();

      expect(sectionCalls()).toHaveLength(0);
      expect(screen.getByTestId('model-section-cap-note')).toHaveTextContent("This model's coordinates are earth-fixed");
    });

    it('fills a cut the chat made with the panel closed, and takes the caps off when the chat makes the model whole', async () => {
      showModel(transformedTileset());
      answerWithSlab();
      await renderCapsWithPanelClosed();

      await act(async () => {
        await runAction('tileset.section', { on: true, position: 12 });
      });
      expect(sectionCalls()).toHaveLength(0);
      await afterTheDelay();

      expect(sectionCalls()).toHaveLength(1);
      expect(request(0)).toMatchObject({ path: '/v1/assets/7/section', axis: 'z', position: 12 });
      const drawn = primitivesAdd.mock.lastCall?.[0];
      expect(drawnCaps()[0].id).toMatchObject({ elementId: 'slab' });

      await act(async () => {
        await runAction('tileset.section', { on: false });
      });
      expect(primitivesRemove).toHaveBeenCalledWith(drawn);
    });

    it('takes the face planes and their caps off when the chat makes the model whole', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerWithSlabAndWall(LOCAL_CENTRE.x);
      await renderCapsWithPanelClosed();
      act(() => {
        addFacePlane(tileset, { id: 'wall', normal: [1, 0, 0], offset: LOCAL_CENTRE.x }, requestRender);
      });
      await afterTheDelay();
      const drawn = primitivesAdd.mock.lastCall?.[0];
      expect(drawnCaps()[0].id).toMatchObject({ elementId: 'wall' });

      await act(async () => {
        await runAction('tileset.section', { on: false });
      });

      expect(readFacePlanes(tileset)).toEqual([]);
      expect(tileset.clippingPlanes.enabled).toBe(false);
      expect(primitivesRemove).toHaveBeenCalledWith(drawn);
    });

    it('clips what either plane removes and fills each cut only where the other plane keeps the model', async () => {
      const tileset = transformedTileset();
      const wallAt = LOCAL_CENTRE.x + 1.5;
      const slabAt = 12;
      showModel(tileset);
      answerWithSlabAndWall(wallAt);
      await renderCapsWithPanelClosed();
      act(() => {
        applyTilesetSection(tileset, { axis: 'z', position: slabAt, flip: false, enabled: true }, requestRender);
        addFacePlane(tileset, { id: 'wall', normal: [1, 0, 0], offset: wallAt }, requestRender);
      });
      await afterTheDelay();

      const clipped = (x: number, z: number): boolean =>
        tileset.clippingPlanes.computeIntersectionWithBoundingVolume(
          new BoundingSphere(new Cartesian3(x, LOCAL_CENTRE.y, z), 0.5),
        ) === Intersect.OUTSIDE;
      expect(clipped(wallAt - 2, slabAt - 2)).toBe(false);
      expect(clipped(wallAt - 2, slabAt + 2)).toBe(true);
      expect(clipped(wallAt + 2, slabAt - 2)).toBe(true);
      expect(clipped(wallAt + 2, slabAt + 2)).toBe(true);

      const caps = new Map(
        primitivesAdd.mock.calls
          .flatMap(([primitive]) => primitive.geometryInstances as GeometryInstance[])
          .filter((instance) => instance.geometry instanceof CoplanarPolygonGeometry)
          .map((instance) => [(instance.id as SectionCapPick).elementId, instance]),
      );
      const slab = caps.get('slab');
      const wall = caps.get('wall');
      if (!slab || !wall) throw new Error('both cuts should be filled');
      expect(capShape(slab).area).toBeCloseTo((wallAt - (LOCAL_CENTRE.x - 2)) * 4 - 2 * 2, 5);
      const slabCorners = CoplanarPolygonGeometry.createGeometry(slab.geometry as unknown as CoplanarPolygonGeometry);
      const slabX = Array.from(slabCorners?.attributes.position?.values ?? []).filter((_, index) => index % 3 === 0);
      expect(Math.max(...slabX)).toBeLessThanOrEqual(wallAt + 1e-6);
      expect(capShape(wall).area).toBeCloseTo(4 * 4, 5);
    });

    it('keeps the drawn caps when a section change leaves their planes alone', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerWithSlab();
      await renderCapsWithPanelClosed();
      act(() => {
        applyTilesetSection(tileset, { axis: 'z', position: 12, flip: false, enabled: true }, requestRender);
      });
      await afterTheDelay();
      expect(fillDraws()).toBe(1);

      act(() => armFaceClip(tileset, requestRender));
      act(() => armFaceClip(null, requestRender));

      expect(primitivesRemove).not.toHaveBeenCalled();
      expect(fillDraws()).toBe(1);
    });

    it('fills the cut a project restores with the panel closed', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerWithSlab();
      await renderCapsWithPanelClosed();

      await act(async () => {
        await restoreModelStates({
          '7': {
            selected: [],
            hidden: [],
            isolated: null,
            section: { axis: 'z', position: 4, flip: true, enabled: true, outlined: true },
            bimMode: null,
          },
        });
      });
      await afterTheDelay();

      expect(sectionCalls()).toHaveLength(1);
      expect(request(0)).toMatchObject({ path: '/v1/assets/7/section', axis: 'z', position: 4 });
      const [cap] = drawnCaps();
      expect(cap.id).toMatchObject({ tileset, elementId: 'slab' });
      for (const height of capShape(cap).heights) expect(height).toBeLessThan(4);
    });

    it('paints the caps of selected elements in the tile highlight colour without asking again', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      answerFetch(async (url) => {
        const position = Number(new URL(url, window.location.origin).searchParams.get('position'));
        const slab = slabCut(position, { elementId: 'slab', openChainsDropped: 0 });
        const wall = slabCut(position, { elementId: 'wall', openChainsDropped: 0 });
        return json({ ...slab, polygons: [...slab.polygons, ...wall.polygons] });
      });
      await renderCapsWithPanelClosed();
      act(() => {
        applyTilesetSection(tileset, { axis: 'z', position: 12, flip: false, enabled: true }, requestRender);
      });
      await afterTheDelay();
      const unselected = primitivesAdd.mock.lastCall?.[0];
      const [greySlab, greyWall] = drawnCaps().map(capColor);
      const highlight = Array.from(ColorGeometryInstanceAttribute.fromColor(tileHighlightColor()).value);
      expect(greyWall).toEqual(greySlab);
      expect(greyWall).not.toEqual(highlight);

      act(() => {
        const elements = useElementStore.getState();
        elements.openModel(TILETOPIA_MODEL);
        elements.selectElements(['wall']);
      });

      expect(sectionCalls()).toHaveLength(1);
      expect(primitivesRemove).toHaveBeenCalledWith(unselected);
      const [slab, wall] = drawnCaps();
      expect(slab.id).toMatchObject({ elementId: 'slab' });
      expect(capColor(slab)).toEqual(greySlab);
      expect(capColor(wall)).toEqual(highlight);
      const selectedPrimitive = primitivesAdd.mock.lastCall?.[0];
      if (!selectedPrimitive) throw new Error('no caps were drawn');
      expect(selectedPrimitive.appearance).toMatchObject({ translucent: true });

      act(() => {
        useElementStore.getState().clearSelection();
      });

      expect(drawnCaps().map(capColor)).toEqual([greySlab, greySlab]);
      expect(sectionCalls()).toHaveLength(1);
    });
  });

  describe('alignments', () => {
    const IFC_MODEL = { id: 'model', name: 'bridge.ifc', url: '/v1/assets/7/tileset.json', visible: true };
    const GLB_MODEL = { id: 'model', name: 'bridge.glb', url: '/v1/assets/7/tileset.json', visible: true };
    const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

    function alignmentCalls(): number {
      return fetchMock.mock.calls.filter(([url]) => String(url).includes('/alignments')).length;
    }

    beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('are read for an IFC model and never for a model from another format', async () => {
      useTiles3dLayerStore.setState({ layers: [GLB_MODEL], loaded: { model: transformedTileset() } });
      await renderPanel();
      expect(alignmentCalls()).toBe(0);

      act(() => {
        useTiles3dLayerStore.setState({ layers: [IFC_MODEL], loaded: { model: transformedTileset() } });
      });
      await act(async () => {});
      expect(alignmentCalls()).toBe(1);
    });

    it("show tiletopia's refusal of the request", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ code: 'INVALID_PARAMETER', message: 'the alignment request was refused' }), {
          status: 400,
        }),
      );
      useTiles3dLayerStore.setState({ layers: [IFC_MODEL], loaded: { model: transformedTileset() } });
      await renderPanel();

      expect(screen.getByTestId('alignment-error')).toHaveTextContent('the alignment request was refused');
    });

    it('ask a signed-out user to sign in, without a request', async () => {
      useAuthStore.setState({ token: null, loggedIn: false });
      useTiles3dLayerStore.setState({ layers: [IFC_MODEL], loaded: { model: transformedTileset() } });
      await renderPanel();

      expect(alignmentCalls()).toBe(0);
      expect(screen.getByTestId('alignment-error')).toHaveTextContent('Sign in to read the alignments of this model.');
    });
  });
});
