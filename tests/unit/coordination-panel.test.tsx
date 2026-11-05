import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import {
  BoundingSphere,
  Cartesian3,
  Math as CesiumMath,
  Matrix4,
  Transforms,
  type Cesium3DTileset,
  type Viewer,
} from 'cesium';
import { useAuthStore } from '../../src/features/auth/store';
import { ElementPanel } from '../../src/features/elements/ElementPanel';
import { useElementStore } from '../../src/features/elements/store';
import { useAppStore } from '../../src/store/app';
import { useFeaturePickerStore } from '../../src/store/featurePicker';
import { useTiles3dLayerStore } from '../../src/store/tiles3dLayers';
import { setActiveCesiumViewer } from '../../src/viewer/registry';
import { FakeElementServer, type ElementServerRequest } from './stubs/fakeElementServer';
import { WITH_ELEMENT_IDS } from './stubs/fakeBimViewer';

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
Element.prototype.scrollIntoView = vi.fn();

const ASSET = 'a1b2';
const MODEL_LAYER = { id: ASSET, name: 'tower.ifc', url: `/tiles/v1/assets/${ASSET}/tileset.json`, visible: true };
const LOCATION = { center: { longitude: -71.061, latitude: 42.357, height: 12.5 }, radius: 4.2 };
const PLACEMENT = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-71, 42, 10));
const TOPIC_GUID = '5a0e0c5e-1b1b-4a2a-8a55-0f3a7c9d1e01';
const VIEWPOINT_GUID = '6b1f1d6f-2c2c-4b3b-9b66-1a4b8dae2f02';
const VERSION_1 = '8d1f0000-0000-4000-8000-000000000001';
const VERSION_2 = '8d1f0000-0000-4000-8000-000000000002';
const REPORT_ID = '2b7e0000-0000-4000-8000-000000000003';

const SUMMARY = {
  guid: TOPIC_GUID,
  serverAssignedId: 'ISSUE-7',
  title: 'Duct and wall clash',
  topicType: 'CLASH',
  topicStatus: 'OPEN',
  priority: 'HIGH',
  labels: [],
  assignedTo: null,
  dueDate: null,
  creationDate: '2026-11-01T09:30:00Z',
  creationAuthor: 'ada@example.test',
  commentCount: 1,
  viewpointCount: 1,
};

const TOPIC = {
  ...SUMMARY,
  description: 'The duct runs through the wall',
  comments: [
    {
      guid: '7c2a2e7a-3d3d-4c4c-ac77-2b5c9ebf3a03',
      date: '2026-11-03T08:00:00Z',
      author: 'ada@example.test',
      comment: 'Please move the duct',
      viewpointGuid: VIEWPOINT_GUID,
      modifiedDate: null,
      modifiedAuthor: null,
    },
  ],
  viewpoints: [
    {
      guid: VIEWPOINT_GUID,
      index: 1,
      snapshotFormat: 'png',
      camera: {
        kind: 'perspective',
        cameraViewPoint: [1.5, -2.25, 3.75],
        cameraDirection: [0, 1, 0],
        cameraUpVector: [0, 0, 1],
        fieldOfView: 60,
        aspectRatio: 1.5,
      },
      selection: [{ ifcGuid: 'wall', originatingSystem: null, authoringToolId: null }],
      visibility: {
        defaultVisibility: true,
        spacesVisible: true,
        spaceBoundariesVisible: true,
        openingsVisible: true,
        exceptions: [{ ifcGuid: 'door', originatingSystem: null, authoringToolId: null }],
      },
      coloring: [],
      lines: [],
      clippingPlanes: [],
    },
  ],
};

function version(id: string, versionNumber: number) {
  return {
    assetId: 10 + versionNumber,
    creationTimestamp: '2026-11-05T12:00:00+00:00',
    id,
    baseAssetId: VERSION_1,
    versionNumber,
    name: `tower-v${versionNumber}.ifc`,
    status: 'ready',
    hasElementStore: true,
  };
}

