export interface AlignmentStation {
  distance: number;
  position: [number, number, number];
  tangent: [number, number, number];
}

export interface AlignmentCurve {
  id: string;
  name: string;
  length: number;
  approximate: boolean;
  stations: AlignmentStation[];
}

function finiteTriple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

export function alignmentsFrom(body: unknown): AlignmentCurve[] {
  if (!Array.isArray(body)) throw new Error('tiletopia returned alignments that are not a list.');
  return body.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const curve = item as Record<string, unknown>;
    if (typeof curve.id !== 'string' || !Array.isArray(curve.stations)) return [];
    const stations = curve.stations.flatMap((station) => {
      if (!station || typeof station !== 'object') return [];
      const point = station as Record<string, unknown>;
      if (typeof point.distance !== 'number' || !Number.isFinite(point.distance)) return [];
      if (!finiteTriple(point.position) || !finiteTriple(point.tangent)) return [];
      return [{ distance: point.distance, position: point.position, tangent: point.tangent }];
    });
    return [
      {
        id: curve.id,
        name: typeof curve.name === 'string' ? curve.name : '',
        length: typeof curve.length === 'number' && Number.isFinite(curve.length) ? curve.length : 0,
        approximate: curve.approximate === true,
        stations,
      },
    ];
  });
}

function unit(vector: readonly [number, number, number]): [number, number, number] | null {
  const span = Math.hypot(vector[0], vector[1], vector[2]);
  if (span < 1e-9) return null;
  return [vector[0] / span, vector[1] / span, vector[2] / span];
}

function mix(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function stationAt(
  stations: readonly AlignmentStation[],
  distance: number,
): AlignmentStation | null {
  if (stations.length === 0) return null;
  const placed = (station: AlignmentStation, at: number): AlignmentStation => ({
    distance: at,
    position: station.position,
    tangent: unit(station.tangent) ?? station.tangent,
  });
  const first = stations[0];
  if (stations.length === 1 || distance <= first.distance) return placed(first, first.distance);
  const last = stations[stations.length - 1];
  if (distance >= last.distance) return placed(last, last.distance);

  let high = 1;
  while (high < stations.length - 1 && stations[high].distance < distance) high += 1;
  const before = stations[high - 1];
  const after = stations[high];
  const span = after.distance - before.distance;
  const t = span === 0 ? 0 : (distance - before.distance) / span;
  return {
    distance,
    position: [
      mix(before.position[0], after.position[0], t),
      mix(before.position[1], after.position[1], t),
      mix(before.position[2], after.position[2], t),
    ],
    tangent: unit(before.tangent) ?? unit(after.tangent) ?? before.tangent,
  };
}

export function crossSectionPlane(
  station: AlignmentStation,
): { normal: [number, number, number]; offset: number } | null {
  const normal = unit(station.tangent);
  if (!normal) return null;
  const offset =
    normal[0] * station.position[0] + normal[1] * station.position[1] + normal[2] * station.position[2];
  return { normal, offset };
}
