/**
 * Turning what a prompt says into the thing it means. Every action that takes a
 * layer, project, document, feed, dataset, branch or moment reads it here, so
 * one spelling rule covers them all.
 */

import { ActionError } from './registry';

export interface Named {
  id: string;
  name: string;
}

/**
 * How a list names one entry: the name alone, with the id only when another
 * entry shares that name. A model given ids copies them and gets them wrong.
 */
export function labelOf(candidate: Named, all: Named[]): string {
  const sharingTheName = all.filter((other) => other.name === candidate.name).length;
  return sharingTheName > 1 ? `${candidate.name} (${candidate.id})` : candidate.name;
}

function listNames(candidates: Named[]): string {
  return candidates.map((candidate) => candidate.name).join(', ');
}

/** enough for the kinds the actions resolve: branch, dataset, layer, project */
function plural(kind: string): string {
  return /(ch|sh|s|x|z)$/.test(kind) ? `${kind}es` : `${kind}s`;
}

function contains(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

/**
 * The one candidate a query names: an exact id, then an exact name, then a
 * unique case-insensitive part of a name. `kind` is the word the failure uses,
 * as in "no layer matches".
 */
export function resolveOne<T extends Named>(kind: string, query: string, candidates: T[]): T {
  const wanted = query.trim();
  const byId = candidates.find((candidate) => candidate.id === wanted);
  if (byId) return byId;

  const named = candidates.filter((candidate) => candidate.name === wanted);
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    throw new ActionError(`${named.length} ${plural(kind)} are named "${wanted}", so name one by id`);
  }

  const partial = wanted === '' ? [] : candidates.filter((candidate) => contains(candidate.name, wanted));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new ActionError(`"${wanted}" matches ${partial.length} ${plural(kind)}: ${listNames(partial)}`);
  }
  if (candidates.length === 0) {
    throw new ActionError(`no ${kind} matches "${wanted}", and there is no ${kind} to choose from`);
  }
  throw new ActionError(`no ${kind} matches "${wanted}". Known ${plural(kind)}: ${listNames(candidates)}`);
}

/**
 * An ISO 8601 argument as RFC 3339. `parameter` is the argument's name, so the
 * failure says which one was not a date.
 */
export function isoMoment(parameter: string, text: string): string {
  const parsed = new Date(text.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new ActionError(`${parameter} is not a date: ${text}`);
  }
  return parsed.toISOString();
}
