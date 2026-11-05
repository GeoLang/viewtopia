import { create } from 'zustand';
import type { Cartesian3, Cesium3DTileset, EdgeDisplayMode, Viewer } from 'cesium';
import type { ElementModel } from '../elements/store';
import type { Storey } from './storeys';

export const BIM_NAVIGATIONS = ['orbit', 'walk'] as const;
export type BimNavigation = (typeof BIM_NAVIGATIONS)[number];

export const STOREY_SCOPES = ['only', 'and_below'] as const;
export type StoreyScope = (typeof STOREY_SCOPES)[number];

export interface ViewerSettingsBeforeBim {
  near: number;
  logarithmicDepthBuffer: boolean;
  depthTestAgainstTerrain: boolean;
  enableCollisionDetection: boolean;
  minimumZoomDistance: number;
  inertiaSpin: number;
  inertiaZoom: number;
  enableRotate: boolean;
  enableZoom: boolean;
  enableTilt: boolean;
  enableLook: boolean;
  constrainedAxis: Cartesian3 | undefined;
  edgeDisplayMode: EdgeDisplayMode;
}

export interface StoreyContents {
  ids: string[];
  middleHeight: number | null;
}

export interface BimSession {
  viewer: Viewer;
  tileset: Cesium3DTileset;
  model: ElementModel;
  settingsBefore: ViewerSettingsBeforeBim;
  storeyContents: Map<string, StoreyContents>;
}

export interface StoreyView {
  storeyKey: string;
  scope: StoreyScope;
  isolated: ReadonlySet<string>;
  isolatedBefore: ReadonlySet<string> | null;
}

interface BimModeState {
  session: BimSession | null;
  navigation: BimNavigation;
  floorHeight: number | null;
  storeys: Storey[] | null;
  storeyView: StoreyView | null;
  edgesShown: boolean;
  notice: string | null;
}

export const BIM_MODE_OFF: BimModeState = {
  session: null,
  navigation: 'orbit',
  floorHeight: null,
  storeys: null,
  storeyView: null,
  edgesShown: false,
  notice: null,
};

export const useBimModeStore = create<BimModeState>(() => BIM_MODE_OFF);

export function requireBimSession(): BimSession {
  const { session } = useBimModeStore.getState();
  if (!session) throw new Error('BIM mode is off, so enter it first.');
  return session;
}

export function storeyViewShowing(
  storeyView: StoreyView | null,
  isolated: ReadonlySet<string> | null,
): StoreyView | null {
  return storeyView && storeyView.isolated === isolated ? storeyView : null;
}
