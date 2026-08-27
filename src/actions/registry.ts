/**
 * Named viewer actions the chat can run without the mouse. Each entry is one
 * capability: a name, what it does, its parameters and the function that does
 * it. The panel offering the same capability calls the same function.
 *
 * The catalogue goes to the model with every chat message, and the model runs
 * one entry through viewer_control(action='run', name, args).
 */

export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ActionParameter {
  type: ParameterType;
  description: string;
  enum?: readonly string[];
  required?: boolean;
}

/** What an action reports back to the chat. */
export interface ActionResult {
  text: string;
}

export type ActionArguments = Record<string, unknown>;

export interface ActionDefinition {
  /** dotted and lowercase, the domain first: 'layers.set_visible' */
  name: string;
  description: string;
  parameters: Record<string, ActionParameter>;
  /** answers a question, so its result goes back to the model as the next turn */
  reads?: boolean;
  /** asks for a confirming reply in the chat before it runs */
  destructive?: boolean;
  run: (args: ActionArguments) => ActionResult | Promise<ActionResult>;
}

/** One catalogue entry as the model sees it, a JSON-schema object for the parameters. */
export interface CatalogueEntry {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: ParameterType; description: string; enum?: readonly string[] }>;
    required: string[];
  };
  reads: boolean;
  destructive: boolean;
}

/** An unknown action name or arguments the action cannot take. */
export class ActionError extends Error {}

const actions = new Map<string, ActionDefinition>();

export function registerAction(definition: ActionDefinition): void {
  if (actions.has(definition.name)) {
    throw new Error(`action ${definition.name} is registered twice`);
  }
  actions.set(definition.name, definition);
}

export function findAction(name: string): ActionDefinition | undefined {
  return actions.get(name);
}

export function actionCatalogue(): CatalogueEntry[] {
  return [...actions.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((definition) => ({
      name: definition.name,
      description: definition.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(definition.parameters).map(([key, parameter]) => [
            key,
            {
              type: parameter.type,
              description: parameter.description,
              ...(parameter.enum ? { enum: parameter.enum } : {}),
            },
          ]),
        ),
        required: Object.entries(definition.parameters)
          .filter(([, parameter]) => parameter.required)
          .map(([key]) => key),
      },
      reads: definition.reads === true,
      destructive: definition.destructive === true,
    }));
}

const BOOLEAN_WORDS: Record<string, boolean> = { true: true, false: false, yes: true, no: false, on: true, off: false };

/**
 * `{basemap: {basemap: 'satellite'}}` read back as `'satellite'`.
 *
 * Small models echo the parameter name as a wrapper around its own value. Only
 * for scalar parameters, so an object parameter holding a same-named key is
 * left alone.
 */
function unwrapSelfNamed(key: string, parameter: ActionParameter, value: unknown): unknown {
  if (parameter.type === 'object') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== key) return value;
  return (value as Record<string, unknown>)[key];
}

/** The value as the parameter's type, or undefined when it cannot be read as one. */
function coerce(parameter: ActionParameter, value: unknown): unknown {
  switch (parameter.type) {
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
      return undefined;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return BOOLEAN_WORDS[value.trim().toLowerCase()];
      return undefined;
    }
    case 'string': {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return undefined;
    }
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
    case 'array':
      return Array.isArray(value) ? value : undefined;
  }
}

/**
 * The arguments as the action takes them: required ones present, each read as
 * its declared type, enum values checked, unknown keys dropped. Throws an
 * ActionError naming every problem at once.
 */
export function coerceArguments(definition: ActionDefinition, args: ActionArguments): ActionArguments {
  const problems: string[] = [];
  const coerced: ActionArguments = {};
  for (const [key, parameter] of Object.entries(definition.parameters)) {
    const value = args[key];
    if (value === undefined || value === null) {
      if (parameter.required) problems.push(`${key} is required`);
      continue;
    }
    const read = coerce(parameter, unwrapSelfNamed(key, parameter, value));
    if (read === undefined) {
      problems.push(`${key} must be a ${parameter.type}`);
      continue;
    }
    if (parameter.enum && !parameter.enum.includes(read as string)) {
      problems.push(`${key} must be one of ${parameter.enum.join(', ')}`);
      continue;
    }
    coerced[key] = read;
  }
  if (problems.length > 0) {
    throw new ActionError(`${definition.name}: ${problems.join(', ')}`);
  }
  return coerced;
}

export async function runAction(name: string, args: ActionArguments): Promise<ActionResult> {
  const definition = actions.get(name);
  if (!definition) {
    throw new ActionError(`no action named ${name}`);
  }
  return definition.run(coerceArguments(definition, args));
}

/** Empty the registry between unit tests. */
export function clearActionsForTests(): void {
  actions.clear();
}