function report(status: string) {
  return {
    id: REPORT_ID,
    type: 'CHANGE_DETECTION',
    status,
    dateAdded: '2026-11-05T12:05:00+00:00',
    fromAssetId: VERSION_1,
    toAssetId: VERSION_2,
    summary: { added: 1, removed: 0, changed: 1, unchanged: 8 },
    error: null,
  };
}

const REMOVED_DOOR = {
  kind: 'removed',
  id: 'gone-door',
  label: 'Door 4',
  ifcClass: 'IfcDoor',
  changedKeys: [],
  geometryChanged: false,
  locationChanged: false,
};
const NOT_IN_OPEN_VERSION = new Set([REMOVED_DOOR.id]);
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SNAPSHOT_PATH = `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}/viewpoints/${VIEWPOINT_GUID}/snapshot`;
const TOPIC_WRITE_PATH = new RegExp(`^/v1/assets/${ASSET}/bcf/topics/([^/]+)$`);
const CAMERA_POSITION = Cartesian3.fromDegrees(-71, 42, 40);
const VERTICAL_FIELD_OF_VIEW = 0.9;

const CHANGED_WALL = {
  kind: 'changed',
  id: 'wall',
  label: 'Wall 1',
  ifcClass: 'IfcWall',
  changedKeys: ['@storey', 'Pset_WallCommon.FireRating'],
  geometryChanged: true,
  locationChanged: false,
};

function ifcTesterFailure(globalId: string, name: string, ifcClass: string, stepId: number) {
  return {
    reason: 'The required property set does not exist',
    element: `#${stepId}=${ifcClass}('${globalId}',$,'${name}',$,$,$,$,$,$)`,
    element_type: null,
    class: ifcClass,
    predefined_type: 'NOTDEFINED',
    name,
    description: null,
    id: stepId,
    global_id: globalId,
    tag: null,
  };
}

function ifcTesterRequirement(description: string, failed: ReturnType<typeof ifcTesterFailure>[], applicable: number) {
  return {
    facet_type: 'Property',
    metadata: {},
    label: 'Pset_WallCommon.FireRating',
    value: '',
    description,
    status: failed.length === 0,
    passed_entities: [],
    failed_entities: failed,
    total_applicable: applicable,
    total_pass: applicable - failed.length,
    total_fail: failed.length,
    percent_pass: Math.floor(((applicable - failed.length) / applicable) * 100),
  };
}

function ifcTesterSpecification(name: string, requirement: ReturnType<typeof ifcTesterRequirement>) {
  const passing = requirement.total_applicable - requirement.failed_entities.length;
  return {
    name,
    description: null,
    instructions: null,
    status: requirement.status,
    is_skipped: false,
    is_ifc_version: true,
    total_applicable: requirement.total_applicable,
    total_applicable_pass: passing,
    total_applicable_fail: requirement.failed_entities.length,
    applicable_entities: [],
    percent_applicable_pass: requirement.percent_pass,
    total_checks: requirement.total_applicable,
    total_checks_pass: passing,
    total_checks_fail: requirement.failed_entities.length,
    percent_checks_pass: requirement.percent_pass,
    cardinality: 'required',
    applicability: ['All IfcWall data'],
    requirements: [requirement],
  };
}

