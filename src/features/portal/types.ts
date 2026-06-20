export type PortalItemType = 'map' | 'layer' | 'dataset' | 'story' | 'app';
export type PortalSharing = 'private' | 'org' | 'public';

export interface PortalItem {
  id: string;
  title: string;
  type: PortalItemType;
  owner: string;
  description?: string;
  tags?: string[];
  sharing: PortalSharing;
  thumbnail?: string;
  created: string;
  modified: string;
  extent?: { xmin: number; ymin: number; xmax: number; ymax: number };
  metadata?: Record<string, unknown>;
}
