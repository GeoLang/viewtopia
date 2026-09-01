/**
 * An agent backend that answers a chat run with an empty reply, for the react
 * e2e config, which starts no platform stack. The viewer starts a run of its
 * own whenever an action queues a follow-up: a read action's result, or an
 * action's failure. Without this the run reaches the dev proxy, which answers
 * 500, and the console guard fails the test that ran the action.
 *
 * Only the two paths a run uses are answered. Everything else under /agent/,
 * the health probe included, still goes to the proxy.
 */

/** An AG-UI run that starts and finishes with nothing in between. */
export const EMPTY_AGENT_RUN = [
  'data: {"type":"RUN_STARTED","threadId":"e2e-session","runId":"e2e-run"}',
  '',
  'data: {"type":"RUN_FINISHED","threadId":"e2e-session","runId":"e2e-run"}',
  '',
  '',
].join('\n');

/**
 * Answer the runs this page makes. The returned array collects each run's
 * request body, so a test can read back what the viewer sent the model.
 */
export async function stubAgentRuns(page) {
  const runBodies = [];
  await page.route('**/agent/sessions/new', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: 'e2e-session', name: 'Session 1' }),
    }),
  );
  await page.route('**/agent/chat/agui', (route, request) => {
    runBodies.push(request.postData() ?? '');
    return route.fulfill({ contentType: 'text/event-stream', body: EMPTY_AGENT_RUN });
  });
  return runBodies;
}
