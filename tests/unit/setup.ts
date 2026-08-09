import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// a tree left mounted at file teardown keeps a react scheduler task queued,
// which then reads `window` after jsdom is gone (flaked twice on macos CI)
afterEach(cleanup);
