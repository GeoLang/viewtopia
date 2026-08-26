/**
 * Importing this module registers every viewer action. Each domain module
 * registers its own actions when imported, so a domain is one import line here.
 */
import './view';

export { actionCatalogue, runAction, findAction, ActionError } from './registry';
export type { ActionDefinition, ActionResult, CatalogueEntry } from './registry';