// the shape of ifctester's reporter.Json output, which tiletopia passes through verbatim
const IDS_REPORT = {
  title: 'Fire safety',
  date: '2026-11-05 12:10:00',
  filepath: '/data/ids/rules.ids',
  filename: 'rules.ids',
  hide_skipped: false,
  status: false,
  total_specifications: 2,
  total_specifications_pass: 1,
  total_specifications_fail: 1,
  percent_specifications_pass: 50,
  total_requirements: 2,
  total_requirements_pass: 1,
  total_requirements_fail: 1,
  percent_requirements_pass: 50,
  total_checks: 4,
  total_checks_pass: 2,
  total_checks_fail: 2,
  percent_checks_pass: 50,
  specifications: [
    ifcTesterSpecification(
      'Walls and doors have a fire rating',
      ifcTesterRequirement(
        'Pset_WallCommon.FireRating data shall be provided',
        [ifcTesterFailure('wall', 'Wall 1', 'IfcWall', 42), ifcTesterFailure(REMOVED_DOOR.id, 'Door 4', 'IfcDoor', 57)],
        3,
      ),
    ),
    ifcTesterSpecification('Slabs are named', ifcTesterRequirement('Name data shall be provided', [], 1)),
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const tiletopia = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
let writesAnswer: (path: string, method: string) => Response | null = () => null;
let idsCheck: unknown = null;

async function answerTiletopia(path: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const written = writesAnswer(path, method);
  if (written) return written;
  const url = new URL(path, 'http://viewer.test');
  const topicWrite = TOPIC_WRITE_PATH.exec(url.pathname);
  if (topicWrite && method === 'PUT') return json(JSON.parse(init.body as string), 201);
  if (topicWrite && method === 'DELETE') return new Response(null, { status: 204 });
  const routes: Record<string, () => Response> = {
    [`GET /tiles/v1/assets/${ASSET}/jobs`]: () => json([]),
    [`GET /v1/assets/${ASSET}/bcf/topics`]: () => json({ items: [SUMMARY], total: 1 }),
    [`GET /v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`]: () => json(TOPIC),
    [`GET ${SNAPSHOT_PATH}`]: () => new Response(PNG_SIGNATURE, { headers: { 'Content-Type': 'image/png' } }),
    [`POST /v1/assets/${ASSET}/bcf/import`]: () =>
      json({
        topics: 1,
        created: 1,
        updated: 0,
        comments: 1,
        viewpoints: 1,
        snapshots: 0,
        elementReferences: { total: 2, distinctIds: 2, unknownIds: 1, withoutIfcGuid: 0 },
        dropped: { documents: 2, bitmaps: 0 },
      }),
    [`GET /v1/assets/${ASSET}/tileset-revisions`]: () =>
      json({ items: [version(VERSION_2, 2), version(VERSION_1, 1)], total: 2 }),
    [`POST /tiles/v1/assets`]: () => json({ id: 'new-version', name: 'tower-v3.ifc', status: 'uploading' }, 201),
    [`POST /v1/assets/compare`]: () => json(report('NOT_STARTED')),
    [`GET /v1/change-reports/${REPORT_ID}`]: () => json(report('COMPLETE')),
    [`GET /v1/change-reports/${REPORT_ID}/changes`]: () =>
      json({ items: url.searchParams.get('kind') === 'added' ? [] : [CHANGED_WALL, REMOVED_DOOR] }),
    [`GET /v1/assets/${ASSET}/ids`]: () =>
      idsCheck === null
        ? json({ code: 'IDS_NOT_CHECKED', message: 'this asset has not been checked against an IDS file' }, 404)
        : json(idsCheck),
    [`POST /v1/assets/${ASSET}/ids`]: () => {
      idsCheck = {
        idsFileName: 'rules.ids',
        status: 'done',
        checkedAt: '2026-11-05T12:10:00+00:00',
        error: null,
        report: IDS_REPORT,
      };
      return json({ status: 'running' }, 202);
    },
    [`GET /v1/assets/${ASSET}/dxf`]: () =>
      new Response('0\nSECTION', { headers: { 'Content-Disposition': 'attachment; filename="model-11.dxf"' } }),
  };
  const route = routes[`${method} ${url.pathname}`];
  return route ? route() : json({ code: 'ResourceNotFound', message: `no route ${method} ${url.pathname}` }, 404);
}

function answerElements({ url, path }: ElementServerRequest) {
  if (path === `/v1/assets/${ASSET}/tree/children`) return { body: { nodes: [] } };
  if (path === `/v1/assets/${ASSET}/elements/aggregate`) return { body: { total: 0, aggregations: [], groups: [] } };
  if (path === `/v1/assets/${ASSET}/elements`) {
    const wanted: string[] = JSON.parse(url.searchParams.get('filter') ?? '{}')['@id']?.$in ?? [];
    const items = wanted.filter((id) => !NOT_IN_OPEN_VERSION.has(id)).map((id) => ({ id, label: id, ifcClass: 'IfcWall', storey: 'Level 1', location: LOCATION }));
    return { body: { items, total: items.length } };
  }
  return { status: 404, body: { code: 'ResourceNotFound', message: path } };
}

const setView = vi.fn();
const flyToBoundingSphere = vi.fn();
let server: FakeElementServer;

function requestsTo(method: string, pathname: string): [string, RequestInit | undefined][] {
  return tiletopia.mock.calls.filter(
    ([path, init]) => (init?.method ?? 'GET') === method && new URL(path, 'http://viewer.test').pathname === pathname,
  );
}

async function openTab(name: string) {
  render(
    <MantineProvider env="test">
      <ElementPanel onClose={() => {}} />
    </MantineProvider>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('tab', { name }));
  await act(async () => {});
}

function requestBody(request: [string, RequestInit?]) {
  return JSON.parse(request[1]?.body as string);
}

async function chooseTopic() {
  await openTab('Issues');
  fireEvent.click(await screen.findByTestId(`bcf-topic-${TOPIC_GUID}`));
  await screen.findByTestId('bcf-restored');
}

function chooseFile(file: File) {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  server = new FakeElementServer();
  server.answer = answerElements;
  server.install();
  tiletopia.mockReset();
  tiletopia.mockImplementation(answerTiletopia);
  writesAnswer = () => null;
  idsCheck = null;
  vi.stubGlobal('fetch', tiletopia);
  setView.mockClear();
  flyToBoundingSphere.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:snapshot');
  URL.revokeObjectURL = vi.fn();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true, user: { email: 'grace@example.test' } });
  useAppStore.setState({ renderer: 'cesium', activeTab: 'globe', activePanel: 'modelElements' });
  useFeaturePickerStore.setState({ enabled: false, selected: null });
  useElementStore.setState({ model: null, selected: new Set(), hidden: new Set(), isolated: null, focused: null });
  const sphere = new BoundingSphere(Matrix4.multiplyByPoint(PLACEMENT, new Cartesian3(5, 2, 10), new Cartesian3()), 20);
  const tileset = {
    root: { content: WITH_ELEMENT_IDS, children: [], computedTransform: PLACEMENT, boundingSphere: sphere },
    boundingSphere: sphere,
    clippingPlanes: undefined,
  } as unknown as Cesium3DTileset;
  useTiles3dLayerStore.setState({ layers: [MODEL_LAYER], loaded: { [ASSET]: tileset } });
  setActiveCesiumViewer({
    isDestroyed: () => false,
    camera: {
      setView,
      flyToBoundingSphere,
      positionWC: CAMERA_POSITION,
      directionWC: Cartesian3.negate(Cartesian3.normalize(CAMERA_POSITION, new Cartesian3()), new Cartesian3()),
      upWC: Cartesian3.UNIT_Z,
      frustum: { fovy: VERTICAL_FIELD_OF_VIEW, aspectRatio: 1.5 },
    },
    scene: { requestRender: vi.fn() },
  } as unknown as Viewer);
});

