/**
 * Ontology — typed object/relationship schema definition and enforcement.
 *
 * Palantir Gotham's core differentiator: every entity and link has a type
 * defined by a schema. The ontology defines what properties each type can
 * have, what relationships are valid between types, and data validation rules.
 */

/**
 * @typedef {Object} PropertyDef
 * @property {string} name
 * @property {'string'|'number'|'boolean'|'date'|'enum'|'geo'} type
 * @property {boolean} required
 * @property {string} [description]
 * @property {string[]} [enumValues] - For enum type
 * @property {*} [defaultValue]
 */

/**
 * @typedef {Object} EntityTypeDef
 * @property {string} id
 * @property {string} label - Display name
 * @property {string} icon - Emoji or icon code
 * @property {string} color - Default color for this type
 * @property {PropertyDef[]} properties
 * @property {string[]} validLinkTypes - Link type IDs this entity can participate in
 */

/**
 * @typedef {Object} LinkTypeDef
 * @property {string} id
 * @property {string} label
 * @property {string} color
 * @property {boolean} directed - Is this a directed relationship?
 * @property {string[]} sourceTypes - Allowed source entity type IDs
 * @property {string[]} targetTypes - Allowed target entity type IDs
 * @property {PropertyDef[]} properties
 */

/**
 * @typedef {Object} Ontology
 * @property {string} name
 * @property {string} version
 * @property {Map<string, EntityTypeDef>} entityTypes
 * @property {Map<string, LinkTypeDef>} linkTypes
 */

/** @type {Ontology} */
let ontology = createDefaultOntology();

/**
 * Create the default ontology with common intelligence entity/link types.
 */
