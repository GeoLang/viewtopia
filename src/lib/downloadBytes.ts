/** Hand written bytes to the browser as a file download. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  // copied off the wasm heap, whose buffer Blob will not take
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}
