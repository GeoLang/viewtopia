import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmStore } from '../../src/actions/confirm';
import { interceptConfirmReply, runViewerAction } from '../../src/actions/dispatch';
import { ActionError, clearActionsForTests, registerAction } from '../../src/actions/registry';
import { MAXIMUM_FOLLOW_UPS, useChatStore } from '../../src/store/chat';

/** What the chat has been told, oldest first. */
const notices = (): string[] =>
  useChatStore
    .getState()
    .activeMessages()
    .map((message) => message.content);

let painted: string;

beforeEach(() => {
  clearActionsForTests();
  useConfirmStore.setState({ pending: null });
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    followUp: null,
    followUpCount: 0,
  });
  painted = 'nothing';
  registerAction({
    name: 'paint.set',
    description: 'Paint the map',
    parameters: { color: { type: 'string', description: 'which colour', required: true } },
    run: (args) => {
      painted = args.color as string;
      return { text: `Painted ${painted}.` };
    },
  });
});

describe('runViewerAction', () => {
  it('runs the named action and posts what it did', async () => {
    await runViewerAction({ name: 'paint.set', args: { color: 'red' } });

    expect(painted).toBe('red');
    expect(notices()).toEqual(['Painted red.']);
  });

  it('a replay runs the action and posts nothing', async () => {
    await runViewerAction({ name: 'paint.set', args: { color: 'red' } }, { announce: false });

    expect(painted).toBe('red');
    expect(notices()).toEqual([]);
  });

  // small models send the arguments as a JSON string rather than an object
  it('reads arguments that arrive as JSON text', async () => {
    await runViewerAction({ name: 'paint.set', args: '{"color":"blue"}' });

    expect(painted).toBe('blue');
    expect(notices()).toEqual(['Painted blue.']);
  });

  it('says so when the arguments are not an object at all', async () => {
    await runViewerAction({ name: 'paint.set', args: 'red' });

    expect(painted).toBe('nothing');
    expect(notices()).toEqual(['paint.set: its arguments did not read as an object.']);
  });

  it('names an action nobody registered', async () => {
    await runViewerAction({ name: 'paint.everything', args: {} });

    expect(notices()).toEqual(['There is no viewer action named paint.everything.']);
  });

  it('turns a refused argument into a notice', async () => {
    await runViewerAction({ name: 'paint.set', args: {} });

    expect(painted).toBe('nothing');
    expect(notices()).toEqual(['paint.set: color is required']);
  });

  it('turns an action that throws into a notice', async () => {
    registerAction({
      name: 'paint.fail',
      description: 'Fail at painting',
      parameters: {},
      run: () => {
        throw new ActionError('the tin is empty');
      },
    });

    await runViewerAction({ name: 'paint.fail', args: {} });

    expect(notices()).toEqual(['the tin is empty']);
  });
});

describe('a destructive action', () => {
  const registerBurn = (run = vi.fn(() => ({ text: 'Burned it.' }))) => {
    registerAction({
      name: 'paint.burn',
      description: 'Burn the map',
      parameters: {},
      destructive: true,
      run,
    });
    return run;
  };

  it('asks before it runs', async () => {
    const run = registerBurn();

    await runViewerAction({ name: 'paint.burn', args: {} });

    expect(run).not.toHaveBeenCalled();
    expect(useConfirmStore.getState().pending).toEqual({ name: 'paint.burn', args: {} });
    expect(notices()).toEqual([
      'paint.burn: Burn the map. Reply yes to run it, anything else cancels.',
    ]);
  });

  it('runs on a confirming reply, which the agent never sees', async () => {
    const run = registerBurn();
    await runViewerAction({ name: 'paint.burn', args: {} });

    expect(interceptConfirmReply(' Yes ')).toBe(true);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    expect(useConfirmStore.getState().pending).toBeNull();
    expect(notices()).toContain('Burned it.');
  });

  it('cancels on anything else, and lets that prompt through to the agent', async () => {
    const run = registerBurn();
    await runViewerAction({ name: 'paint.burn', args: {} });

    expect(interceptConfirmReply('actually, show me the layers')).toBe(false);

    expect(run).not.toHaveBeenCalled();
    expect(useConfirmStore.getState().pending).toBeNull();
    expect(notices()).toContain('Cancelled paint.burn.');
  });

  it('runs at once when replayed, the click being the confirmation', async () => {
    const run = registerBurn();

    await runViewerAction({ name: 'paint.burn', args: {} }, { announce: false });

    expect(run).toHaveBeenCalledTimes(1);
    expect(useConfirmStore.getState().pending).toBeNull();
    expect(notices()).toEqual([]);
  });

  it('leaves an ordinary prompt alone when nothing is pending', () => {
    expect(interceptConfirmReply('yes')).toBe(false);
    expect(notices()).toEqual([]);
  });
});

describe('an action that answers a question', () => {
  beforeEach(() => {
    registerAction({
      name: 'paint.count',
      description: 'Count the paints',
      parameters: {},
      reads: true,
      run: () => ({ text: '3 tins.' }),
    });
  });

  it('sends its result back as the next turn', async () => {
    await runViewerAction({ name: 'paint.count', args: {} });

    expect(notices()).toEqual(['3 tins.']);
    expect(useChatStore.getState().followUp).toBe('Result of paint.count: 3 tins.');
  });

  it('stops sending once the follow-ups are spent', async () => {
    useChatStore.setState({ followUpCount: MAXIMUM_FOLLOW_UPS });

    await runViewerAction({ name: 'paint.count', args: {} });

    expect(notices()).toEqual(['3 tins.']);
    expect(useChatStore.getState().followUp).toBeNull();
  });
});
