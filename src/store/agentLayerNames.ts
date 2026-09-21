/** Every renderer names an agent layer's source `agent-layer-<store id>`. */
export const AGENT_LAYER_SOURCE_PREFIX = 'agent-layer-';

/** A result drawn again replaces its own earlier layer, so the id is the file alone. */
export const specLayerId = (file: string): string => `spec-${file}`;
