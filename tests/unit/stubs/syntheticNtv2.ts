/**
 * A valid single sub-grid NTv2 file applying one constant shift everywhere, ported
 * from projicio's crates/projicio-core/tests/grids.rs.
 *
 * Layout per the NTv2 specification: an 11 record overview header, an 11 record
 * sub-grid header, then one 16 byte record per node. Records are 8 ASCII bytes of
 * tag followed by 8 bytes of value. Header longitudes are positive WEST, which is
 * why `west` is the larger number for a box straddling the prime meridian.
 *
 * A constant shift keeps the expected output exact, since bilinear interpolation of
 * equal corner values returns that value.
 */
export function syntheticNtv2(
  southDegrees: number,
  northDegrees: number,
  eastDegreesPositiveWest: number,
  westDegreesPositiveWest: number,
  incrementDegrees: number,
  latitudeShiftSeconds: number,
  longitudeShiftSeconds: number,
): Uint8Array {
  const bytes: number[] = [];

  const push = (chunk: Uint8Array) => {
    for (const byte of chunk) {
      bytes.push(byte);
    }
  };
  const text = (value: string) => new TextEncoder().encode(value.padEnd(8, ' '));
  const float64 = (value: number) => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    return new Uint8Array(buffer);
  };
  const int32Padded = (value: number) => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setInt32(0, value, true);
    return new Uint8Array(buffer);
  };
  const record = (tag: string, payload: Uint8Array) => {
    if (payload.length !== 8) {
      throw new Error(`NTv2 values are 8 bytes, got ${payload.length}`);
    }
    push(text(tag));
    push(payload);
  };

  // NUM_OREC carries 11, which is also how a reader detects endianness.
  record('NUM_OREC', int32Padded(11));
  record('NUM_SREC', int32Padded(11));
  record('NUM_FILE', int32Padded(1));
  record('GS_TYPE', text('SECONDS'));
  record('VERSION', text('NTv2.0'));
  record('SYSTEM_F', text('SRC'));
  record('SYSTEM_T', text('DST'));
  record('MAJOR_F', float64(6378206.4));
  record('MINOR_F', float64(6356583.8));
  record('MAJOR_T', float64(6378137.0));
  record('MINOR_T', float64(6356752.314));

  const south = southDegrees * 3600;
  const north = northDegrees * 3600;
  const east = eastDegreesPositiveWest * 3600;
  const west = westDegreesPositiveWest * 3600;
  const increment = incrementDegrees * 3600;

  // the node counts a reader derives, so GS_COUNT agrees with the header box
  const rows = Math.floor(Math.abs(north - south) / increment + 0.5 + 1);
  const columns = Math.floor(Math.abs(west - east) / increment + 0.5 + 1);
  const count = rows * columns;

  record('SUB_NAME', text('TESTGRID'));
  record('PARENT', text('NONE'));
  record('CREATED', text('01011990'));
  record('UPDATED', text('01011990'));
  record('S_LAT', float64(south));
  record('N_LAT', float64(north));
  record('E_LONG', float64(east));
  record('W_LONG', float64(west));
  record('LAT_INC', float64(increment));
  record('LONG_INC', float64(increment));
  record('GS_COUNT', int32Padded(count));

  const node = new ArrayBuffer(16);
  const nodeView = new DataView(node);
  nodeView.setFloat32(0, latitudeShiftSeconds, true);
  nodeView.setFloat32(4, longitudeShiftSeconds, true);
  for (let index = 0; index < count; index += 1) {
    push(new Uint8Array(node));
  }

  return new Uint8Array(bytes);
}
