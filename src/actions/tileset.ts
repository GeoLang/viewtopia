/**
 * Colouring the 3D tilesets on the globe, through the same three helpers the
 * Style Editor panel's buttons run. Nothing names one tileset apart from the
 * others, so each of these styles every tileset the Cesium scene holds.
 */

import { colorByClassification, colorByHeight, colorByProperty } from '../viewer/tileStyles';
import { ActionError, registerAction, type ActionResult } from './registry';

/** How many tilesets took the colours, or an ActionError when none did. */
function coloured(count: number, by: string): ActionResult {
  if (count === 0) {
    throw new ActionError('no 3D tileset is loaded on the globe, so there is nothing to colour');
  }
  const tilesets = count === 1 ? '1 tileset' : `${count} tilesets`;
  return { text: `Coloured ${tilesets} by ${by}.` };
}

registerAction({
  name: 'tileset.shade_by_classification',
  description:
    'Colour every 3D tileset on the globe by its LIDAR classification codes, so ground, vegetation, buildings and water each take a colour.',
  parameters: {},
  run: () => coloured(colorByClassification(), 'classification code'),
});

registerAction({
  name: 'tileset.shade_by_height',
  description:
    'Colour every 3D tileset on the globe by height band, green near the ground through red at the top.',
  parameters: {},
  run: () => coloured(colorByHeight(), 'height band'),
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
    return coloured(colorByProperty(property), property);
  },
});
