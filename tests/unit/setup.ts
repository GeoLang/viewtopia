import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// a tree left mounted at file teardown keeps a react scheduler task queued,
// which then reads `window` after jsdom is gone (flaked twice on macos CI)
afterEach(cleanup);

// the one second default gave up on a mocked fetch chain with ninety-six busy loops on sixteen cores
configure({ asyncUtilTimeout: 10000 });
