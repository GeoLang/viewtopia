import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/store';
import {
  attachDataset,
  createProject,
  detachDataset,
  listWorkspaces,
  PtolemyRequestError,
} from '../../src/projects/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Ptolemy project API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ loggedIn: true, user: { email: 'owner@example.com' }, token: 'jwt-abc', error: null });
  });

  it('sends the session bearer and maps snake case workspace metadata', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      {
        id: 'workspace-1',
        name: 'Survey',
        description: 'Lake survey',
        created_by: 'owner-id',
        created_at: '2026-08-22T12:00:00Z',
        updated_at: '2026-08-22T13:00:00Z',
        role: 'editor',
      },
    ]));

    await expect(listWorkspaces()).resolves.toEqual([
      {
        id: 'workspace-1',
        name: 'Survey',
        description: 'Lake survey',
        createdBy: 'owner-id',
        createdAt: '2026-08-22T12:00:00Z',
        updatedAt: '2026-08-22T13:00:00Z',
        role: 'editor',
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/workspaces');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('escapes identifiers and sends only project metadata', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'project-1',
      workspace_id: 'workspace/id',
      name: 'Survey',
      description: null,
      created_by: 'owner-id',
      created_at: '2026-08-22T12:00:00Z',
      updated_at: '2026-08-22T12:00:00Z',
      role: 'owner',
    }, 201));

    await expect(createProject('workspace/id', { name: 'Survey' })).resolves.toMatchObject({
      id: 'project-1',
      workspaceId: 'workspace/id',
      description: undefined,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/workspaces/workspace%2Fid/projects');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Survey', description: undefined }));
  });

  it('retains the refused status and backend response text', async () => {
    fetchMock.mockResolvedValueOnce(new Response('workspace membership required', { status: 403 }));

    await expect(listWorkspaces()).rejects.toMatchObject<PtolemyRequestError>({
      status: 403,
      responseText: 'workspace membership required',
    });
  });

  it('attaches a dataset to a project and maps the answer', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataset_id: 'dataset-1',
      project_id: 'project-1',
    }));

    await expect(attachDataset('dataset-1', 'project-1')).resolves.toEqual({
      datasetId: 'dataset-1',
      projectId: 'project-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/datasets/dataset-1/project');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ project_id: 'project-1' }));
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-abc');
  });

  it('detaches a dataset without a body and reports the empty project', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataset_id: 'dataset-1',
      project_id: null,
    }));

    await expect(detachDataset('dataset-1')).resolves.toEqual({
      datasetId: 'dataset-1',
      projectId: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/datasets/dataset-1/project');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('rejects a refused attach with the status the server sent', async () => {
    fetchMock.mockResolvedValueOnce(new Response('project editor required', { status: 403 }));

    const refusal = attachDataset('dataset-1', 'project-1');
    await expect(refusal).rejects.toBeInstanceOf(PtolemyRequestError);
    await expect(refusal).rejects.toMatchObject<PtolemyRequestError>({
      status: 403,
      responseText: 'project editor required',
    });
  });
});
