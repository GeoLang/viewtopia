import { afterEach, describe, expect, it } from 'vitest';
import { embedSnippet } from '../../src/live/api';
import { fullViewerUrl, isEmbedRequested } from '../../src/lib/embedMode';

describe('embed mode', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('is requested only by the embed param', () => {
    history.replaceState(null, '', '/?live=tok');
    expect(isEmbedRequested()).toBe(false);
    history.replaceState(null, '', '/?live=tok&embed=1');
    expect(isEmbedRequested()).toBe(true);
  });

  it('links the badge back to the page without the embed param', () => {
    history.replaceState(null, '', '/?live=tok&embed=1&comment=c1');
    expect(fullViewerUrl()).toBe(`${location.origin}/?live=tok&comment=c1`);
  });

  it('builds an iframe snippet around the share url', () => {
    expect(embedSnippet('http://example.test/?live=tok')).toBe(
      '<iframe src="http://example.test/?live=tok&embed=1" width="800" height="450" ' +
        'style="border:0" allowfullscreen></iframe>',
    );
  });
});
