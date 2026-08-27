/**
 * Markers the chat drops on the map. They go through the agent-layer store, so
 * every renderer draws them and a renderer switch keeps them.
 */

import { executeViewerCommand } from '../viewer/commands';
import { checkOnTheGlobe, place } from './coordinates';
import { registerAction } from './registry';

registerAction({
  name: 'marker.add',
  description: 'Drop a marker on the map at a longitude and latitude.',
  parameters: {
    lon: { type: 'number', description: 'Longitude in degrees, -180 to 180.', required: true },
    lat: { type: 'number', description: 'Latitude in degrees, -90 to 90.', required: true },
    label: { type: 'string', description: 'Text shown beside the marker.' },
    color: { type: 'string', description: 'CSS colour of the marker. Red by default.' },
  },
  run: (args) => {
    const [longitude, latitude] = checkOnTheGlobe(args.lon as number, args.lat as number);
    const label = args.label as string | undefined;
    executeViewerCommand({ action: 'add_marker', params: args });
    const named = label ? ` labelled ${label}` : '';
    return { text: `Dropped a marker${named} at ${place(longitude, latitude)}.` };
  },
});
