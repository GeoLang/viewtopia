export function randomUuid(): string {
  // browsers expose crypto.randomUUID only on https and localhost, and crypto.getRandomValues on every origin
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // rfc 9562 version 4: the version nibble is 4 and the variant bits are 10
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
