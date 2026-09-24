import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { WidgetContent } from '../../src/features/dashboards/DashboardPanel';
import type { DashboardWidget } from '../../src/features/dashboards/types';

window.matchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

function renderRichText(html: string) {
  const widget: DashboardWidget = {
    id: 'w1',
    type: 'richtext',
    title: 'Notes',
    config: { html },
    layout: { x: 0, y: 0, w: 1, h: 1 },
  };
  return render(
    <MantineProvider>
      <WidgetContent widget={widget} />
    </MantineProvider>,
  );
}

describe('rich text widget', () => {
  afterEach(() => {
    cleanup();
    delete (window as { pwned?: boolean }).pwned;
  });

  it('keeps markup from shared project state out of the DOM', () => {
    const { container } = renderRichText(
      '<p>before</p><script>window.pwned = true</script>' +
        '<img src="x" onerror="window.pwned = true">' +
        '<a href="javascript:window.pwned = true">link</a><p>after</p>',
    );

    expect(container.querySelector('script, img, a')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect((window as { pwned?: boolean }).pwned).toBeUndefined();
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
  });

  it('shows the default widget text', () => {
    renderRichText('<p>Enter text...</p>');
    expect(screen.getByText('Enter text...').tagName).toBe('P');
  });
});
