import { buildViewerSnapshot } from '../actions/snapshot';

/**
 * Whisper conditions on at most 224 tokens of prompt and silently drops the rest
 * from the front, which would cost the earliest names. Roughly four characters
 * to a token, kept well under so a long name cannot push the budget over.
 */
export const INITIAL_PROMPT_MAX_CHARS = 600;

/** Names too common to be worth a slot: they bias nothing and crowd out real ones. */
const UNHELPFUL_NAMES = new Set(['layer', 'untitled', 'new layer', 'data', 'geojson']);

const isUseful = (name: string) =>
  name.length > 2 && !UNHELPFUL_NAMES.has(name.toLowerCase()) && !/^\d+$/.test(name);

/**
 * A prompt naming what is on the map, so the recogniser spells those names the
 * way the map does. "Thames" beats "Tems", "Ravensbourne" beats "ravens born".
 *
 * Returns an empty string when the map holds nothing worth biasing towards,
 * which the handshake leaves out rather than sending empty.
 */
export function placeNamePrompt(): string {
  const snapshot = buildViewerSnapshot();
  const names: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [
    snapshot.project?.name,
    snapshot.live?.name,
    ...snapshot.layers.map((layer) => layer.name),
  ]) {
    const name = candidate?.trim();
    if (!name || !isUseful(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (names.length === 0) return '';

  let prompt = '';
  for (const name of names) {
    const next = prompt ? `${prompt}, ${name}` : name;
    if (next.length > INITIAL_PROMPT_MAX_CHARS) break;
    prompt = next;
  }
  return prompt;
}
