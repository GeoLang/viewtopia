import { executeViewerCommand } from '../viewer/commands';
import { checkOnTheGlobe, place } from './coordinates';
import { registerAction } from './registry';

registerAction({
  name: 'camera.fly_to',
  description: 'Fly the camera to a longitude and latitude.',
  parameters: {
    lon: { type: 'number', description: 'Longitude in degrees, -180 to 180.', required: true },
    lat: { type: 'number', description: 'Latitude in degrees, -90 to 90.', required: true },
    height: {
      type: 'number',
      description: 'Height above the ground in metres: about 5000 for a city, 2000000 for a country. Omit it to land at street level.',
    },
    heading: { type: 'number', description: 'Compass bearing in degrees, 0 is north.' },
    pitch: { type: 'number', description: 'Tilt in degrees, negative looks down at the ground.' },
  },
  run: (args) => {
    const [longitude, latitude] = checkOnTheGlobe(args.lon as number, args.lat as number);
    executeViewerCommand({ action: 'fly_to', params: args });
    return { text: `Flew the camera to ${place(longitude, latitude)}.` };
  },
});
