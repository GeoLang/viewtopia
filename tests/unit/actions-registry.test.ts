import { beforeEach, describe, expect, it } from 'vitest';
import {
  ActionError,
  actionCatalogue,
  clearActionsForTests,
  coerceArguments,
  registerAction,
  runAction,
  type ActionDefinition,
} from '../../src/actions/registry';

const noop = (): { text: string } => ({ text: 'done' });

function define(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    name: 'test.one',
    description: 'the first test action',
    parameters: {},
    run: noop,
    ...overrides,
  };
}

describe('action registry', () => {
  beforeEach(() => clearActionsForTests());

  it('registers an action and finds it again by name', async () => {
    registerAction(define({ run: () => ({ text: 'ran it' }) }));
    await expect(runAction('test.one', {})).resolves.toEqual({ text: 'ran it' });
  });

  it('refuses a second action under the same name', () => {
    registerAction(define());
    expect(() => registerAction(define())).toThrow('registered twice');
  });

  it('publishes each entry as a JSON-schema object, sorted by name', () => {
    registerAction(
      define({
        name: 'zebra.set',
        parameters: {
          stripes: { type: 'number', description: 'how many', required: true },
          color: { type: 'string', description: 'which colour', enum: ['black', 'white'] },
        },
        destructive: true,
      }),
    );
    registerAction(define({ name: 'alpha.get', reads: true }));

    expect(actionCatalogue()).toEqual([
      {
        name: 'alpha.get',
        description: 'the first test action',
        parameters: { type: 'object', properties: {}, required: [] },
        reads: true,
        destructive: false,
      },
      {
        name: 'zebra.set',
        description: 'the first test action',
        parameters: {
          type: 'object',
          properties: {
            stripes: { type: 'number', description: 'how many' },
            color: { type: 'string', description: 'which colour', enum: ['black', 'white'] },
          },
          required: ['stripes'],
        },
        reads: false,
        destructive: true,
      },
    ]);
  });

  describe('coerceArguments', () => {
    const definition = define({
      parameters: {
        count: { type: 'number', description: 'how many', required: true },
        on: { type: 'boolean', description: 'whether' },
        pick: { type: 'string', description: 'which', enum: ['left', 'right'] },
      },
    });

    it('reads a numeric string as a number', () => {
      expect(coerceArguments(definition, { count: '12' })).toEqual({ count: 12 });
    });

    it('reads boolean words as booleans', () => {
      expect(coerceArguments(definition, { count: 1, on: 'yes' })).toEqual({ count: 1, on: true });
      expect(coerceArguments(definition, { count: 1, on: 'off' })).toEqual({ count: 1, on: false });
    });

    it('refuses a value the enum does not hold', () => {
      expect(() => coerceArguments(definition, { count: 1, pick: 'middle' })).toThrow(
        'pick must be one of left, right',
      );
    });

    it('refuses a missing required parameter', () => {
      expect(() => coerceArguments(definition, {})).toThrow('count is required');
    });

    it('drops a parameter the action does not take', () => {
      expect(coerceArguments(definition, { count: 1, colour: 'red' })).toEqual({ count: 1 });
    });

    it('names every problem in one message', () => {
      expect(() => coerceArguments(definition, { on: 'maybe', pick: 'middle' })).toThrow(
        'test.one: count is required, on must be a boolean, pick must be one of left, right',
      );
    });
  });

  it('refuses to run a name nobody registered', async () => {
    await expect(runAction('nothing.here', {})).rejects.toBeInstanceOf(ActionError);
    await expect(runAction('nothing.here', {})).rejects.toThrow('no action named nothing.here');
  });
});
