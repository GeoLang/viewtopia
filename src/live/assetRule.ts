/**
 * The one rule a live document holds for colouring its assets. The share dialog
 * writes it from its form and the chat writes it from a prompt.
 */

import { useLiveStore } from './liveStore';
import { ASSET_RULE_ID, documentKey, type AssetRule } from './types';

/** The colour an asset with no reading in range gets until the rule says otherwise. */
export const FALLBACK_ASSET_COLOR = '#95a5a6';

/** The colour an asset agora has stopped hearing from gets. */
export const FALLBACK_OFFLINE_COLOR = '#7f8c8d';

/** Put the rule in the document, where every member's map reads it. */
export function saveAssetRule(rule: AssetRule): void {
  useLiveStore.getState().sendOperation(documentKey('assets', ASSET_RULE_ID), rule);
}
