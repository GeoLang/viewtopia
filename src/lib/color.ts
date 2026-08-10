/** What the css-wide keywords parse as, none of which name a colour. */
const CSS_WIDE_KEYWORDS = ['inherit', 'initial', 'revert', 'revert-layer', 'unset'];

/**
 * A css colour, or the fallback when the browser reads none. Colours arrive
 * from the agent and from imported files, and each renderer parses them itself:
 * Cesium answers undefined rather than throwing, which takes down the draw of
 * every layer after it.
 */
export function asColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const probe = document.createElement('span');
  probe.style.color = value;
  const read = probe.style.color;
  if (!read || CSS_WIDE_KEYWORDS.includes(read.toLowerCase())) return fallback;
  return value;
}
