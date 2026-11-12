import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';
import {
  compareVersions,
  exportDxf,
  exportSectionDxf,
  importBcf,
  listElementChanges,
  pollChangeReport,
  pollIdsCheck,
  readLatestIdsCheck,
  startIdsCheck,
  uploadModelVersion,
  type ChangeReport,
  type IdsCheck,
} from '../../src/features/coordination/api';
import { ElementApiError } from '../../src/features/elements/elementService';

const FROM = '8d1f0000-0000-4000-8000-000000000001';
const TO = '8d1f0000-0000-4000-8000-000000000002';
const REPORT_ID = '2b7e0000-0000-4000-8000-000000000003';

function report(status: ChangeReport['status']): ChangeReport {
  return {
    id: REPORT_ID,
    status,
    dateAdded: '2026-11-05T12:05:00+00:00',
    fromAssetId: FROM,
    toAssetId: TO,
    summary: { added: 1, removed: 0, changed: 2, unchanged: 7 },
    error: null,
  };
}

function idsCheck(status: IdsCheck['status']): IdsCheck {
  return { idsFileName: 'rules.ids', status, checkedAt: null, error: null, report: null };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function sent(index: number): { path: string; init: RequestInit; authorization: string | null } {
  const [path, init = {}] = fetchMock.mock.calls[index];
  return { path, init, authorization: new Headers(init.headers).get('Authorization') };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
});

