import { describe, it, expect } from 'vitest';
import { isToleratedGatewayError } from '../e2e/console-guard';

const resourceError = (status, text) =>
  `console.error: Failed to load resource: the server responded with a status of ${status} (${text})`;

describe('console guard gateway tolerance', () => {
  it('tolerates cold-upstream gateway statuses', () => {
    expect(isToleratedGatewayError(resourceError(502, 'Bad Gateway'))).toBe(true);
    expect(isToleratedGatewayError(resourceError(503, 'Service Unavailable'))).toBe(true);
    expect(isToleratedGatewayError(resourceError(504, 'Gateway Timeout'))).toBe(true);
  });

  it('keeps 4xx resource failures fatal', () => {
    expect(isToleratedGatewayError(resourceError(401, 'Unauthorized'))).toBe(false);
    expect(isToleratedGatewayError(resourceError(404, 'Not Found'))).toBe(false);
    expect(isToleratedGatewayError(resourceError(500, 'Internal Server Error'))).toBe(false);
  });

  it('never tolerates a pageerror or an app-logged error', () => {
    expect(isToleratedGatewayError('pageerror: TypeError: x is not a function')).toBe(false);
    expect(isToleratedGatewayError('console.error: Error: 502 Bad Gateway')).toBe(false);
  });
});