afterEach(() => {
  server.restore();
  setActiveCesiumViewer(null);
});

describe('model issues', () => {
  it('lists topics, and choosing one shows its comments and restores its viewpoint', async () => {
    await openTab('Issues');

    fireEvent.click(await screen.findByTestId(`bcf-topic-${TOPIC_GUID}`));

    expect(await screen.findByTestId('bcf-restored')).toHaveTextContent('1 selected and 1 hidden');
    expect(within(screen.getByTestId('bcf-topic-detail')).getByText('Please move the duct')).toBeInTheDocument();
    expect(setView).toHaveBeenCalledTimes(1);
    expect([...useElementStore.getState().selected]).toEqual(['wall']);
    expect([...useElementStore.getState().hidden]).toEqual(['door']);
    expect(new Headers(requestsTo('GET', `/v1/assets/${ASSET}/bcf/topics`)[0][1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-token',
    );
  });

  it('imports a BCF file, reports what came in, and reads the topics again', async () => {
    await openTab('Issues');
    await screen.findByTestId(`bcf-topic-${TOPIC_GUID}`);

    chooseFile(new File(['zip'], 'issues.bcf'));

    expect(await screen.findByTestId('bcf-notice')).toHaveTextContent(
      'Imported 1 topics, 1 new and 0 replaced, with 1 comments and 1 viewpoints. 1 element ids are not in this version of the model. Not stored, so an export lacks them: 2 documents.',
    );
    await waitFor(() => expect(requestsTo('GET', `/v1/assets/${ASSET}/bcf/topics`)).toHaveLength(2));
  });

  it("shows tiletopia's 403 to a viewer role as a role refusal", async () => {
    writesAnswer = (path) => (path.endsWith('/bcf/import') ? new Response(null, { status: 403 }) : null);
    await openTab('Issues');

    chooseFile(new File(['zip'], 'issues.bcf'));

    expect(await screen.findByTestId('bcf-error')).toHaveTextContent('Your role cannot make this change');
  });

  it('creates a topic through PUT with the current view as its viewpoint', async () => {
    await openTab('Issues');
    await screen.findByTestId(`bcf-topic-${TOPIC_GUID}`);
    act(() => useElementStore.setState({ selected: new Set(['wall']), hidden: new Set(['door']), isolated: null }));

    fireEvent.click(screen.getByRole('button', { name: 'New topic' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Missing fire door' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Type' }), { target: { value: 'ISSUE' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'OPEN' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Level 1 stair core' } });
    fireEvent.click(screen.getByLabelText('Add the current view as a viewpoint'));
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));

    expect(await screen.findByTestId('bcf-notice')).toHaveTextContent('Saved Missing fire door.');
    const puts = tiletopia.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(1);
    const body = requestBody(puts[0]);
    expect(new URL(puts[0][0], 'http://viewer.test').pathname).toBe(`/v1/assets/${ASSET}/bcf/topics/${body.guid}`);
    expect(new Headers(puts[0][1]?.headers).get('Authorization')).toBe('Bearer jwt-token');
    expect(body).toMatchObject({
      title: 'Missing fire door',
      topicType: 'ISSUE',
      topicStatus: 'OPEN',
      description: 'Level 1 stair core',
      creationAuthor: 'grace@example.test',
      comments: [],
    });
    const [viewpoint] = body.viewpoints;
    expect(viewpoint.selection.map((component: { ifcGuid: string }) => component.ifcGuid)).toEqual(['wall']);
    expect(viewpoint.visibility).toMatchObject({ defaultVisibility: true, exceptions: [{ ifcGuid: 'door' }] });
    const cameraOnGlobe = Matrix4.multiplyByPoint(
      PLACEMENT,
      Cartesian3.fromArray(viewpoint.camera.cameraViewPoint),
      new Cartesian3(),
    );
    expect(Cartesian3.distance(cameraOnGlobe, CAMERA_POSITION)).toBeLessThan(1e-6);
    expect(viewpoint.camera.fieldOfView).toBeCloseTo(CesiumMath.toDegrees(VERTICAL_FIELD_OF_VIEW), 9);
    await waitFor(() => expect(requestsTo('GET', `/v1/assets/${ASSET}/bcf/topics`)).toHaveLength(2));
  });

  it('edits a topic and adds a comment, each on a fresh read of the topic', async () => {
    await chooseTopic();
    const readsBefore = requestsTo('GET', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`).length;

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Status' }), { target: { value: 'CLOSED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
    await waitFor(() => expect(requestsTo('PUT', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)).toHaveLength(1));

    const [edit] = requestsTo('PUT', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`);
    expect(requestBody(edit)).toMatchObject({
      guid: TOPIC_GUID,
      title: 'Duct and wall clash',
      topicStatus: 'CLOSED',
      creationAuthor: 'ada@example.test',
      modifiedAuthor: 'grace@example.test',
      comments: TOPIC.comments,
      viewpoints: TOPIC.viewpoints,
    });

    fireEvent.change(await screen.findByLabelText('New comment'), { target: { value: 'Moved in revision C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
    await waitFor(() => expect(requestsTo('PUT', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)).toHaveLength(2));

    const comments = requestBody(requestsTo('PUT', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)[1]).comments;
    expect(comments).toHaveLength(2);
    expect(comments[0]).toEqual(TOPIC.comments[0]);
    expect(comments[1]).toMatchObject({ author: 'grace@example.test', comment: 'Moved in revision C' });
    expect(requestsTo('GET', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)).toHaveLength(readsBefore + 2);
    expect(await screen.findByText('Moved in revision C')).toBeInTheDocument();
  });

  it('deletes a topic through DELETE once confirmed', async () => {
    await chooseTopic();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(requestsTo('DELETE', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Delete topic' }));

    expect(await screen.findByTestId('bcf-notice')).toHaveTextContent('Deleted Duct and wall clash.');
    expect(requestsTo('DELETE', `/v1/assets/${ASSET}/bcf/topics/${TOPIC_GUID}`)).toHaveLength(1);
    expect(screen.queryByTestId('bcf-topic-detail')).not.toBeInTheDocument();
  });

  it("shows tiletopia's 403 on a comment as a role refusal", async () => {
    writesAnswer = (_path, method) => (method === 'PUT' ? new Response(null, { status: 403 }) : null);
    await chooseTopic();

    fireEvent.change(screen.getByLabelText('New comment'), { target: { value: 'Seen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));

    expect(await screen.findByTestId('bcf-error')).toHaveTextContent('Your role cannot make this change');
    expect(screen.queryByText('Seen', { selector: 'p' })).not.toBeInTheDocument();
  });

  it("shows a viewpoint's snapshot read with the bearer token", async () => {
    await chooseTopic();

    const image = await screen.findByRole('img', { name: 'Snapshot of viewpoint 1' });

    expect(image).toHaveAttribute('src', 'blob:snapshot');
    const [[, init]] = requestsTo('GET', SNAPSHOT_PATH);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-token');
    const [[blob]] = vi.mocked(URL.createObjectURL).mock.calls;
    expect((blob as Blob).type).toBe('image/png');
  });
});

describe('model versions', () => {
  it('compares two versions and lists the changes of the finished report', async () => {
    await openTab('Versions');
    await screen.findByTestId(`version-${VERSION_2}`);

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    expect(await screen.findByTestId('change-summary')).toHaveTextContent('1 added, 0 removed, 1 changed, 8 unchanged.');
    expect(await screen.findByTestId('change-wall')).toHaveTextContent('@storey, Pset_WallCommon.FireRating, geometry');
    const [[, compareInit]] = requestsTo('POST', '/v1/assets/compare');
    expect(JSON.parse(compareInit?.body as string)).toEqual({ fromAssetId: VERSION_1, toAssetId: VERSION_2 });

    fireEvent.click(screen.getByRole('radio', { name: 'Added' }));
    await waitFor(() => expect(screen.queryByTestId('change-wall')).not.toBeInTheDocument());
  });

  it('selects and flies to the element of a change row, and notes an element the open version lacks', async () => {
    await openTab('Versions');
    await screen.findByTestId(`version-${VERSION_2}`);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    fireEvent.click(await screen.findByTestId('change-wall'));

    await waitFor(() => expect([...useElementStore.getState().selected]).toEqual(['wall']));
    expect(flyToBoundingSphere).toHaveBeenCalledTimes(1);
    const [sphere] = flyToBoundingSphere.mock.lastCall ?? [];
    const wallCentre = Cartesian3.fromDegrees(LOCATION.center.longitude, LOCATION.center.latitude, LOCATION.center.height);
    expect(Cartesian3.distance(sphere.center, wallCentre)).toBeLessThan(1e-3);

    fireEvent.click(screen.getByTestId(`change-${REMOVED_DOOR.id}`));

    expect(await screen.findByTestId('change-show-result')).toHaveTextContent(
      'Door 4 was removed, so the open version of the model does not have it.',
    );
    expect([...useElementStore.getState().selected]).toEqual(['wall']);
    expect(flyToBoundingSphere).toHaveBeenCalledTimes(1);
  });

  it('uploads a new version of the open model and reads the version list again', async () => {
    await openTab('Versions');
    await screen.findByTestId(`version-${VERSION_2}`);

    chooseFile(new File(['ifc'], 'tower-v3.ifc'));

    expect(await screen.findByTestId('version-notice')).toHaveTextContent('tower-v3.ifc is the next version');
    const [[, uploadInit]] = requestsTo('POST', '/tiles/v1/assets');
    expect((uploadInit?.body as FormData).get('base_asset_id')).toBe(ASSET);
    await waitFor(() => expect(requestsTo('GET', `/v1/assets/${ASSET}/tileset-revisions`)).toHaveLength(2));
  });

  it('exports the open version as DXF at a cut height', async () => {
    const saved: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:dxf');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    await openTab('Versions');

    fireEvent.change(screen.getByLabelText(/Cut height/), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export DXF' }));

    await waitFor(() => expect(saved).toEqual(['model-11.dxf']));
    const [[path]] = requestsTo('GET', `/v1/assets/${ASSET}/dxf`);
    expect(new URL(path, 'http://viewer.test').searchParams.get('cutHeight')).toBe('3.5');
    click.mockRestore();
  });
});

describe('model IDS check', () => {
  it('uploads an IDS file, lists each specification and requirement, and selects a failed element', async () => {
    await openTab('IDS');
    expect(await screen.findByTestId('ids-never-checked')).toBeInTheDocument();

    chooseFile(new File(['<ids/>'], 'rules.ids'));

    expect(await screen.findByTestId('ids-summary')).toHaveTextContent(
      'Fire safety: 1 of 2 specifications pass, 2 of 4 checks pass.',
    );
    const [[, uploadInit]] = requestsTo('POST', `/v1/assets/${ASSET}/ids`);
    expect(((uploadInit?.body as FormData).get('file') as File).name).toBe('rules.ids');
    expect(new Headers(uploadInit?.headers).get('Authorization')).toBe('Bearer jwt-token');
    const failing = screen.getByTestId('ids-specification-0');
    expect(within(failing).getAllByText('fail')).toHaveLength(2);
    expect(within(failing).getByText('1 of 3 applicable elements pass.')).toBeInTheDocument();
    expect(within(screen.getByTestId('ids-requirement-0-0')).getByText('1 pass, 2 fail.')).toBeInTheDocument();
    expect(within(screen.getByTestId('ids-specification-1')).getAllByText('pass')).toHaveLength(2);
    expect(screen.getByTestId('ids-failed-wall')).toHaveTextContent('Wall 1 (IfcWall)');

    fireEvent.click(screen.getByTestId('ids-failed-wall'));

    await waitFor(() => expect([...useElementStore.getState().selected]).toEqual(['wall']));
    expect(flyToBoundingSphere).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId(`ids-failed-${REMOVED_DOOR.id}`));

    expect(await screen.findByTestId('ids-show-result')).toHaveTextContent(
      'Door 4 is not in the element store of this model.',
    );
    expect([...useElementStore.getState().selected]).toEqual(['wall']);
  });

  it("shows tiletopia's 503 text as a configuration hint", async () => {
    writesAnswer = (path, method) =>
      method === 'POST' && path.endsWith('/ids')
        ? json({ code: 'IDS_CHECK_UNAVAILABLE', message: 'TILETOPIA_IDS_CHECK_URL is not set on this server' }, 503)
        : null;
    await openTab('IDS');

    chooseFile(new File(['<ids/>'], 'rules.ids'));

    const hint = await screen.findByTestId('ids-unavailable');
    expect(hint).toHaveTextContent('TILETOPIA_IDS_CHECK_URL is not set on this server');
    expect(hint).toHaveTextContent('http://ids-check:8000');
    expect(screen.queryByTestId('ids-error')).not.toBeInTheDocument();
  });

  it.each([
    ['ASSET_NOT_IFC', "asset a1b2's source is a .glb, and only an IFC model can be checked against an IDS file"],
    ['ASSET_NOT_READY', 'asset a1b2 has status Tiling'],
  ])("shows tiletopia's 409 %s message as an error and follows no check", async (code, message) => {
    writesAnswer = (path, method) =>
      method === 'POST' && path.endsWith('/ids') ? json({ code, message }, 409) : null;
    await openTab('IDS');
    await screen.findByTestId('ids-never-checked');

    chooseFile(new File(['<ids/>'], 'rules.ids'));

    expect(await screen.findByTestId('ids-error')).toHaveTextContent(message);
    expect(screen.queryByTestId('ids-notice')).not.toBeInTheDocument();
    expect(requestsTo('GET', `/v1/assets/${ASSET}/ids`)).toHaveLength(1);
  });

  it('shows the running check on a 409 IDS_CHECK_RUNNING', async () => {
    writesAnswer = (path, method) =>
      method === 'POST' && path.endsWith('/ids')
        ? json({ code: 'IDS_CHECK_RUNNING', message: 'asset a1b2 is already being checked against an IDS file' }, 409)
        : null;
    await openTab('IDS');
    await screen.findByTestId('ids-never-checked');
    idsCheck = {
      idsFileName: 'rules.ids',
      status: 'done',
      checkedAt: '2026-11-05T12:10:00+00:00',
      error: null,
      report: IDS_REPORT,
    };

    chooseFile(new File(['<ids/>'], 'rules.ids'));

    expect(await screen.findByTestId('ids-notice')).toHaveTextContent(
      'asset a1b2 is already being checked against an IDS file Showing the check that is running.',
    );
    expect(await screen.findByTestId('ids-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('ids-error')).not.toBeInTheDocument();
  });

  it('offers no IDS tab for a model whose asset is not an IFC file', async () => {
    useTiles3dLayerStore.setState({ layers: [{ ...MODEL_LAYER, name: 'tower.glb' }] });

    await openTab('Versions');

    expect(screen.getByRole('tab', { name: 'Issues' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'IDS' })).not.toBeInTheDocument();
    expect(requestsTo('GET', `/v1/assets/${ASSET}/ids`)).toHaveLength(0);
  });

  it("shows the server's error text for a failed check", async () => {
    idsCheck = {
      idsFileName: 'broken.ids',
      status: 'failed',
      checkedAt: '2026-11-05T12:10:00+00:00',
      error: 'ifctester could not read the IDS file: line 3 is not XML',
      report: null,
    };

    await openTab('IDS');

    expect(await screen.findByTestId('ids-check-failed')).toHaveTextContent(
      'The check against broken.ids failed: ifctester could not read the IDS file: line 3 is not XML',
    );
    expect(screen.queryByTestId('ids-report')).not.toBeInTheDocument();
  });
});
