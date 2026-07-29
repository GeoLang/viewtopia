import { describe, it, expect } from 'vitest';
import {
  choroplethFields,
  classOf,
  classifyLayer,
  clearClassification,
} from '../../src/store/choropleth';
import { sampleRamp } from '../../src/raster/renderer';
import type { AgentLayer } from '../../src/store/agentLayers';

/**
 * The class colour is baked onto each feature as simplestyle properties, which
 * is what lets Cesium shade a layer with no renderer code at all.
 */

const polygon = (risk: number, name: string): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { risk, name, label: 'same' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [12, 45],
        [13, 45],
        [13, 46],
        [12, 46],
        [12, 45],
      ],
    ],
  },
});

const layerOf = (features: GeoJSON.Feature[]): AgentLayer => ({
  id: 'risk',
  name: 'Flood risk',
  color: '#3388ff',
  geojson: { type: 'FeatureCollection', features },
});

const VALUES = [0, 25, 50, 75, 100];
const scored = () => layerOf(VALUES.map((v, i) => polygon(v, `z${i}`)));
const rgb = (t: number) => {
  const [r, g, b] = sampleRamp('viridis', t);
  return `rgb(${r},${g},${b})`;
};

describe('choropleth classes', () => {
  it('splits the range into equal-width classes across the whole ramp', () => {
    const { choropleth } = classifyLayer(scored(), 'risk');

    // five bins over 0..100, so the lower bounds are every 20
    expect(choropleth?.breaks).toEqual([0, 20, 40, 60, 80]);
    expect(choropleth?.colors).toHaveLength(5);
    expect(choropleth?.colors[0]).toBe(rgb(0));
    expect(choropleth?.colors[4]).toBe(rgb(1));
    expect(new Set(choropleth?.colors).size).toBe(5);
    expect(choropleth?.field).toBe('risk');
  });

  it('puts a value in the class whose lower bound it clears', () => {
    const breaks = [0, 20, 40, 60, 80];
    expect(classOf(0, breaks)).toBe(0);
    expect(classOf(19.9, breaks)).toBe(0);
    expect(classOf(20, breaks)).toBe(1);
    expect(classOf(79, breaks)).toBe(3);
    // the top value belongs to the top class, not off the end
    expect(classOf(100, breaks)).toBe(4);
  });

  it('honours a class count other than the default', () => {
    const { choropleth } = classifyLayer(scored(), 'risk', 'reds', 2);
    expect(choropleth?.breaks).toEqual([0, 50]);
    expect(choropleth?.colors).toHaveLength(2);
  });

  it('bakes the class colour onto each feature by geometry type', () => {
    const line: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 100 },
      geometry: { type: 'LineString', coordinates: [[12, 45], [13, 46]] },
    };
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 0 },
      geometry: { type: 'Point', coordinates: [12, 45] },
    };
    const classified = classifyLayer(layerOf([polygon(0, 'a'), polygon(100, 'b'), line, point]), 'risk');
    const props = classified.geojson.features.map((f) => f.properties ?? {});

    // a polygon's outline stays the layer colour, so only the fill is shaded
    expect(props[0]).toMatchObject({ fill: rgb(0) });
    expect(props[0].stroke).toBeUndefined();
    expect(props[1].fill).toBe(rgb(1));
    // a line has no fill, so its colour has to come from stroke
    expect(props[2]).toMatchObject({ stroke: rgb(1) });
    expect(props[2].fill).toBeUndefined();
    expect(props[3]).toMatchObject({ 'marker-color': rgb(0) });
  });

  it('leaves a feature alone when the field is not a number there', () => {
    const missing: GeoJSON.Feature = {
      type: 'Feature',
      properties: { risk: 'high' },
      geometry: { type: 'Point', coordinates: [12, 45] },
    };
    const classified = classifyLayer(layerOf([polygon(0, 'a'), polygon(100, 'b'), missing]), 'risk');

    expect(classified.geojson.features[2].properties).toEqual({ risk: 'high' });
  });

  it('keeps the unclassified features so clearing restores the single colour', () => {
    const plain = scored();
    const classified = classifyLayer(plain, 'risk');

    // the source data must survive untouched, or clearing could not undo this
    expect(plain.geojson.features[0].properties?.fill).toBeUndefined();
    expect(classified.sourceGeojson).toBe(plain.geojson);

    const cleared = clearClassification(classified);
    expect(cleared.geojson).toBe(plain.geojson);
    expect(cleared.choropleth).toBeUndefined();
    expect(cleared.sourceGeojson).toBeUndefined();
  });

  it('re-classifying starts from the unclassified features, not the shaded ones', () => {
    const plain = scored();
    const again = classifyLayer(classifyLayer(plain, 'risk'), 'risk', 'reds', 2);

    expect(again.sourceGeojson).toBe(plain.geojson);
    expect(again.choropleth?.breaks).toEqual([0, 50]);
  });

  it('offers only fields that can say something', () => {
    expect(choroplethFields(scored())).toEqual(['risk']);
    // one feature carrying every score has nothing to shade
    expect(choroplethFields(layerOf([polygon(42, 'only')]))).toEqual([]);
    expect(choroplethFields(layerOf([polygon(7, 'a'), polygon(7, 'b')]))).toEqual([]);
  });

  it('shades nothing when the field does not vary', () => {
    const flat = layerOf([polygon(42, 'only')]);
    expect(classifyLayer(flat, 'risk')).toBe(flat);
  });
});
