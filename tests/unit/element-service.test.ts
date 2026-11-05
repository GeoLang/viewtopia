import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ElementService } from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import {
  ElementApiError,
  TiletopiaElementService,
  elementFilter,
  groupElements,
  listMatchingElements,
  meshedContentsOf,
  readElementsById,
  resolveElementFilter,
  resolveElementIds,
  searchElements,
  searchMatchingElements,
  type ElementTreeNode,
} from '../../src/features/elements/elementService';
import { ELEMENT_ID_LIMIT, elementIdOf, tiletopiaAssetId } from '../../src/features/elements/store';
import { FakeElementServer, fakeTileFeature } from './stubs/fakeElementServer';

const ASSET = 'a1b2';
const GLOBAL_ID = '2O2Fr$t4X7Zf8NOew3FLOH';
const LOCATION = { center: { longitude: -71.061, latitude: 42.357, height: 12.5 }, radius: 4.2 };

let server: FakeElementServer;

beforeEach(() => {
  server = new FakeElementServer();
  server.install();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
});

afterEach(() => {
  server.restore();
});

describe('TiletopiaElementService over a server that is not Ion', () => {
  const service = new TiletopiaElementService(ASSET);

  it('is an ElementService', () => {
    expect(service).toBeInstanceOf(ElementService);
  });

  it('sends the token as a header and never in the query string', async () => {
    server.answer = () => ({ body: { nodes: [] } });

    await service.getElementTreeChildren();

    const [request] = server.requests;
    expect(request.path).toBe(`/v1/assets/${ASSET}/tree/children`);
    expect(request.authorization).toBe('Bearer jwt-token');
    expect(request.url.searchParams.has('access_token')).toBe(false);
  });

  it('uses a renewed token on the next request', async () => {
    server.answer = () => ({ body: { nodes: [] } });
    await service.getElementTreeChildren();

    useAuthStore.setState({ token: 'renewed-token', loggedIn: true });
    await service.getElementTreeChildren();

    expect(server.requests.map((request) => request.authorization)).toEqual([
      'Bearer jwt-token',
      'Bearer renewed-token',
    ]);
  });

  it('lists a page with its filter, and turns a null label into no label', async () => {
    server.answer = () => ({
      body: {
        items: [{ id: GLOBAL_ID, label: null, ifcClass: 'IfcWall', storey: 'Level 1' }],
        total: 7,
        continuationToken: '4182',
      },
    });

    const page = await service.listElements({ top: 50, filter: { '@classFullName': 'IfcWall' } });

    const [{ url, path }] = server.requests;
    expect(path).toBe(`/v1/assets/${ASSET}/elements`);
    expect(url.searchParams.get('top')).toBe('50');
    expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({ '@classFullName': 'IfcWall' });
    expect(page).toEqual({
      items: [{ id: GLOBAL_ID, label: undefined, ifcClass: 'IfcWall', storey: 'Level 1' }],
      total: 7,
      continuationToken: '4182',
    });
  });

  it('reads one element with a dollar sign in its id', async () => {
    const properties = {
      'Pset_WallCommon.FireRating': { displayValue: 'REI60', value: 'REI60', units: null },
    };
    server.answer = () => ({
      body: {
        id: GLOBAL_ID,
        label: 'Wall 1',
        location: LOCATION,
        ifcClass: 'IfcWall',
        storey: 'Level 1',
        parentId: 'parent',
        properties,
      },
    });

    const element = await service.getElement(GLOBAL_ID);

    expect(server.requests[0].path).toBe(`/v1/assets/${ASSET}/elements/${GLOBAL_ID}`);
    expect(element).toMatchObject({ id: GLOBAL_ID, label: 'Wall 1', parentId: 'parent', properties });
  });

  it('aggregates property keys', async () => {
    const aggregations = [{ propertyKey: 'Q.Length', count: 2, min: 1, max: 3, avg: 2, sum: 4, units: ['m', 'mm'] }];
    server.answer = () => ({ body: { total: 2, aggregations } });

    const result = await service.aggregate({ propertyKeys: ['Q.Length'] });

    const { url, path } = server.requests[0];
    expect(path).toBe(`/v1/assets/${ASSET}/elements/aggregate`);
    expect(JSON.parse(url.searchParams.get('aggregations') ?? '')).toEqual(['Q.Length']);
    expect(result).toEqual({ total: 2, aggregations });
  });

  it('reads tree children by node key, keeping the IFC class, and the path to an element', async () => {
    const node = { kind: 'model', key: 'k', label: 'Level 1', hasChildren: true, id: 'k', ifcClass: 'IfcBuildingStorey' };
    const path = [{ kind: 'subject', id: 'p' }, { kind: 'element', id: GLOBAL_ID }];
    server.answer = (request) =>
      request.path.endsWith('tree/children') ? { body: { nodes: [node] } } : { body: { path } };

    expect(await service.getElementTreeChildren({ nodeKey: 'p' })).toEqual({ nodes: [node] });
    expect(server.requests[0].url.searchParams.get('nodeKey')).toBe('p');

    expect(await service.getElementTreeParents(GLOBAL_ID)).toEqual({ path });
    expect(server.requests[1].url.searchParams.get('elementId')).toBe(GLOBAL_ID);
  });
});

