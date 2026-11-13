export function previewTriangles(
  positions: readonly number[],
  indices: readonly number[],
): { positions: Float64Array; indices: Uint32Array } | null {
  if (positions.length < 9 || positions.length % 3 !== 0) return null;
  if (indices.length < 3 || indices.length % 3 !== 0) return null;
  const vertices = positions.length / 3;
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertices) return null;
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}
