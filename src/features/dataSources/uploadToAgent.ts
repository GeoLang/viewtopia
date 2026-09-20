import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { useChatStore } from '../../store/chat';

const UPLOAD_URL = '/agent/upload';

// the only formats geolang's /upload reads, the rest answer 500
const AGENT_UPLOAD_FORMATS = ['.geojson', '.json', '.gpkg', '.zip', '.csv'];

const extensionOf = (name: string) => `.${name.split('.').pop()?.toLowerCase()}`;

// the browser import already drew the layer, so a refusal here only warns
export async function uploadFileToAgent(file: File): Promise<void> {
  if (!AGENT_UPLOAD_FORMATS.includes(extensionOf(file.name))) return;
  const headers = authHeaders();
  if (!headers.Authorization) return;

  const body = new FormData();
  body.append('file', file);
  const threadId = useChatStore.getState().activeSession()?.backendId;
  if (threadId) body.append('thread_id', threadId);

  const response = await fetch(UPLOAD_URL, { method: 'POST', headers, body }).catch(() => null);
  if (!response) {
    console.warn(`[agent-upload] ${file.name} got no reply`);
    return;
  }
  noticeRefusal(response.status);
  if (!response.ok) console.warn(`[agent-upload] ${file.name} answered HTTP ${response.status}`);
}