describe('refusals', () => {
  const service = new TiletopiaElementService(ASSET);

  it('sends nothing when signed out', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });

    await expect(service.getElementTreeChildren()).rejects.toThrow(/Sign in/);
    expect(server.requests).toEqual([]);
  });

  it('carries the code and message of the error body', async () => {
    const message = 'This asset has no element store. Only an IFC model that finished tiling has one.';
    server.answer = () => ({ status: 404, body: { code: 'ASSET_HAS_NO_ELEMENT_STORE', message } });

    const failure = await service.getElementTreeChildren().catch((caught: unknown) => caught);

    expect(failure).toBeInstanceOf(ElementApiError);
    expect(failure).toMatchObject({ message, status: 404, code: 'ASSET_HAS_NO_ELEMENT_STORE' });
  });

  it('asks for a sign-in on the empty 401 the auth middleware answers', async () => {
    server.answer = () => ({ status: 401, body: '' });

    await expect(service.getElementTreeChildren()).rejects.toThrow(/Sign in/);
  });

  it('names tiletopia as unreachable on a 502 page of html and on a dropped connection', async () => {
    server.answer = () => ({ status: 502, body: '<html>bad gateway</html>' });
    await expect(service.getElementTreeChildren()).rejects.toThrow(/tiletopia \(tiles\) is unreachable/);

    server.answer = () => ({ networkFailure: true });
    await expect(service.getElementTreeChildren()).rejects.toThrow(/tiletopia \(tiles\) is unreachable/);
  });
});

describe('search and group-by beside the service', () => {
  it('reads a search page into rows', async () => {
    server.answer = () => ({
      body: {
        items: [{ id: GLOBAL_ID, location: LOCATION, properties: { className: 'IfcWall', userLabel: 'Wall 1' } }],
        total: 1,
        continuationToken: '50',
      },
    });

    const page = await searchElements(ASSET, 'fire + wall');

    const { url, path } = server.requests[0];
    expect(path).toBe(`/v1/assets/${ASSET}/elements/search`);
    expect(url.searchParams.get('search')).toBe('fire + wall');
    expect(page).toEqual({
      items: [{ id: GLOBAL_ID, location: LOCATION, label: 'Wall 1', ifcClass: 'IfcWall' }],
      continuationToken: '50',
    });
  });

  it('asks for groups with no aggregations', async () => {
    const groups = [{ value: 'Level 1', total: 12, aggregations: [] }];
    server.answer = () => ({ body: { total: 12, aggregations: [], groups } });

    const result = await groupElements(ASSET, '@storey', { '@classFullName': 'IfcDoor' });

    const { url } = server.requests[0];
    expect(url.searchParams.get('groupBy')).toBe('@storey');
    expect(url.searchParams.has('aggregations')).toBe(false);
    expect(JSON.parse(url.searchParams.get('filter') ?? '')).toEqual({ '@classFullName': 'IfcDoor' });
    expect(result.groups).toEqual(groups);
  });

  it('builds a filter from what is set', () => {
    expect(elementFilter({})).toEqual({});
    expect(elementFilter({ ifcClass: 'IfcDoor', storey: 'Level 3' })).toEqual({
      '@classFullName': 'IfcDoor',
      '@storey': 'Level 3',
    });
  });
});

