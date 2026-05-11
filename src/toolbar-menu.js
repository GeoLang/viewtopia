/**
 * Toolbar dropdown menus — handles open/close, click-outside,
 * and redirects dynamically-added buttons into the "More" overflow menu.
 */

export function initToolbarMenus() {
  const dropdowns = document.querySelectorAll('.toolbar-dropdown');

  // Toggle dropdown on click
  for (const dd of dropdowns) {
    const toggle = dd.querySelector('.toolbar-dropdown-toggle');
    if (!toggle) continue;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = dd.classList.contains('open');

      // Close all dropdowns first
      for (const d of dropdowns) d.classList.remove('open');

      if (!wasOpen) dd.classList.add('open');
    });
  }

  // Close on click outside
  document.addEventListener('click', () => {
    for (const dd of dropdowns) dd.classList.remove('open');
  });

  // Prevent clicks inside dropdown content from closing it
  for (const dd of dropdowns) {
    const content = dd.querySelector('.toolbar-dropdown-content');
    if (content) {
      content.addEventListener('click', (e) => {
        // Close menu after clicking a tool button
        dd.classList.remove('open');
      });
    }
  }

  // Highlight toggle if any child button is active
  const observer = new MutationObserver(() => {
    for (const dd of document.querySelectorAll('.toolbar-dropdown')) {
      const toggle = dd.querySelector('.toolbar-dropdown-toggle');
      const hasActive = dd.querySelector('.toolbar-dropdown-content .map-action-btn.active');
      if (toggle) toggle.classList.toggle('has-active', !!hasActive);
    }
  });

  const toolbar = document.getElementById('toolbar-actions');
  if (toolbar) {
    observer.observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // Intercept dynamically-added buttons → route to "More" menu
  interceptDynamicButtons();
}

function interceptDynamicButtons() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const extrasMenu = document.getElementById('extras-menu');
  const extrasContent = document.getElementById('extras-menu-content');
  if (!extrasMenu || !extrasContent) return;

  // Known button IDs that already have a home in the HTML dropdowns
  const knownIds = new Set();
  toolbar.querySelectorAll('.map-action-btn[id]').forEach(b => knownIds.add(b.id));

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // If it's a button added directly to toolbar-actions (not in a dropdown)
        if (node.classList?.contains('map-action-btn') && !knownIds.has(node.id)) {
          // Move it into the "More" menu
          extrasContent.appendChild(node);
          extrasMenu.style.display = '';

          // Register as known so we don't re-process
          if (node.id) knownIds.add(node.id);
        }
      }
    }
  });

  // Only observe direct children of toolbar-actions (not the dropdown internals)
  observer.observe(toolbar, { childList: true });
}
