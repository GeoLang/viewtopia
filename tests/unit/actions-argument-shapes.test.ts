import { describe, expect, it } from 'vitest';
import '../../src/actions/camera';
import '../../src/actions/data';
import '../../src/actions/dataset';
import '../../src/actions/find';
import '../../src/actions/history';
import '../../src/actions/layers';
import '../../src/actions/live';
import '../../src/actions/marker';
import '../../src/actions/project';
import '../../src/actions/scenario';
import '../../src/actions/scene';
import '../../src/actions/terrain';
import '../../src/actions/tileset';
import '../../src/actions/view';
import {
  actionCatalogue,
  coerceArguments,
  findAction,
  type ActionArguments,
  type ActionDefinition,
  type ActionParameter,
} from '../../src/actions/registry';

/** Stands in for any number parameter, and reads back the same from "42". */
const NUMBER_VALUE = 42;

/** Stands in for any string parameter the catalogue puts no enum on. */
const STRING_VALUE = 'x';

/** Appended to an enum value to make a paraphrase the enum does not hold. */
const PARAPHRASE_SUFFIX = '-x';

interface ParameterCase {
  action: string;
  key: string;
  value: string | number;
}

const ENUM_CASES: ParameterCase[] = [];
const NUMBER_CASES: ParameterCase[] = [];

for (const entry of actionCatalogue()) {
  for (const [key, parameter] of Object.entries(entry.parameters.properties)) {
    if (parameter.enum) ENUM_CASES.push({ action: entry.name, key, value: parameter.enum[0] });
    else if (parameter.type === 'number') {
      NUMBER_CASES.push({ action: entry.name, key, value: NUMBER_VALUE });
    }
  }
}

const PARAMETER_CASES = [...ENUM_CASES, ...NUMBER_CASES];

function definitionOf(name: string): ActionDefinition {
  const definition = findAction(name);
  if (!definition) throw new Error(`no action named ${name}`);
  return definition;
}

function placeholder(parameter: ActionParameter): unknown {
  switch (parameter.type) {
    case 'string':
      return parameter.enum ? parameter.enum[0] : STRING_VALUE;
    case 'number':
      return NUMBER_VALUE;
    case 'boolean':
      return true;
    case 'object':
      return {};
    case 'array':
      return [];
  }
}

/** Every other required argument filled in, so only the one under test can be a problem. */
function otherArguments(definition: ActionDefinition, key: string): ActionArguments {
  const filled: ActionArguments = {};
  for (const [name, parameter] of Object.entries(definition.parameters)) {
    if (name !== key && parameter.required) filled[name] = placeholder(parameter);
  }
  return filled;
}

/** The shapes models have sent one scalar in, each named for the failure message. */
function shapes(key: string, value: string | number): { shape: string; sent: unknown }[] {
  const shared = [
    { shape: 'plain', sent: value },
    { shape: 'one-element array', sent: [value] },
    { shape: 'self-named wrapper', sent: { [key]: value } },
  ];
  if (typeof value === 'number') {
    return [...shared, { shape: 'numeric string', sent: String(value) }];
  }
  return [...shared, { shape: 'key with an empty value', sent: { [value]: null } }];
}

function coerceOne(definition: ActionDefinition, key: string, sent: unknown): unknown {
  return coerceArguments(definition, { ...otherArguments(definition, key), [key]: sent })[key];
}

describe('an argument the model wrapped', () => {
  it.each(PARAMETER_CASES)('$action reads $key out of every shape', ({ action, key, value }) => {
    const definition = definitionOf(action);
    const read = Object.fromEntries(
      shapes(key, value).map(({ shape, sent }) => [shape, coerceOne(definition, key, sent)]),
    );
    const plain = Object.fromEntries(shapes(key, value).map(({ shape }) => [shape, value]));
    expect(read).toEqual(plain);
  });
});

describe('an argument no shape can rescue', () => {
  it.each(ENUM_CASES)('$action refuses a paraphrase of $key', ({ action, key, value }) => {
    const definition = definitionOf(action);
    expect(() => coerceOne(definition, key, `${value}${PARAPHRASE_SUFFIX}`)).toThrow(
      `${key} must be one of`,
    );
  });

  it.each(PARAMETER_CASES)('$action refuses a two-element $key', ({ action, key, value }) => {
    const definition = definitionOf(action);
    expect(() => coerceOne(definition, key, [value, value])).toThrow(`${key} must be a`);
  });

  it.each(PARAMETER_CASES)('$action refuses a two-key wrapper on $key', ({ action, key, value }) => {
    const definition = definitionOf(action);
    expect(() => coerceOne(definition, key, { [key]: value, extra: value })).toThrow(
      `${key} must be a`,
    );
  });
});
