/**
 * Keyboard shortcuts for ViewTopia.
 * Press '?' to show the shortcut help overlay.
 */

const shortcuts = [];
let helpOverlay = null;

export function initKeyboardShortcuts() {
  // Measurement
  bind('m', 'Measure distance', () => click('measure-btn'));
  bind('a', 'Annotate', () => click('annotate-btn'));
  bind('i', 'Feature info', () => click('pick-btn'));
  bind('d', 'Draw on map', () => click('draw-btn'));
  bind('b', 'Bookmarks', () => click('bookmark-btn'));
  bind('s', 'Stories', () => click('story-btn'));
  bind('c', 'Collaborate', () => click('collab-btn'));

  // Tabs
  bind('1', '3D Globe tab', () => clickTab('globe'));
  bind('2', '2D Map tab', () => clickTab('map'));
  bind('3', 'Image tab', () => clickTab('image'));
  bind('4', 'Table tab', () => clickTab('table'));

  // Renderers
  bind('F1', 'CesiumJS renderer', () => setRenderer('cesium'));
  bind('F2', 'deck.gl renderer', () => setRenderer('deckgl'));
  bind('F3', 'MapLibre renderer', () => setRenderer('maplibre'));

  // Misc
  bind('/', 'Focus search', () => focusSearch());
  bind('Escape', 'Close panels', () => closeAllPanels());
  bind('p', 'Export PNG', () => click('export-png-btn'));
  bind('v', 'Split view', () => click('split-btn'));
  bind('?', 'Show shortcuts', () => toggleHelp());

  // Global listener
  document.addEventListener('keydown', (e) => {
    // Don't trigger in inputs/textareas
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    const key = e.key;
    for (const s of shortcuts) {
      if (s.key === key) {
        e.preventDefault();
        s.action();
        return;
      }
    }
  });

  createHelpOverlay();
}

function bind(key, description, action) {
  shortcuts.push({ key, description, action });
}

function click(id) {
  const el = document.getElementById(id);
  if (el && el.offsetParent !== null) el.click();
}

function clickTab(tab) {
  const tabEl = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (tabEl) tabEl.click();
}

function setRenderer(renderer) {
  const select = document.getElementById('renderer-choice');
  if (select) {
    select.value = renderer;
    select.dispatchEvent(new Event('change'));
  }
}

function focusSearch() {
  const input = document.getElementById('map-search-input') || document.getElementById('chat-input');
  if (input) input.focus();
}

function closeAllPanels() {
  const panels = ['bookmark-panel', 'story-list-panel', 'feature-info-panel',
    'style-editor-panel', 'terrain-profile', 'geojson-prop-panel', 'collab-panel',
    'dt-col-panel'];
  for (const id of panels) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  if (helpOverlay) helpOverlay.style.display = 'none';

  // Deactivate active buttons
  document.querySelectorAll('.map-action-btn.active').forEach(btn => btn.classList.remove('active'));
}

function createHelpOverlay() {
  helpOverlay = document.createElement('div');
  helpOverlay.id = 'shortcut-help';
  helpOverlay.className = 'shortcut-help';
  helpOverlay.style.display = 'none';

  const groups = [
    { label: 'Tools', items: shortcuts.filter(s => 'madidbscpv'.includes(s.key)) },
    { label: 'Tabs', items: shortcuts.filter(s => '1234'.includes(s.key)) },
    { label: 'Renderers', items: shortcuts.filter(s => s.key.startsWith('F')) },
    { label: 'Other', items: shortcuts.filter(s => ['/', 'Escape', '?'].includes(s.key)) },
  ];

  let html = '<div class="sh-header"><span>⌨ Keyboard Shortcuts</span><button class="sh-close">&times;</button></div><div class="sh-body">';
  for (const g of groups) {
    html += `<div class="sh-group"><h4>${g.label}</h4>`;
    for (const s of g.items) {
      html += `<div class="sh-row"><kbd>${s.key}</kbd><span>${s.description}</span></div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  helpOverlay.innerHTML = html;
  document.body.appendChild(helpOverlay);

  helpOverlay.querySelector('.sh-close').addEventListener('click', () => {
    helpOverlay.style.display = 'none';
  });
}

function toggleHelp() {
  if (!helpOverlay) return;
  helpOverlay.style.display = helpOverlay.style.display === 'none' ? 'flex' : 'none';
}
