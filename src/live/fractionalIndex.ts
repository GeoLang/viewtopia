const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function digitValue(character: string): number {
  const value = ALPHABET.indexOf(character);
  if (value < 0) throw new Error(`invalid fractional index digit: ${character}`);
  return value;
}

// a trailing zero digit has no midpoint below it, so no generated index may end in one
function assertValidIndex(index: string, label: string): void {
  if (index.length === 0) throw new Error(`${label} fractional index is empty`);
  for (const character of index) digitValue(character);
  if (index.endsWith(ALPHABET[0])) {
    throw new Error(`${label} fractional index has a trailing zero: ${index}`);
  }
}

function midpoint(lower: string, upper: string | null): string {
  if (upper !== null) {
    let shared = 0;
    while ((lower[shared] ?? ALPHABET[0]) === upper[shared]) shared += 1;
    if (shared > 0) {
      return upper.slice(0, shared) + midpoint(lower.slice(shared), upper.slice(shared));
    }
  }

  const lowerDigit = lower.length > 0 ? digitValue(lower[0]) : 0;
  const upperDigit = upper !== null ? digitValue(upper[0]) : ALPHABET.length;

  if (upperDigit - lowerDigit > 1) {
    return ALPHABET[Math.round((lowerDigit + upperDigit) / 2)];
  }
  if (upper !== null && upper.length > 1) {
    return upper.slice(0, 1);
  }
  return ALPHABET[lowerDigit] + midpoint(lower.slice(1), null);
}

export function generateIndexBetween(lower: string | null, upper: string | null): string {
  if (lower !== null) assertValidIndex(lower, 'lower');
  if (upper !== null) assertValidIndex(upper, 'upper');
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error(`fractional index ${lower} is not below ${upper}`);
  }
  return midpoint(lower ?? '', upper);
}

export function compareFractionalIndex(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
