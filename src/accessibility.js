/**
 * Accessibility — high contrast, screen reader hints, keyboard nav overlay.
 */

let a11yActive = false;

export function initAccessibility() {
  const btn = document.getElementById('a11y-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    a11yActive = !a11yActive;
    btn.classList.toggle('active', a11yActive);
    if (a11yActive) showA11yPanel();
    else { document.getElementById('a11y-panel')?.remove(); removeA11yEnhancements(); }
  });
}

function showA11yPanel() {
  let panel = document.getElementById('a11y-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'a11y-panel';
  panel.className = 'floating-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Accessibility Settings');
  panel.innerHTML = `
    <div class="panel-header"><span>♿ Accessibility</span><button class="panel-close" id="a11y-close">✕</button></div>
    <div class="panel-body">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="a11y-contrast"> High contrast mode
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="a11y-large-text"> Large text
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="a11y-reduce-motion"> Reduce motion
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="a11y-focus-ring"> Visible focus indicators
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="a11y-aria"> Enhanced ARIA labels
      </label>
      <label>Color vision
        <select id="a11y-colorblind">
          <option value="none">Normal</option>
          <option value="protanopia">Protanopia (red-blind)</option>
          <option value="deuteranopia">Deuteranopia (green-blind)</option>
          <option value="tritanopia">Tritanopia (blue-blind)</option>
          <option value="achromatopsia">Achromatopsia (no color)</option>
        </select>
      </label>
      <div style="margin-top:8px;">
        <button class="map-action-btn" id="a11y-shortcuts">Show Keyboard Shortcuts</button>
      </div>
      <div id="a11y-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('a11y-close').onclick = () => {
    panel.remove();
    a11yActive = false;
    document.getElementById('a11y-btn')?.classList.remove('active');
  };

  document.getElementById('a11y-contrast').onchange = (e) => toggleHighContrast(e.target.checked);
  document.getElementById('a11y-large-text').onchange = (e) => toggleLargeText(e.target.checked);
  document.getElementById('a11y-reduce-motion').onchange = (e) => toggleReduceMotion(e.target.checked);
  document.getElementById('a11y-focus-ring').onchange = (e) => toggleFocusRing(e.target.checked);
  document.getElementById('a11y-aria').onchange = (e) => enhanceAria(e.target.checked);
  document.getElementById('a11y-colorblind').onchange = (e) => applyColorFilter(e.target.value);
  document.getElementById('a11y-shortcuts').onclick = () => showShortcutsOverlay();
}

function toggleHighContrast(on) {
  document.body.classList.toggle('a11y-high-contrast', on);
  if (on) {
    addA11yStyle('a11y-contrast-style', `
      .a11y-high-contrast { --bg-primary: #000 !important; --text-primary: #fff !important; }
      .a11y-high-contrast button, .a11y-high-contrast select { border: 2px solid #fff !important; }
      .a11y-high-contrast .panel-header { background: #111 !important; border-bottom: 2px solid #ff0 !important; }
    `);
  } else {
    removeA11yStyle('a11y-contrast-style');
  }
}

function toggleLargeText(on) {
  document.body.classList.toggle('a11y-large-text', on);
  if (on) {
    addA11yStyle('a11y-text-style', `
      .a11y-large-text { font-size: 18px !important; }
      .a11y-large-text button, .a11y-large-text select, .a11y-large-text input { font-size: 16px !important; }
      .a11y-large-text .panel-body { font-size: 16px !important; }
    `);
  } else {
    removeA11yStyle('a11y-text-style');
  }
}

function toggleReduceMotion(on) {
  document.body.classList.toggle('a11y-reduce-motion', on);
  if (on) {
    addA11yStyle('a11y-motion-style', `
      .a11y-reduce-motion, .a11y-reduce-motion * { animation: none !important; transition: none !important; }
    `);
  } else {
    removeA11yStyle('a11y-motion-style');
  }
}

function toggleFocusRing(on) {
  if (on) {
    addA11yStyle('a11y-focus-style', `
      *:focus { outline: 3px solid #ff0 !important; outline-offset: 2px !important; }
      *:focus-visible { outline: 3px solid #ff0 !important; outline-offset: 2px !important; }
    `);
  } else {
    removeA11yStyle('a11y-focus-style');
  }
}

function enhanceAria(on) {
  const buttons = document.querySelectorAll('.map-action-btn');
  buttons.forEach(btn => {
    if (on) {
      if (!btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', btn.title || btn.textContent.trim());
      }
      btn.setAttribute('role', 'button');
    }
  });

  const panels = document.querySelectorAll('.floating-panel');
  panels.forEach(p => {
    if (on) {
      p.setAttribute('role', 'dialog');
      p.setAttribute('aria-modal', 'false');
    }
  });

  const info = document.getElementById('a11y-info');
  if (info) info.textContent = on ? 'ARIA labels applied to all interactive elements' : '';
}

function applyColorFilter(mode) {
  removeA11yStyle('a11y-color-style');
  if (mode === 'none') return;

  const filters = {
    protanopia: 'url(#protanopia-filter)',
    deuteranopia: 'url(#deuteranopia-filter)',
    tritanopia: 'url(#tritanopia-filter)',
    achromatopsia: 'grayscale(100%)',
  };

  // For SVG-based filters, use CSS filter
  const filterValue = mode === 'achromatopsia' ? 'grayscale(100%)' : `saturate(0.8) hue-rotate(${getHueRotation(mode)}deg)`;

  addA11yStyle('a11y-color-style', `
    #viz-panel canvas, #globe-container { filter: ${filterValue}; }
  `);
}

function getHueRotation(mode) {
  switch (mode) {
    case 'protanopia': return 45;
    case 'deuteranopia': return -30;
    case 'tritanopia': return 180;
    default: return 0;
  }
}

function showShortcutsOverlay() {
  let overlay = document.getElementById('a11y-shortcuts-overlay');
  if (overlay) { overlay.remove(); return; }

  overlay = document.createElement('div');
  overlay.id = 'a11y-shortcuts-overlay';
  overlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:20px;z-index:10000;max-width:500px;max-height:80vh;overflow-y:auto;color:#ccc;';
  overlay.innerHTML = `
    <h3 style="color:#a78bfa;margin-top:0;">Keyboard Shortcuts</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr><td style="padding:4px;"><kbd>?</kbd></td><td>Show shortcuts</td></tr>
      <tr><td><kbd>M</kbd></td><td>Measure tool</td></tr>
      <tr><td><kbd>A</kbd></td><td>Annotate</td></tr>
      <tr><td><kbd>D</kbd></td><td>Draw mode</td></tr>
      <tr><td><kbd>L</kbd></td><td>Layers panel</td></tr>
      <tr><td><kbd>T</kbd></td><td>Theme toggle</td></tr>
      <tr><td><kbd>F</kbd></td><td>Fullscreen</td></tr>
      <tr><td><kbd>G</kbd></td><td>Geocoding search</td></tr>
      <tr><td><kbd>B</kbd></td><td>Bookmarks</td></tr>
      <tr><td><kbd>Ctrl+P</kbd></td><td>Print/Export</td></tr>
      <tr><td><kbd>Ctrl+S</kbd></td><td>Save session</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Cancel current tool</td></tr>
      <tr><td><kbd>1-4</kbd></td><td>Switch tabs (Globe/Map/Image/Table)</td></tr>
    </table>
    <button class="map-action-btn" style="margin-top:12px;" onclick="this.parentElement.remove()">Close</button>
  `;

  document.body.appendChild(overlay);

  const closeOnEsc = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', closeOnEsc); }
  };
  document.addEventListener('keydown', closeOnEsc);
}

function addA11yStyle(id, css) {
  removeA11yStyle(id);
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function removeA11yStyle(id) {
  document.getElementById(id)?.remove();
}

function removeA11yEnhancements() {
  ['a11y-contrast-style', 'a11y-text-style', 'a11y-motion-style', 'a11y-focus-style', 'a11y-color-style'].forEach(removeA11yStyle);
  document.body.classList.remove('a11y-high-contrast', 'a11y-large-text', 'a11y-reduce-motion');
}