describe('resolving a choice', () => {
  const service = new TiletopiaElementService(ASSET);

  const listRow = (id: string, meshed = true) => ({
    id,
    label: null,
    ifcClass: 'IfcWall',
    storey: 'Level 1',
    ...(meshed ? { location: LOCATION } : {}),
  });
  const treeNode = (id: string, kind: string, hasChildren: boolean): ElementTreeNode => ({
    id,
    kind,
    hasChildren,
    key: `key-${id}`,
    label: id,
    ifcClass: 'IfcWall',
  });
  const requestedIds = (url: URL): string[] =>
    JSON.parse(url.searchParams.get('filter') ?? '{}')['@id']?.$in ?? [];

  it('follows every page of a filter', async () => {
    server.answer = ({ url }) =>
      url.searchParams.has('continuationToken')
        ? { body: { items: [listRow('b')], total: 2 } }
        : { body: { items: [listRow('a')], total: 2, continuationToken: '1' } };

    const rows = await listMatchingElements(service, {});

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(server.requests[1].url.searchParams.get('continuationToken')).toBe('1');
    expect(server.requests[0].url.searchParams.get('top')).toBe('1000');
  });

  it('refuses a filter past the limit on the first page instead of truncating', async () => {
    server.answer = () => ({
      body: { items: [], total: ELEMENT_ID_LIMIT + 1, continuationToken: '1000' },
    });

    await expect(listMatchingElements(service, {})).rejects.toThrow(
      `${ELEMENT_ID_LIMIT + 1} elements match, over the limit of ${ELEMENT_ID_LIMIT}`,
    );
    expect(server.requests).toHaveLength(1);
  });

  it('refuses a search past what a search can choose', async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `id-${index}`,
      properties: { className: 'IfcDoor' },
    }));
    server.answer = () => ({ body: { items, total: 50, continuationToken: 'next' } });

    await expect(searchMatchingElements(ASSET, 'door')).rejects.toThrow(/matches over 1000 elements/);
  });

  it('checks ids with one request per hundred, and names the ones not found', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    server.answer = ({ url }) => ({
      body: {
        items: requestedIds(url).filter((id) => id !== 'id-7' && id !== 'id-249').map((id) => listRow(id)),
        total: 1,
      },
    });

    const { rows, notFound } = await readElementsById(service, ids);

    expect(server.requests.map(({ url }) => requestedIds(url).length)).toEqual([100, 100, 50]);
    expect(server.requests.every(({ url }) => url.searchParams.get('top') === '100')).toBe(true);
    expect(rows).toHaveLength(248);
    expect(notFound).toEqual(['id-7', 'id-249']);
  });

  it('refuses more ids than the limit without asking the server', async () => {
    const ids = Array.from({ length: ELEMENT_ID_LIMIT + 1 }, (_, index) => `id-${index}`);

    await expect(readElementsById(service, ids)).rejects.toThrow(/over the limit/);
    expect(server.requests).toEqual([]);
  });

  it('counts a filter match with no mesh apart from one that has a mesh', async () => {
    server.answer = () => ({ body: { items: [listRow('wall'), listRow('space', false)], total: 2 } });

    const resolved = await resolveElementFilter(service, {});

    expect(resolved.located.map((row) => row.id)).toEqual(['wall']);
    expect(resolved.withoutMesh).toEqual(['space']);
  });

  describe('a storey', () => {
    const STOREY = treeNode('storey', 'model', true);

    const answerStorey = (sameNamedStoreys: number) => (request: { path: string; url: URL }) => {
      const { path, url } = request;
      if (path.endsWith('/elements/storey')) {
        return { body: { ...listRow('storey', false), storey: 'Level 1', parentId: 'b', properties: {} } };
      }
      if (path.endsWith('/tree/children')) {
        const byKey: Record<string, ElementTreeNode[]> = {
          'key-storey': [treeNode('wall', 'element', false), treeNode('door', 'element', false)],
        };
        return { body: { nodes: byKey[url.searchParams.get('nodeKey') ?? ''] ?? [] } };
      }
      const filter = JSON.parse(url.searchParams.get('filter') ?? '{}');
      if (filter['@classFullName'] === 'IfcBuildingStorey') {
        return { body: { items: [], total: sameNamedStoreys } };
      }
      if (filter['@storey'] === 'Level 1') {
        return { body: { items: [listRow('storey', false), listRow('wall'), listRow('door')], total: 3 } };
      }
      return { body: { items: requestedIds(url).map((id) => listRow(id)), total: 1 } };
    };

    it('reads its contents through @storey, leaving out what has no mesh', async () => {
      server.answer = answerStorey(1);

      const contents = await meshedContentsOf(service, STOREY);

      expect(contents.map((row) => row.id).sort()).toEqual(['door', 'wall']);
      const filters = server
        .requestsTo(`/v1/assets/${ASSET}/elements`)
        .map(({ url }) => JSON.parse(url.searchParams.get('filter') ?? '{}'));
      expect(filters).toContainEqual({ '@storey': 'Level 1' });
    });

    it('walks the tree instead when another storey has the same name', async () => {
      server.answer = answerStorey(2);

      const contents = await meshedContentsOf(service, STOREY);

      expect(contents.map((row) => row.id).sort()).toEqual(['door', 'wall']);
      const filters = server
        .requestsTo(`/v1/assets/${ASSET}/elements`)
        .map(({ url }) => JSON.parse(url.searchParams.get('filter') ?? '{}'));
      expect(filters).not.toContainEqual({ '@storey': 'Level 1' });
    });
  });

  it('walks a space, and a container past the limit is refused', async () => {
    const SPACE = treeNode('space', 'element', true);
    server.answer = ({ path, url }) => {
      if (path.endsWith('/tree/children')) {
        return { body: { nodes: [treeNode('chair', 'element', false)] } };
      }
      return {
        body: {
          items: requestedIds(url).map((id) => listRow(id, id !== 'space')),
          total: 2,
        },
      };
    };

    const contents = await meshedContentsOf(service, SPACE);
    expect(contents.map((row) => row.id)).toEqual(['chair']);

    const crowded = Array.from({ length: ELEMENT_ID_LIMIT + 1 }, (_, index) =>
      treeNode(`child-${index}`, 'element', false),
    );
    server.answer = () => ({ body: { nodes: crowded } });
    await expect(meshedContentsOf(service, treeNode('site', 'subject', true))).rejects.toThrow(
      /over the limit/,
    );
  });

  it('turns an id with no mesh into what is inside it, and says when there is nothing', async () => {
    const TREE: Record<string, ElementTreeNode[]> = {
      '': [treeNode('site', 'subject', true)],
      'key-site': [treeNode('empty', 'element', false), treeNode('space', 'element', true)],
      'key-space': [treeNode('chair', 'element', false)],
    };
    server.answer = ({ path, url }) => {
      if (path.endsWith('/tree/children')) {
        return { body: { nodes: TREE[url.searchParams.get('nodeKey') ?? ''] ?? [] } };
      }
      if (path.endsWith('/tree/parents')) {
        const id = url.searchParams.get('elementId');
        return { body: { path: [{ kind: 'subject', id: 'site' }, { kind: 'element', id }] } };
      }
      return {
        body: {
          items: requestedIds(url)
            .filter((id) => id !== 'unknown')
            .map((id) => listRow(id, id === 'wall' || id === 'chair')),
          total: 1,
        },
      };
    };

    const resolved = await resolveElementIds(service, ['wall', 'space', 'empty', 'unknown']);

    expect(resolved.located.map((row) => row.id).sort()).toEqual(['chair', 'wall']);
    expect(resolved.notFound).toEqual(['unknown']);
    expect(resolved.withoutMesh).toEqual(['empty']);
  });
});

describe('reading ids', () => {
  it('reads the GlobalId from asset_id, and no id from an empty or missing one', () => {
    expect(elementIdOf(fakeTileFeature({ asset_id: GLOBAL_ID }))).toBe(GLOBAL_ID);
    expect(elementIdOf(fakeTileFeature({ asset_id: '' }))).toBeUndefined();
    expect(elementIdOf(fakeTileFeature({ element: 7 }))).toBeUndefined();
  });

  it('reads an asset id only off a tileset url on this origin', () => {
    expect(tiletopiaAssetId('/tiles/v1/assets/a1b2/tileset.json')).toBe('a1b2');
    expect(tiletopiaAssetId('/v1/assets/a1b2/tileset.json')).toBe('a1b2');
    expect(tiletopiaAssetId('https://elsewhere.example/v1/assets/a1b2/tileset.json')).toBeNull();
    expect(tiletopiaAssetId('/models/tileset.json')).toBeNull();
  });
});
