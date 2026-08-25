import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

import { notifications } from '@mantine/notifications';
import { CollectaPanel } from '../../src/components/tools/CollectaPanel';
import { useAgentLayerStore } from '../../src/store/agentLayers';
import { useAuthStore } from '../../src/features/auth/store';

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

const FORM_ID = 'ba8f0a10-0000-0000-0000-000000000001';
const FORM_TITLE = 'Site Inspection';
const BRANCH_ID = 'c1d20a10-0000-0000-0000-000000000002';
const DATASET_ID = 'c1d20a10-0000-0000-0000-000000000003';
const SUBMISSION_ID = 'a2f1b9c0-0000-0000-0000-000000000001';
/** POINT(1 2) as WKB, the geometry ptolemy answers the published feature with */
const POINT_HEX = '0101000000000000000000f03f0000000000000040';

const PUBLISH_PATH = `/collecta/api/v1/forms/${FORM_ID}/publish`;

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

/** The stack's answers, with the publish reply the test under way needs. */
function serve(publishReply: Response) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === PUBLISH_PATH) return publishReply;
    if (url === '/collecta/api/v1/forms') {
      return jsonResponse(200, [
        { id: FORM_ID, title: FORM_TITLE, version: 1, field_count: 2 },
      ]);
    }
    if (url === `/collecta/api/v1/forms/${FORM_ID}`) {
      return jsonResponse(200, {
        id: FORM_ID,
        title: FORM_TITLE,
        fields: [{ name: 'location', field_type: 'GeoPoint' }],
      });
    }
    if (url === `/collecta/api/v1/forms/${FORM_ID}/submissions`) {
      return jsonResponse(200, [
        {
          id: SUBMISSION_ID,
          values: { location: { GeoPoint: { latitude: 2, longitude: 1 } } },
          status: 'Complete',
        },
      ]);
    }
    if (url.startsWith(`/api/v1/branches/${BRANCH_ID}/features`)) {
      return jsonResponse(200, {
        features: [
          {
            id: SUBMISSION_ID,
            geometry_wkb: [...Buffer.from(POINT_HEX, 'hex')],
            properties: { submission_id: SUBMISSION_ID },
          },
        ],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function open() {
  return render(
    <MantineProvider>
      <CollectaPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

/** Open the panel and pick the one form, which is what reveals the publish button. */
async function pickTheForm() {
  open();
  fireEvent.click(await screen.findByPlaceholderText('Pick a form'));
  fireEvent.click(await screen.findByText(`${FORM_TITLE} (v1)`));
  return screen.findByTestId('collecta-publish');
}

function publishedLayer() {
  return useAgentLayerStore.getState().layers.find((l) => l.id === `ptolemy-branch-${BRANCH_ID}`);
}

beforeEach(() => {
  vi.mocked(notifications.show).mockClear();
  useAuthStore.setState({ token: 'jwt-token', loggedIn: true });
  useAgentLayerStore.setState({ layers: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the Field Data panel publishes a form to ptolemy', () => {
  it('draws the published branch and says what was written', async () => {
    const fetchMock = serve(
      jsonResponse(200, {
        dataset_id: DATASET_ID,
        branch_id: BRANCH_ID,
        published: 2,
        skipped: 1,
        total_published: 3,
      }),
    );

    fireEvent.click(await pickTheForm());

    await waitFor(() => expect(publishedLayer()).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(PUBLISH_PATH, expect.objectContaining({ method: 'POST' }));
    expect(publishedLayer()?.geojson.features).toEqual([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [1, 2] },
        properties: { submission_id: SUBMISSION_ID },
      },
    ]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Published 2 submissions, 1 skipped', color: 'teal' }),
    );
    expect(await screen.findByTestId('collecta-published')).toHaveTextContent('3 in dataset');
    expect(await screen.findByTestId('collecta-publish')).toHaveTextContent('Publish again');
  });

  it('shows what collecta refused with and draws nothing', async () => {
    serve(jsonResponse(503, { error: 'COLLECTA_PTOLEMY_URL is not set' }));

    fireEvent.click(await pickTheForm());

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'COLLECTA_PTOLEMY_URL is not set', color: 'red' }),
      ),
    );
    expect(publishedLayer()).toBeUndefined();
    expect(screen.queryByTestId('collecta-published')).toBeNull();
  });
});
