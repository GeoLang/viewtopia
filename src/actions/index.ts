/**
 * Importing this module registers every viewer action. Each domain module
 * registers its own actions when imported, so a domain is one import line here.
 */
import './camera';
import './data';
import './dataset';
import './find';
import './history';
import './layers';
import './live';
import './marker';
import './project';
import './scenario';
import './scene';
import './terrain';
import './tileset';
import './view';

export { actionCatalogue, runAction, findAction, ActionError } from './registry';
export type { ActionDefinition, ActionResult, CatalogueEntry } from './registry';
