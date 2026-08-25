import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => new Map<string, { id: string; dataUrl: string }>());

const api = vi.hoisted(() => ({
  uploadProjectAttachment: vi.fn(),
  getProjectAttachmentDataUrl: vi.fn(),
}));

vi.mock('../../src/projects/api', () => api);

vi.mock('../../src/offline/db', () => ({
  overlayImages: {
    get: vi.fn(async (id: string) => cache.get(id)),
    put: vi.fn(async (image: { id: string; dataUrl: string }) => {
      cache.set(image.id, image);
    }),
  },
  projectMaps: { getAll: vi.fn(async () => []), get: vi.fn(), put: vi.fn(), remove: vi.fn() },
}));

import {
  restoreImageOverlays,
  storeOverlayImages,
  type ImageOverlayEntry,
} from '../../src/features/project/projectFile';
import { useAgentLayerStore, type AgentRasterLayer } from '../../src/store/agentLayers';

const PROJECT = 'project-1';
const BITMAP = 'data:image/png;base64,aGVsbG8=';

function overlay(id: string, extra: Partial<AgentRasterLayer> = {}): AgentRasterLayer {
  return {
    id,
    name: `overlay ${id}`,
    url: BITMAP,
    corners: {
      topLeft: [12.3, 45.5],
      topRight: [12.4, 45.5],
      bottomRight: [12.4, 45.4],
      bottomLeft: [12.3, 45.4],
    },
    opacity: 1,
    visible: true,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
  api.uploadProjectAttachment.mockResolvedValue('attachment-1');
  api.getProjectAttachmentDataUrl.mockResolvedValue(BITMAP);
  useAgentLayerStore.setState({ layers: [], rasterLayers: [], markers: [], generation: 0 });
});

describe('an overlay bitmap goes to the project', () => {
  it('uploads it and puts the attachment id on the layer', async () => {
    useAgentLayerStore.setState({ rasterLayers: [overlay('venice')] });

    await storeOverlayImages(PROJECT);

    expect(api.uploadProjectAttachment).toHaveBeenCalledWith(PROJECT, 'overlay venice', BITMAP);
    expect(useAgentLayerStore.getState().rasterLayers[0].attachmentId).toBe('attachment-1');
    expect(cache.get('venice')?.dataUrl).toBe(BITMAP);
  });

  it('leaves one that is already up there alone', async () => {
    useAgentLayerStore.setState({
      rasterLayers: [overlay('venice', { attachmentId: 'attachment-1' })],
    });

    await storeOverlayImages(PROJECT);

    expect(api.uploadProjectAttachment).not.toHaveBeenCalled();
  });

  it('caches every bitmap even when an upload fails', async () => {
    api.uploadProjectAttachment.mockRejectedValue(new Error('offline'));
    useAgentLayerStore.setState({ rasterLayers: [overlay('venice'), overlay('padua')] });

    await expect(storeOverlayImages(PROJECT)).rejects.toThrow('offline');

    expect(cache.has('venice')).toBe(true);
    expect(cache.has('padua')).toBe(true);
  });

  it('uploads nothing for a project file, which names only ids', async () => {
    useAgentLayerStore.setState({ rasterLayers: [overlay('venice')] });

    await storeOverlayImages();

    expect(api.uploadProjectAttachment).not.toHaveBeenCalled();
    expect(cache.get('venice')?.dataUrl).toBe(BITMAP);
  });
});

describe('an overlay this browser has never seen', () => {
  const entry: ImageOverlayEntry = {
    id: 'venice',
    name: 'overlay venice',
    attachmentId: 'attachment-1',
    corners: overlay('venice').corners,
    opacity: 1,
    visible: true,
  };

  it('is downloaded from the project and cached', async () => {
    await restoreImageOverlays([entry], PROJECT);

    expect(api.getProjectAttachmentDataUrl).toHaveBeenCalledWith(PROJECT, 'attachment-1');
    expect(useAgentLayerStore.getState().rasterLayers[0].url).toBe(BITMAP);
    expect(cache.get('venice')?.dataUrl).toBe(BITMAP);
  });

  it('comes from the cache when this browser already has it', async () => {
    cache.set('venice', { id: 'venice', dataUrl: BITMAP });

    await restoreImageOverlays([entry], PROJECT);

    expect(api.getProjectAttachmentDataUrl).not.toHaveBeenCalled();
    expect(useAgentLayerStore.getState().rasterLayers[0].url).toBe(BITMAP);
  });

  it('is skipped rather than drawn blank when the download fails', async () => {
    api.getProjectAttachmentDataUrl.mockRejectedValue(new Error('gone'));

    await restoreImageOverlays([entry], PROJECT);

    expect(useAgentLayerStore.getState().rasterLayers).toHaveLength(0);
  });

  it('is skipped when the snapshot names no attachment', async () => {
    const { attachmentId: _unused, ...withoutAttachment } = entry;

    await restoreImageOverlays([withoutAttachment], PROJECT);

    expect(api.getProjectAttachmentDataUrl).not.toHaveBeenCalled();
    expect(useAgentLayerStore.getState().rasterLayers).toHaveLength(0);
  });
});