function createDefaultOntology() {
  const entityTypes = new Map();
  const linkTypes = new Map();

  // Default entity types
  entityTypes.set('person', {
    id: 'person', label: 'Person', icon: '👤', color: '#60a5fa',
    properties: [
      { name: 'firstName', type: 'string', required: false },
      { name: 'lastName', type: 'string', required: false },
      { name: 'dateOfBirth', type: 'date', required: false },
      { name: 'nationality', type: 'string', required: false },
      { name: 'gender', type: 'enum', required: false, enumValues: ['male', 'female', 'other', 'unknown'] },
      { name: 'idNumber', type: 'string', required: false, description: 'Government ID or passport number' },
    ],
    validLinkTypes: ['communication', 'colocation', 'financial', 'organizational', 'familial', 'travel', 'inferred'],
  });

  entityTypes.set('vehicle', {
    id: 'vehicle', label: 'Vehicle', icon: '🚗', color: '#f59e0b',
    properties: [
      { name: 'licensePlate', type: 'string', required: false },
      { name: 'make', type: 'string', required: false },
      { name: 'model', type: 'string', required: false },
      { name: 'year', type: 'number', required: false },
      { name: 'color', type: 'string', required: false },
      { name: 'vin', type: 'string', required: false },
    ],
    validLinkTypes: ['ownership', 'colocation', 'travel', 'inferred'],
  });

  entityTypes.set('device', {
    id: 'device', label: 'Device', icon: '📱', color: '#a78bfa',
    properties: [
      { name: 'imei', type: 'string', required: false },
      { name: 'imsi', type: 'string', required: false },
      { name: 'msisdn', type: 'string', required: false, description: 'Phone number' },
      { name: 'deviceType', type: 'enum', required: false, enumValues: ['phone', 'tablet', 'laptop', 'radio', 'tracker', 'other'] },
      { name: 'carrier', type: 'string', required: false },
    ],
    validLinkTypes: ['communication', 'ownership', 'colocation', 'inferred'],
  });

  entityTypes.set('organization', {
    id: 'organization', label: 'Organization', icon: '🏢', color: '#10b981',
    properties: [
      { name: 'orgType', type: 'enum', required: false, enumValues: ['company', 'government', 'ngo', 'military', 'criminal', 'other'] },
      { name: 'country', type: 'string', required: false },
      { name: 'sector', type: 'string', required: false },
    ],
    validLinkTypes: ['organizational', 'financial', 'inferred'],
  });

  entityTypes.set('location', {
    id: 'location', label: 'Location', icon: '📍', color: '#ef4444',
    properties: [
      { name: 'address', type: 'string', required: false },
      { name: 'locationType', type: 'enum', required: false, enumValues: ['residence', 'workplace', 'poi', 'infrastructure', 'other'] },
      { name: 'coordinates', type: 'geo', required: false },
    ],
    validLinkTypes: ['colocation', 'ownership', 'travel', 'inferred'],
  });

  entityTypes.set('event', {
    id: 'event', label: 'Event', icon: '📅', color: '#ec4899',
    properties: [
      { name: 'eventType', type: 'enum', required: false, enumValues: ['meeting', 'incident', 'transaction', 'communication', 'travel', 'other'] },
      { name: 'startTime', type: 'date', required: false },
      { name: 'endTime', type: 'date', required: false },
      { name: 'significance', type: 'enum', required: false, enumValues: ['low', 'medium', 'high', 'critical'] },
    ],
    validLinkTypes: ['participation', 'inferred'],
  });

  entityTypes.set('document', {
    id: 'document', label: 'Document', icon: '📄', color: '#94a3b8',
    properties: [
      { name: 'title', type: 'string', required: false },
      { name: 'docType', type: 'enum', required: false, enumValues: ['report', 'intercept', 'image', 'video', 'audio', 'other'] },
      { name: 'classification', type: 'string', required: false },
      { name: 'dateProduced', type: 'date', required: false },
    ],
    validLinkTypes: ['reference', 'inferred'],
  });

  entityTypes.set('account', {
    id: 'account', label: 'Account', icon: '💳', color: '#f97316',
    properties: [
      { name: 'accountType', type: 'enum', required: false, enumValues: ['bank', 'email', 'social', 'crypto', 'other'] },
      { name: 'provider', type: 'string', required: false },
      { name: 'accountId', type: 'string', required: false },
    ],
    validLinkTypes: ['ownership', 'financial', 'communication', 'inferred'],
  });

  // Default link types
  linkTypes.set('communication', {
    id: 'communication', label: 'Communication', color: '#60a5fa', directed: true,
    sourceTypes: ['person', 'device', 'account'],
    targetTypes: ['person', 'device', 'account'],
    properties: [
      { name: 'channel', type: 'enum', required: false, enumValues: ['call', 'sms', 'email', 'chat', 'radio', 'other'] },
      { name: 'duration', type: 'number', required: false, description: 'Duration in seconds' },
    ],
  });

  linkTypes.set('colocation', {
    id: 'colocation', label: 'Colocation', color: '#f59e0b', directed: false,
    sourceTypes: ['person', 'vehicle', 'device', 'location'],
    targetTypes: ['person', 'vehicle', 'device', 'location'],
    properties: [
      { name: 'distanceM', type: 'number', required: false },
      { name: 'durationMs', type: 'number', required: false },
    ],
  });

  linkTypes.set('financial', {
    id: 'financial', label: 'Financial', color: '#10b981', directed: true,
    sourceTypes: ['person', 'organization', 'account'],
    targetTypes: ['person', 'organization', 'account'],
    properties: [
      { name: 'amount', type: 'number', required: false },
      { name: 'currency', type: 'string', required: false },
      { name: 'transactionType', type: 'enum', required: false, enumValues: ['transfer', 'payment', 'deposit', 'withdrawal', 'other'] },
    ],
  });

  linkTypes.set('organizational', {
    id: 'organizational', label: 'Organizational', color: '#a78bfa', directed: false,
    sourceTypes: ['person', 'organization'],
    targetTypes: ['person', 'organization'],
    properties: [
      { name: 'role', type: 'string', required: false },
      { name: 'rank', type: 'string', required: false },
    ],
  });

  linkTypes.set('ownership', {
    id: 'ownership', label: 'Ownership', color: '#ec4899', directed: true,
    sourceTypes: ['person', 'organization'],
    targetTypes: ['vehicle', 'device', 'location', 'account', 'document'],
    properties: [],
  });

  linkTypes.set('familial', {
    id: 'familial', label: 'Familial', color: '#ef4444', directed: false,
    sourceTypes: ['person'],
    targetTypes: ['person'],
    properties: [
      { name: 'relationship', type: 'enum', required: false, enumValues: ['parent', 'child', 'sibling', 'spouse', 'relative'] },
    ],
  });

  linkTypes.set('travel', {
    id: 'travel', label: 'Travel', color: '#06b6d4', directed: true,
    sourceTypes: ['person', 'vehicle'],
    targetTypes: ['location'],
    properties: [
      { name: 'mode', type: 'enum', required: false, enumValues: ['air', 'road', 'rail', 'sea', 'foot', 'other'] },
    ],
  });

  linkTypes.set('participation', {
    id: 'participation', label: 'Participation', color: '#8b5cf6', directed: true,
    sourceTypes: ['person', 'organization', 'vehicle'],
    targetTypes: ['event'],
    properties: [
      { name: 'role', type: 'string', required: false, description: 'Role in the event' },
    ],
  });

  linkTypes.set('reference', {
    id: 'reference', label: 'Reference', color: '#94a3b8', directed: true,
    sourceTypes: ['person', 'organization', 'event', 'location', 'vehicle', 'device', 'account'],
    targetTypes: ['document'],
    properties: [
      { name: 'relevance', type: 'enum', required: false, enumValues: ['primary', 'secondary', 'contextual'] },
    ],
  });

  linkTypes.set('inferred', {
    id: 'inferred', label: 'Inferred', color: '#475569', directed: false,
    sourceTypes: ['person', 'vehicle', 'device', 'organization', 'location', 'event', 'document', 'account'],
    targetTypes: ['person', 'vehicle', 'device', 'organization', 'location', 'event', 'document', 'account'],
    properties: [
      { name: 'confidence', type: 'number', required: false, description: '0.0 to 1.0' },
      { name: 'method', type: 'string', required: false, description: 'How inference was made' },
    ],
  });

  return { name: 'Default Intelligence Ontology', version: '1.0', entityTypes, linkTypes };
}

