/**
 * 3D Tiles styling helpers (ported from the StyleEditor class in vanilla
 * feature-picker.js). React has no central tileset store — tilesets are added to
 * `viewer.scene.primitives` (see commands.ts load_tileset / Google3DPanel) — so
 * these apply a style to every Cesium3DTileset currently in the scene.
 */
import { Cesium3DTileStyle, Cesium3DTileset } from 'cesium';
import type { Viewer } from 'cesium';
import { getActiveCesiumViewer } from './registry';

function eachTileset(fn: (t: Cesium3DTileset) => void): number {
  const viewer: Viewer | null = getActiveCesiumViewer();
  if (!viewer || viewer.isDestroyed()) return 0;
  const prims = viewer.scene.primitives;
  let count = 0;
  for (let i = 0; i < prims.length; i++) {
    const p = prims.get(i);
    if (p instanceof Cesium3DTileset) {
      fn(p);
      count++;
    }
  }
  return count;
}

/** Number of 3D tilesets currently loaded in the active Cesium scene. */
export function tilesetCount(): number {
  return eachTileset(() => {});
}

/** Colour every feature by a numeric/string property (golden-angle hue spread). */
export function colorByProperty(propertyName: string): number {
  const prop = propertyName.trim();
  if (!prop) return 0;
  return eachTileset((t) => {
    t.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          [`\${${prop}} === undefined`, 'color("gray")'],
          ['true', `color("hsl(" + ((\${${prop}} * 137.508) % 360) + ", 70%, 55%)")`],
        ],
      },
    });
  });
}

/** Colour by height with a green→red ramp. */
export function colorByHeight(): number {
  return eachTileset((t) => {
    t.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ['${height} > 200', 'color("#d73027")'],
          ['${height} > 150', 'color("#fc8d59")'],
          ['${height} > 100', 'color("#fee08b")'],
          ['${height} > 50', 'color("#d9ef8b")'],
          ['${height} > 20', 'color("#91cf60")'],
          ['${height} > 0', 'color("#1a9850")'],
          ['true', 'color("gray")'],
        ],
      },
    });
  });
}

/** Colour by LIDAR classification code. */
export function colorByClassification(): number {
  return eachTileset((t) => {
    t.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ['${classification} === 2', 'color("#8B4513")'],
          ['${classification} === 3', 'color("#228B22")'],
          ['${classification} === 4', 'color("#006400")'],
          ['${classification} === 5', 'color("#013220")'],
          ['${classification} === 6', 'color("#FF4500")'],
          ['${classification} === 9', 'color("#1E90FF")'],
          ['true', 'color("gray")'],
        ],
      },
    });
  });
}

/** Remove any custom style. */
export function resetStyle(): number {
  return eachTileset((t) => {
    t.style = undefined;
  });
}

/** Uniform white tint at the given opacity (0–1). */
export function setOpacity(opacity: number): number {
  return eachTileset((t) => {
    t.style = new Cesium3DTileStyle({ color: `color("white", ${opacity})` });
  });
}

/** Point size for point-cloud tilesets. */
export function setPointSize(size: number): number {
  return eachTileset((t) => {
    t.style = new Cesium3DTileStyle({ pointSize: `${size}` });
  });
}
