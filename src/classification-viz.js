/**
 * Classification Visualization — color point cloud tiles by ASPRS class.
 *
 * Ported from TileTopia's classification-viz.js.
 */
import * as Cesium from 'cesium';

const CLASS_COLORS = {
  0: [200, 200, 200], // Unclassified
  2: [139, 90, 43],   // Ground
  3: [144, 238, 144], // Low Vegetation
  4: [34, 139, 34],   // Medium Vegetation
  5: [0, 100, 0],     // High Vegetation
  6: [255, 69, 0],    // Building
  7: [255, 0, 255],   // Noise
  9: [0, 100, 255],   // Water
  11: [64, 64, 64],   // Road
  14: [255, 255, 0],  // Power Line
  15: [255, 165, 0],  // Transmission Tower
  17: [160, 82, 45],  // Bridge
  19: [0, 255, 255],  // Pole
  64: [255, 20, 147], // Vehicle
};

const CLASS_NAMES = {
  0: 'Unclassified', 2: 'Ground', 3: 'Low Vegetation', 4: 'Medium Vegetation',
  5: 'High Vegetation', 6: 'Building', 7: 'Noise', 9: 'Water', 11: 'Road',
  14: 'Power Line', 15: 'Transmission Tower', 17: 'Bridge', 19: 'Pole', 64: 'Vehicle',
};

export function applyClassificationStyle(tileset, attribute = 'Classification') {
  const conditions = Object.entries(CLASS_COLORS).map(([cls, [r, g, b]]) =>
    [`\${${attribute}} === ${cls}`, `color('rgb(${r},${g},${b})')`]
  );
  conditions.push(['true', "color('gray')"]);

  tileset.style = new Cesium.Cesium3DTileStyle({
    color: { conditions },
    pointSize: '3',
  });
}

export function clearClassificationStyle(tileset) {
  tileset.style = undefined;
}

export function createClassLegend() {
  return Object.entries(CLASS_NAMES).map(([cls, name]) => {
    const c = CLASS_COLORS[cls] || [128, 128, 128];
    return { cls: Number(cls), name, color: `rgb(${c.join(',')})` };
  });
}

export function highlightClass(tileset, classValue, attribute = 'Classification') {
  const [r, g, b] = CLASS_COLORS[classValue] || [255, 255, 255];
  tileset.style = new Cesium.Cesium3DTileStyle({
    color: {
      conditions: [
        [`\${${attribute}} === ${classValue}`, `color('rgb(${r},${g},${b})')`],
        ['true', "color('gray', 0.2)"],
      ],
    },
    pointSize: {
      conditions: [
        [`\${${attribute}} === ${classValue}`, '5'],
        ['true', '1'],
      ],
    },
  });
}
