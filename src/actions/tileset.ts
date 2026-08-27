/**
 * Styling the 3D tilesets on the globe, through the same helpers the Style
 * Editor panel's buttons run. Nothing names one tileset apart from the others,
 * so each of these styles every tileset the Cesium scene holds.
 */

import {
  colorByClassification,
  colorByHeight,
  colorByProperty,
  resetStyle,
  setOpacity,
  setPointSize,
} from '../viewer/tileStyles';
import { cesiumViewer } from './globe';
import { ActionError, registerAction } from './registry';

const MIN_OPACITY = 0;
const MAX_OPACITY = 1;

/**
 * How many tilesets the style reached. Refuses when there is no globe to hold a
 * tileset, and when the globe holds none.
 */
function styled(apply: () => number): number {
  cesiumViewer();
  const count = apply();
  if (count === 0) {
    throw new ActionError('no 3D tileset is loaded on the globe, so there is nothing to style');
  }
  return count;
}

function tilesets(count: number): string {
  return count === 1 ? '1 tileset' : `${count} tilesets`;
}

registerAction({
  name: 'tileset.shade_by_classification',
  description:
    'Colour every 3D tileset on the globe by its LIDAR classification codes, so ground, vegetation, buildings and water each take a colour.',
  parameters: {},
  run: () => {
    const count = styled(colorByClassification);
    return { text: `Coloured ${tilesets(count)} by classification code.` };
  },
});

registerAction({
  name: 'tileset.shade_by_height',
  description:
    'Colour every 3D tileset on the globe by height band, green near the ground through red at the top.',
  parameters: {},
  run: () => {
    const count = styled(colorByHeight);
    return { text: `Coloured ${tilesets(count)} by height band.` };
  },
});

registerAction({
  name: 'tileset.shade_by_property',
  description: "Colour every 3D tileset on the globe by one feature property's values.",
  parameters: {
    property: {
      type: 'string',
      description: 'Feature property the colours are spread over, as the tileset names it.',
      required: true,
    },
  },
  run: (args) => {
    const property = (args.property as string).trim();
    if (property === '') {
      throw new ActionError('property is the name of a feature property, not blank');
    }
    const count = styled(() => colorByProperty(property));
    return { text: `Coloured ${tilesets(count)} by ${property}.` };
  },
});

registerAction({
  name: 'tileset.reset_style',
  description:
    'Take any colouring, fading and point size back off every 3D tileset on the globe, so the tiles draw as they came.',
  parameters: {},
  run: () => {
    const count = styled(resetStyle);
    return { text: `Took the styling off ${tilesets(count)}.` };
  },
});

registerAction({
  name: 'tileset.set_opacity',
  description:
    'Fade every 3D tileset on the globe to a uniform white at the opacity given, which also takes off any colouring it had.',
  parameters: {
    opacity: { type: 'number', description: '0 is invisible, 1 is fully opaque.', required: true },
  },
  run: (args) => {
    const opacity = args.opacity as number;
    if (opacity < MIN_OPACITY || opacity > MAX_OPACITY) {
      throw new ActionError(`an opacity is between ${MIN_OPACITY} and ${MAX_OPACITY}, not ${opacity}`);
    }
    const count = styled(() => setOpacity(opacity));
    return { text: `Faded ${tilesets(count)} to a white at ${opacity} opacity.` };
  },
});

registerAction({
  name: 'tileset.set_point_size',
  description:
    'Draw the points of every 3D tileset on the globe at a size in pixels, which also takes off any colouring it had.',
  parameters: {
    size: {
      type: 'number',
      description: 'Width of one point in pixels, above 0. Only a point cloud has points to draw.',
      required: true,
    },
  },
  run: (args) => {
    const size = args.size as number;
    if (size <= 0) {
      throw new ActionError(`a point size is a width in pixels above 0, not ${size}`);
    }
    const count = styled(() => setPointSize(size));
    return { text: `Drew the points of ${tilesets(count)} at ${size} pixels.` };
  },
});
