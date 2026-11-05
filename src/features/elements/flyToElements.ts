import { BoundingSphere, IonAssetElementService } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import type { ElementRow } from './elementService';

const FLY_SECONDS = 1;

export function flyToElements(rows: ElementRow[]): void {
  const spheres = rows.flatMap((row) => IonAssetElementService.getBoundingSphere(row) ?? []);
  const sphere = BoundingSphere.fromBoundingSpheres(spheres);
  getActiveCesiumViewer()?.camera.flyToBoundingSphere(sphere, { duration: FLY_SECONDS });
}
