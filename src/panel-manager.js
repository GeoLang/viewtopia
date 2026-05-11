/**
 * Panel Manager — ensures only one floating panel is visible at a time.
 * Uses MutationObserver to auto-close older panels when a new one appears.
 */

const panelButtonMap = {
  'weather-panel': 'weather-btn',
  'flood-panel': 'flood-btn',
  'wind-panel': 'wind-btn',
  'lighting-panel': 'lighting-btn',
  'noise-panel': 'noise-btn',
  'energy-panel': 'energy-btn',
  'indoor-panel': 'indoor-btn',
  'solar-panel': 'solar-btn',
  'traffic-panel': 'traffic-btn',
  'drone-panel': 'drone-btn',
  'webxr-panel': 'webxr-btn',
  'a11y-panel': 'a11y-btn',
  'export3d-panel': 'export3d-btn',
  'flythrough-panel': 'flythrough-btn',
  'heatmap-panel': 'heatmap-btn',
  'timelapse-panel': 'timelapse-btn',
  'clipping-panel': 'clipping-btn',
  'cross-section-panel': 'cross-section-btn',
  'photo-panel': 'photo-btn',
  'offline-panel': 'offline-btn',
};

export function initPanelManager() {
  const vizPanel = document.getElementById('viz-panel');
  if (!vizPanel) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.classList?.contains('floating-panel')) {
          // A new floating panel was added — close all others
          const panels = vizPanel.querySelectorAll('.floating-panel');
          for (const panel of panels) {
            if (panel !== node) {
              const btnId = panelButtonMap[panel.id];
              if (btnId) {
                document.getElementById(btnId)?.classList.remove('active');
              }
              panel.remove();
            }
          }
        }
      }
    }
  });

  observer.observe(vizPanel, { childList: true });
}
