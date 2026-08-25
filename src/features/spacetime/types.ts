/** Core space-time intelligence types (TypeScript port of models.js) */

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  aliases: string[];
  color: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type EntityKind =
  | 'person'
  | 'vehicle'
  | 'device'
  | 'organization'
  | 'location'
  | 'event'
  | 'document'
  | 'account';

export interface SpaceTimeEvent {
  id: string;
  entityId: string;
  timestamp: number;
  lng: number;
  lat: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  properties?: Record<string, unknown>;
}

export interface Track {
  id: string;
  entityId: string;
  /** sorted by timestamp; the window and playhead lookups binary-search it */
  events: SpaceTimeEvent[];
}

export interface Link {
  id: string;
  sourceId: string;
  targetId: string;
  kind: LinkKind;
  timestamp?: number;
  confidence?: number;
  evidence?: string;
  properties?: Record<string, unknown>;
}

export type LinkKind =
  | 'communication'
  | 'colocation'
  | 'financial'
  | 'organizational'
  | 'ownership'
  | 'familial'
  | 'travel'
  | 'participation'
  | 'reference'
  | 'inferred';

export interface TimeRange {
  min: number;
  max: number;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'circle' | 'polygon';
  center?: [number, number];
  radius?: number;
  points?: [number, number][];
  active: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  entityId: string;
  timestamp: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface Case {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'review' | 'closed' | 'archived';
  analyst: string;
  entityIds: string[];
  linkIds: string[];
  notes: CaseNote[];
  tags: string[];
  phases: CasePhase[];
  classification?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CaseNote {
  id: string;
  text: string;
  author: string;
  timestamp: number;
}

export interface CasePhase {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'complete';
  notes?: string;
}