// --- Public API ---

export function getOntology() { return ontology; }

export function getEntityTypes() { return [...ontology.entityTypes.values()]; }

export function getEntityType(id) { return ontology.entityTypes.get(id); }

export function getLinkTypes() { return [...ontology.linkTypes.values()]; }

export function getLinkType(id) { return ontology.linkTypes.get(id); }

/**
 * Add a custom entity type.
 */
export function addEntityType(def) {
  if (ontology.entityTypes.has(def.id)) throw new Error(`Entity type "${def.id}" already exists`);
  ontology.entityTypes.set(def.id, { ...def, properties: def.properties || [], validLinkTypes: def.validLinkTypes || ['inferred'] });
}

/**
 * Add a custom link type.
 */
export function addLinkType(def) {
  if (ontology.linkTypes.has(def.id)) throw new Error(`Link type "${def.id}" already exists`);
  ontology.linkTypes.set(def.id, { ...def, properties: def.properties || [] });
}

/**
 * Remove an entity type.
 */
export function removeEntityType(id) {
  if (['person', 'vehicle', 'device'].includes(id)) throw new Error('Cannot remove built-in type');
  ontology.entityTypes.delete(id);
}

/**
 * Remove a link type.
 */
export function removeLinkType(id) {
  if (['inferred'].includes(id)) throw new Error('Cannot remove built-in link type');
  ontology.linkTypes.delete(id);
}

/**
 * Validate an entity against its ontology type.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEntity(entity) {
  const errors = [];
  const typeDef = ontology.entityTypes.get(entity.kind);
  if (!typeDef) {
    errors.push(`Unknown entity type: "${entity.kind}"`);
    return { valid: false, errors };
  }

  // Check required properties
  for (const prop of typeDef.properties) {
    if (prop.required && (!entity.properties || entity.properties[prop.name] == null)) {
      errors.push(`Missing required property: ${prop.name}`);
    }
  }

  // Check property types
  if (entity.properties) {
    for (const [key, value] of Object.entries(entity.properties)) {
      const propDef = typeDef.properties.find(p => p.name === key);
      if (!propDef) continue; // Allow extra properties

      if (propDef.type === 'enum' && propDef.enumValues && !propDef.enumValues.includes(value)) {
        errors.push(`Invalid enum value for ${key}: "${value}" (allowed: ${propDef.enumValues.join(', ')})`);
      }
      if (propDef.type === 'number' && typeof value !== 'number') {
        errors.push(`Property ${key} should be a number, got ${typeof value}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a link against its ontology type.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLink(link, sourceEntity, targetEntity) {
  const errors = [];
  const typeDef = ontology.linkTypes.get(link.kind);
  if (!typeDef) {
    errors.push(`Unknown link type: "${link.kind}"`);
    return { valid: false, errors };
  }

  // Check source type is allowed
  if (sourceEntity && !typeDef.sourceTypes.includes(sourceEntity.kind)) {
    errors.push(`Source type "${sourceEntity.kind}" not allowed for link type "${link.kind}" (allowed: ${typeDef.sourceTypes.join(', ')})`);
  }

  // Check target type is allowed
  if (targetEntity && !typeDef.targetTypes.includes(targetEntity.kind)) {
    errors.push(`Target type "${targetEntity.kind}" not allowed for link type "${link.kind}" (allowed: ${typeDef.targetTypes.join(', ')})`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get allowed link types between two entity types.
 */
export function getAllowedLinkTypes(sourceKind, targetKind) {
  const allowed = [];
  for (const [id, def] of ontology.linkTypes) {
    if (def.sourceTypes.includes(sourceKind) && def.targetTypes.includes(targetKind)) {
      allowed.push(def);
    }
    // Also check reverse for undirected links
    if (!def.directed && def.sourceTypes.includes(targetKind) && def.targetTypes.includes(sourceKind)) {
      if (!allowed.find(a => a.id === id)) allowed.push(def);
    }
  }
  return allowed;
}

/**
 * Get property definitions for an entity type.
 */
export function getPropertyDefs(entityTypeId) {
  const typeDef = ontology.entityTypes.get(entityTypeId);
  return typeDef ? typeDef.properties : [];
}

/**
 * Export ontology as JSON for persistence.
 */
export function exportOntology() {
  return {
    name: ontology.name,
    version: ontology.version,
    entityTypes: Object.fromEntries(ontology.entityTypes),
    linkTypes: Object.fromEntries(ontology.linkTypes),
  };
}

/**
 * Import ontology from JSON.
 */
export function importOntology(json) {
  ontology = {
    name: json.name || 'Imported Ontology',
    version: json.version || '1.0',
    entityTypes: new Map(Object.entries(json.entityTypes || {})),
    linkTypes: new Map(Object.entries(json.linkTypes || {})),
  };
}

/**
 * Reset to default ontology.
 */
export function resetOntology() {
  ontology = createDefaultOntology();
}