describe('coordination api', () => {
  it('imports a BCF file as the multipart field tiletopia reads, with the token as a header', async () => {
    const imported = {
      topics: 2,
      created: 1,
      updated: 1,
      comments: 4,
      viewpoints: 2,
      snapshots: 2,
      elementReferences: { total: 12, distinctIds: 10, unknownIds: 3, withoutIfcGuid: 1 },
      dropped: { documents: 0 },
    };
    fetchMock.mockResolvedValue(json(imported));
    const file = new File(['zip'], 'issues.bcf');

    expect(await importBcf('a1b2', file)).toEqual(imported);

    const { path, init, authorization } = sent(0);
    expect(path).toBe('/v1/assets/a1b2/bcf/import');
    expect(init.method).toBe('POST');
    expect(((init.body as FormData).get('file') as File).name).toBe('issues.bcf');
    expect(authorization).toBe('Bearer jwt-token');
  });

  it("raises tiletopia's code and message on a refusal", async () => {
    fetchMock.mockResolvedValue(json({ code: 'INVALID_BCF', message: 'bcf.version names 2.1' }, 400));

    const failure = await importBcf('a1b2', new File(['zip'], 'old.bcf')).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ElementApiError);
    expect(failure).toMatchObject({ status: 400, code: 'INVALID_BCF', message: 'bcf.version names 2.1' });
  });

  it('says a viewer role cannot make the change when a write answers 403', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(compareVersions(FROM, TO)).rejects.toThrow('Your role cannot make this change');
  });

  it('uploads a new version with base_asset_id, and shows the plain text refusal of the upload route', async () => {
    fetchMock.mockResolvedValue(new Response('base asset a1b2 is not a model', { status: 400 }));
    const file = new File(['ifc'], 'tower-v2.ifc');

    await expect(uploadModelVersion('a1b2', file)).rejects.toThrow('base asset a1b2 is not a model');

    const { path, init } = sent(0);
    expect(path).toBe('/tiles/v1/assets');
    const form = init.body as FormData;
    expect(form.get('base_asset_id')).toBe('a1b2');
    expect(form.get('name')).toBe('tower-v2.ifc');
    expect((form.get('file') as File).name).toBe('tower-v2.ifc');
    expect(form.get('ids')).toBeNull();
  });

  it('appends an ids file when one is given', async () => {
    fetchMock.mockResolvedValue(json({ id: 'v2', name: 'tower-v2.ifc' }));
    const file = new File(['ifc'], 'tower-v2.ifc');
    const idsFile = new File(['<ids/>'], 'walls.ids');

    await uploadModelVersion('a1b2', file, idsFile);

    const form = sent(0).init.body as FormData;
    expect((form.get('ids') as File).name).toBe('walls.ids');
    expect(form.get('base_asset_id')).toBe('a1b2');
  });

  it('finds the existing report when the pair was compared before', async () => {
    const other = { ...report('COMPLETE'), id: 'other', fromAssetId: 'older' };
    fetchMock
      .mockResolvedValueOnce(json({ code: 'REPORT_EXISTS', message: `change report ${REPORT_ID} exists` }, 409))
      .mockResolvedValueOnce(json({ items: [other, report('COMPLETE')] }));

    expect((await compareVersions(FROM, TO)).id).toBe(REPORT_ID);

    expect(JSON.parse(sent(0).init.body as string)).toEqual({ fromAssetId: FROM, toAssetId: TO });
    expect(sent(1).path).toBe(`/v1/assets/${TO}/change-reports`);
  });

  it('polls a report until it is complete', async () => {
    fetchMock
      .mockResolvedValueOnce(json(report('NOT_STARTED')))
      .mockResolvedValueOnce(json(report('IN_PROGRESS')))
      .mockResolvedValueOnce(json(report('COMPLETE')));
    const seen: string[] = [];
    const wait = vi.fn(async () => {});

    const finished = await pollChangeReport(REPORT_ID, {
      onUpdate: (update) => seen.push(update.status),
      signal: new AbortController().signal,
      wait,
    });

    expect(finished.status).toBe('COMPLETE');
    expect(seen).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE']);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(sent(2).path).toBe(`/v1/change-reports/${REPORT_ID}`);
  });

  it('pages changes by kind and continuation token', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));

    await listElementChanges(REPORT_ID, { kind: 'changed', continuationToken: '4182' });

    const url = new URL(sent(0).path, 'http://viewer.test');
    expect(url.pathname).toBe(`/v1/change-reports/${REPORT_ID}/changes`);
    expect(url.searchParams.get('kind')).toBe('changed');
    expect(url.searchParams.get('continuationToken')).toBe('4182');
  });

  it("exports a DXF cut at a height, named as tiletopia names it", async () => {
    fetchMock.mockResolvedValue(
      new Response('0\nSECTION', { headers: { 'Content-Disposition': 'attachment; filename="model-12.dxf"' } }),
    );

    const file = await exportDxf('a1b2', 3.5);

    expect(file.name).toBe('model-12.dxf');
    expect(await file.blob.text()).toBe('0\nSECTION');
    expect(sent(0).path).toBe('/v1/assets/a1b2/dxf?cutHeight=3.5');
  });

  it('exports a section as polylines and leaves the cut height out', async () => {
    fetchMock.mockResolvedValue(
      new Response('0\nLWPOLYLINE', { headers: { 'Content-Disposition': 'attachment; filename="model-12.dxf"' } }),
    );

    const file = await exportSectionDxf('a1b2', { axis: 'y', position: 1.25 });

    expect(file.name).toBe('model-12.dxf');
    expect(sent(0).path).toBe('/v1/assets/a1b2/dxf?axis=y&position=1.25');
  });

  it('refuses before any request when nobody is signed in', async () => {
    useAuthStore.setState({ token: null, loggedIn: false });

    await expect(exportDxf('a1b2')).rejects.toThrow('Sign in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads an IDS file as the multipart field file, with the token as a header', async () => {
    fetchMock.mockResolvedValue(json({ status: 'running' }, 202));

    await startIdsCheck('a1b2', new File(['<ids/>'], 'rules.ids'));

    const { path, init, authorization } = sent(0);
    expect(path).toBe('/v1/assets/a1b2/ids');
    expect(init.method).toBe('POST');
    expect(((init.body as FormData).get('file') as File).name).toBe('rules.ids');
    expect(authorization).toBe('Bearer jwt-token');
  });

  it('reads a model that was never checked as no check, and raises any other 404', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ code: 'IDS_NOT_CHECKED', message: 'never checked' }, 404))
      .mockResolvedValueOnce(json({ code: 'ResourceNotFound', message: 'asset a1b2 not found' }, 404));

    expect(await readLatestIdsCheck('a1b2')).toBeNull();
    await expect(readLatestIdsCheck('a1b2')).rejects.toThrow('asset a1b2 not found');
  });

  it('polls an IDS check while it runs', async () => {
    fetchMock
      .mockResolvedValueOnce(json(idsCheck('running')))
      .mockResolvedValueOnce(json(idsCheck('running')))
      .mockResolvedValueOnce(json(idsCheck('failed')));
    const seen: string[] = [];
    const wait = vi.fn(async () => {});

    const finished = await pollIdsCheck('a1b2', {
      onUpdate: (update) => seen.push(update.status),
      signal: new AbortController().signal,
      wait,
    });

    expect(finished.status).toBe('failed');
    expect(seen).toEqual(['running', 'running', 'failed']);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(sent(2).path).toBe('/v1/assets/a1b2/ids');
  });

  it("passes tiletopia's own 503 message through, and names an html 503 from nginx as unreachable", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ code: 'IDS_CHECK_UNAVAILABLE', message: 'TILETOPIA_IDS_CHECK_URL is not set' }, 503))
      .mockResolvedValueOnce(new Response('<html>503 Service Temporarily Unavailable</html>', { status: 503 }));
    const file = new File(['<ids/>'], 'rules.ids');

    await expect(startIdsCheck('a1b2', file)).rejects.toMatchObject({
      status: 503,
      message: 'TILETOPIA_IDS_CHECK_URL is not set',
    });
    await expect(startIdsCheck('a1b2', file)).rejects.toThrow('tiletopia (tiles) is unreachable (503)');
  });
});
