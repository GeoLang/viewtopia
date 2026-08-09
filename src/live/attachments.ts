/** Agora's cap on one attachment, which it answers a 413 past. */
export const MAXIMUM_ATTACHMENT_BYTES = 16 * 1024 * 1024;

export interface AttachmentBytes {
  contentType: string;
  /** its own buffer, never shared, which is what a request body may carry */
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * The bytes behind a base64 `data:` url, which is the form an overlay bitmap
 * takes whether it came from an image file or a rasterized PDF page. Null when
 * the url is not one, and throws when its base64 will not decode.
 */
export function decodeDataUrl(dataUrl: string): AttachmentBytes | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, contentType, encoded] = match;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { contentType, bytes };
}
