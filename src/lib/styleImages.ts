// Sprites from ptolemy's dataset style endpoint, decoded for map.addImage. The
// translator's contract is that each image is registered at exactly the declared
// width x height css px, so the layers render right without an icon-size. The
// data URIs come from user-uploaded styles, so a decode failure only costs that
// one image: MapLibre draws a missing image name as nothing, which is also how
// the translator hides a branch.

import type { DatasetStyleImage } from './datasetStyle';

export interface DecodedStyleImage {
  name: string;
  image: ImageData;
}

/** Decodes and scales one sprite. Rejects on anything the browser will not draw. */
export async function decodeStyleImage(image: DatasetStyleImage): Promise<ImageData> {
  const width = Math.max(1, Math.round(image.width));
  const height = Math.max(1, Math.round(image.height));
  const decoded = new Image();
  await new Promise<void>((resolve, reject) => {
    decoded.onload = () => resolve();
    decoded.onerror = () => reject(new Error(`cannot decode ${image.name}`));
    decoded.src = image.dataUri;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(decoded, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** The sprites that decoded, in order. The rest are skipped, layers and all. */
export async function decodeStyleImages(
  images: DatasetStyleImage[],
  decode: (image: DatasetStyleImage) => Promise<ImageData>,
): Promise<DecodedStyleImage[]> {
  const decoded: DecodedStyleImage[] = [];
  for (const image of images) {
    try {
      decoded.push({ name: image.name, image: await decode(image) });
    } catch (err) {
      console.debug(`style image ${image.name} skipped`, err);
    }
  }
  return decoded;
}
