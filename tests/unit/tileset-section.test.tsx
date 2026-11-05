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
  Matrix4,
  Transforms,
  type Cesium3DTileset,
  type GeometryInstance,
  type PerInstanceColorAppearance,
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
  applyTilesetSection,
  disableTilesetSection,
  readTilesetSection,
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

    function request(index: number) {
      const [url, init] = fetchMock.mock.calls[index];
      const parsed = new URL(url, window.location.origin);
      return {
        path: parsed.pathname,
        axis: parsed.searchParams.get('axis'),
        position: Number(parsed.searchParams.get('position')),
        authorization: new Headers(init?.headers).get('Authorization'),
        signal: init?.signal,
      };
    }

    function answerWithSlab({ elementId = 'slab', openChainsDropped = 0 } = {}) {
      fetchMock.mockImplementation(async (url) => {
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

    function drawnCaps(): GeometryInstance[] {
      const primitive = primitivesAdd.mock.lastCall?.[0];
      if (!primitive) throw new Error('no caps were drawn');
      return primitive.geometryInstances as GeometryInstance[];
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
      expect(fetchMock).not.toHaveBeenCalled();
      await afterTheDelay();

      expect(fetchMock).toHaveBeenCalledTimes(1);
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

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(primitivesRemove).toHaveBeenCalledWith(first);
      expect(primitivesAdd).toHaveBeenCalledTimes(2);
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
      fetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      await renderPanel();
      await applySection();
      await afterTheDelay();

      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
      await afterTheDelay();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(request(0).signal?.aborted).toBe(true);
      expect(request(1).signal?.aborted).toBe(false);

      newer.resolve(json(slabCut(request(1).position, { elementId: 'newer', openChainsDropped: 0 })));
      await settle();
      older.resolve(json(slabCut(request(0).position, { elementId: 'older', openChainsDropped: 0 })));
      await settle();

      expect(primitivesAdd).toHaveBeenCalledTimes(1);
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
      expect(primitivesAdd).toHaveBeenCalledTimes(2);
    });

    it("shows tiletopia's refusal and draws nothing", async () => {
      showModel(transformedTileset());
      fetchMock.mockResolvedValue(
        json({ code: 'ASSET_HAS_NO_MESH_SOURCE', message: "asset 7's source is a .las, which no mesh reader takes" }, 404),
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

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('model-section-cap-note')).toHaveTextContent("This model's coordinates are earth-fixed");
    });

    it('fills a cut the chat made with the panel closed, and takes the caps off when the chat makes the model whole', async () => {
      showModel(transformedTileset());
      answerWithSlab();
      await renderCapsWithPanelClosed();

      await act(async () => {
        await runAction('tileset.section', { on: true, position: 12 });
      });
      expect(fetchMock).not.toHaveBeenCalled();
      await afterTheDelay();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0)).toMatchObject({ path: '/v1/assets/7/section', axis: 'z', position: 12 });
      const drawn = primitivesAdd.mock.lastCall?.[0];
      expect(drawnCaps()[0].id).toMatchObject({ elementId: 'slab' });

      await act(async () => {
        await runAction('tileset.section', { on: false });
      });
      expect(primitivesRemove).toHaveBeenCalledWith(drawn);
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

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(request(0)).toMatchObject({ path: '/v1/assets/7/section', axis: 'z', position: 4 });
      const [cap] = drawnCaps();
      expect(cap.id).toMatchObject({ tileset, elementId: 'slab' });
      for (const height of capShape(cap).heights) expect(height).toBeLessThan(4);
    });

    it('paints the caps of selected elements in the tile highlight colour without asking again', async () => {
      const tileset = transformedTileset();
      showModel(tileset);
      fetchMock.mockImplementation(async (url) => {
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

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(primitivesRemove).toHaveBeenCalledWith(unselected);
      const [slab, wall] = drawnCaps();
      expect(slab.id).toMatchObject({ elementId: 'slab' });
      expect(capColor(slab)).toEqual(greySlab);
      expect(capColor(wall)).toEqual(highlight);
      const selectedPrimitive = primitivesAdd.mock.lastCall?.[0];
      expect((selectedPrimitive?.appearance as PerInstanceColorAppearance).translucent).toBe(true);

      act(() => {
        useElementStore.getState().clearSelection();
      });

      expect(drawnCaps().map(capColor)).toEqual([greySlab, greySlab]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
