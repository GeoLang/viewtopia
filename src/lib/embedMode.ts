/**
 * An embed (`?embed=1`, typically inside an iframe) renders the map with no
 * app chrome: no header, toolbar, chat, panels or shortcuts, just the viewer
 * and a badge linking back to the full app. Auth still comes from whatever
 * else the URL carries, a view role share link being the intended pairing.
 */
export function isEmbedRequested(): boolean {
  return new URLSearchParams(location.search).has('embed');
}

/** The same page outside the iframe, for the badge's open-in-full link. */
export function fullViewerUrl(): string {
  const url = new URL(location.href);
  url.searchParams.delete('embed');
  return url.toString();
}
