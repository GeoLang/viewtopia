/**
 * Tour / Onboarding — first-time walkthrough highlighting features.
 * Shows a sequence of tooltip-style overlays pointing to UI elements.
 */

const STORAGE_KEY = 'viewtopia-tour-done';

const steps = [
  { target: '#toggle-chat-btn', title: 'Chat Panel', text: 'Toggle the AI chat panel. Ask questions about geospatial data in natural language.' },
  { target: '.tab[data-tab="globe"]', title: '3D Globe', text: 'View your data on a 3D globe powered by CesiumJS, deck.gl, or MapLibre GL.' },
  { target: '.tab[data-tab="map"]', title: '2D Map', text: 'Switch to a 2D Leaflet map with drawing tools and layer controls.' },
  { target: '#renderer-choice', title: 'Renderer Switcher', text: 'Switch between CesiumJS, deck.gl, and MapLibre renderers.' },
  { target: '#measure-btn', title: 'Measurement', text: 'Measure distances, areas, and elevations in 3D.' },
  { target: '#annotate-btn', title: 'Annotations', text: 'Click the globe to place text notes at 3D locations.' },
  { target: '#pick-btn', title: 'Feature Info', text: 'Click 3D Tiles features to inspect their properties.' },
  { target: '#basemap-select', title: 'Basemaps', text: 'Switch between OSM, Satellite, Topo, and Dark basemaps.' },
  { target: '#bookmark-btn', title: 'Bookmarks', text: 'Save camera positions and share views via URL.' },
  { target: '#geocode-input', title: 'Search', text: 'Search for places and fly to them instantly.' },
  { target: '#asset-panel', title: 'Asset Catalogue', text: 'Upload and manage 3D assets when TileTopia is connected.' },
  { target: '#data-section', title: 'Data Upload', text: 'Upload GeoJSON, GPKG, CSV, or LiDAR files for analysis.' },
];

let currentStep = 0;
let overlay = null;
let tooltip = null;

export function initTour() {
  // Check if tour was already completed
  if (localStorage.getItem(STORAGE_KEY)) return;

  // Add tour button to header
  const header = document.getElementById('header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.className = 'header-btn';
  btn.id = 'tour-btn';
  btn.title = 'Start tour';
  btn.textContent = '❓';
  header.appendChild(btn);

  btn.addEventListener('click', () => startTour());

  // Auto-start tour for first-time users after a short delay
  setTimeout(() => {
    if (!localStorage.getItem(STORAGE_KEY)) startTour();
  }, 2000);
}

export function startTour() {
  currentStep = 0;
  createOverlay();
  showStep();
}

function createOverlay() {
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.className = 'tour-overlay';

  tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';

  overlay.appendChild(tooltip);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) nextStep();
  });
}

function showStep() {
  if (currentStep >= steps.length) {
    endTour();
    return;
  }

  const step = steps[currentStep];
  const target = document.querySelector(step.target);

  tooltip.innerHTML = `
    <div class="tour-step-num">${currentStep + 1} / ${steps.length}</div>
    <h4 class="tour-title">${step.title}</h4>
    <p class="tour-text">${step.text}</p>
    <div class="tour-actions">
      <button class="tour-skip">Skip Tour</button>
      <button class="tour-next">${currentStep === steps.length - 1 ? 'Done!' : 'Next →'}</button>
    </div>
  `;

  // Position tooltip near target
  if (target && target.offsetParent !== null) {
    const rect = target.getBoundingClientRect();
    const tipWidth = 280;
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    let top = rect.bottom + 10;

    // Keep in viewport
    if (left < 10) left = 10;
    if (left + tipWidth > window.innerWidth - 10) left = window.innerWidth - tipWidth - 10;
    if (top + 200 > window.innerHeight) top = rect.top - 200;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.position = 'fixed';

    // Highlight target
    target.style.position = target.style.position || 'relative';
    target.style.zIndex = '10001';
    target.style.boxShadow = '0 0 0 4px rgba(124,58,237,0.5)';
    target.classList.add('tour-highlight');
  } else {
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    tooltip.style.position = 'fixed';
  }

  tooltip.querySelector('.tour-next').addEventListener('click', nextStep);
  tooltip.querySelector('.tour-skip').addEventListener('click', endTour);
}

function nextStep() {
  clearHighlight();
  currentStep++;
  showStep();
}

function clearHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(el => {
    el.style.zIndex = '';
    el.style.boxShadow = '';
    el.classList.remove('tour-highlight');
  });
}

function endTour() {
  clearHighlight();
  if (overlay) { overlay.remove(); overlay = null; }
  localStorage.setItem(STORAGE_KEY, 'true');
}
