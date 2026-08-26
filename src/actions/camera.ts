import { executeViewerCommand } from '../viewer/commands';
import { ActionError, registerAction } from './registry';

const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;
/** enough to place the camera on a street, short enough to read back */
const COORDINATE_DECIMALS = 4;

function place(lon: number, lat: number): string {
  return `${lon.toFixed(COORDINATE_DECIMALS)}, ${lat.toFixed(COORDINATE_DECIMALS)}`;
}

registerAction({
  name: 'camera.fly_to',
  description: 'Fly the camera to a longitude and latitude.',
  parameters: {
    lon: { type: 'number', description: 'Longitude in degrees, -180 to 180.', required: true },
    lat: { type: 'number', description: 'Latitude in degrees, -90 to 90.', required: true },
    height: { type: 'number', description: 'Height above the ground in metres.' },
    heading: { type: 'number', description: 'Compass bearing in degrees, 0 is north.' },
    pitch: { type: 'number', description: 'Tilt in degrees, negative looks down at the ground.' },
  },
  run: (args) => {
    const lon = args.lon as number;
    const lat = args.lat as number;
    if (Math.abs(lon) > MAX_LONGITUDE || Math.abs(lat) > MAX_LATITUDE) {
      throw new ActionError(`${place(lon, lat)} is not a longitude and latitude`);
    }
    executeViewerCommand({ action: 'fly_to', params: args });
    return { text: `Flew the camera to ${place(lon, lat)}.` };
  },
});
