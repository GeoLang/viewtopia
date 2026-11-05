import { useEffect } from 'react';
import { ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import { editingText } from '../../live/LiveUndo';
import { useAppStore } from '../../store/app';
import { useTiles3dLayerStore } from '../../store/tiles3dLayers';
import { useElementStore } from '../elements/store';
import { WALK_KEYS, leaveBimMode, lookBy, orbitAroundPick, standOnPick, stepWalk } from './bimMode';
import { useBimModeStore, type BimSession } from './store';

const MILLISECONDS_PER_SECOND = 1000;
// stalled frames otherwise move the camera one long step through a wall
const LONGEST_WALK_STEP_SECONDS = 0.1;

function bindWalkInput(session: BimSession, handler: ScreenSpaceEventHandler): () => void {
  const { viewer } = session;
  const pressedKeys = new Set<string>();
  let looking = false;
  let lastTick = performance.now();

  const onTick = () => {
    const now = performance.now();
    const seconds = Math.min((now - lastTick) / MILLISECONDS_PER_SECOND, LONGEST_WALK_STEP_SECONDS);
    lastTick = now;
    const { floorHeight } = useBimModeStore.getState();
    if (floorHeight === null) return;
    const movedFloorHeight = stepWalk(session, pressedKeys, seconds, floorHeight);
    if (movedFloorHeight !== floorHeight) useBimModeStore.setState({ floorHeight: movedFloorHeight });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.code in WALK_KEYS) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (editingText(event.target)) return;
    // toolShortcuts binds the a key to the area measure on window's bubble phase
    event.stopPropagation();
    pressedKeys.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.code);
  };
  // browsers send no keyup to a window that lost focus
  const onBlur = () => pressedKeys.clear();

  handler.setInputAction(() => {
    looking = true;
  }, ScreenSpaceEventType.LEFT_DOWN);
  handler.setInputAction(() => {
    looking = false;
  }, ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(({ startPosition, endPosition }: ScreenSpaceEventHandler.MotionEvent) => {
    if (looking) lookBy(viewer.camera, endPosition.x - startPosition.x, endPosition.y - startPosition.y);
  }, ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction(({ position }: ScreenSpaceEventHandler.PositionedEvent) => {
    standOnPick(position);
  }, ScreenSpaceEventType.LEFT_CLICK);

  viewer.clock.onTick.addEventListener(onTick);
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    if (!viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(onTick);
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

export function useBimNavigationCesium() {
  const session = useBimModeStore((state) => state.session);
  const navigation = useBimModeStore((state) => state.navigation);
  const openLayerId = useElementStore((state) => state.model?.layerId);
  const loaded = useTiles3dLayerStore((state) => state.loaded);
  // renderer and tab switches destroy the viewer without changing any other store this hook reads
  const renderer = useAppStore((state) => state.renderer);
  const activeTab = useAppStore((state) => state.activeTab);

  useEffect(() => {
    if (!session) return;
    const layerId = session.model.layerId;
    const modelGone = loaded[layerId] !== session.tileset || openLayerId !== layerId;
    if (session.viewer.isDestroyed() || modelGone) leaveBimMode();
  }, [session, openLayerId, loaded, renderer, activeTab]);

  useEffect(() => {
    if (!session || session.viewer.isDestroyed()) return;
    const { viewer } = session;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    if (navigation === 'orbit') {
      handler.setInputAction(({ position }: ScreenSpaceEventHandler.PositionedEvent) => {
        orbitAroundPick(position);
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      return () => {
        handler.destroy();
      };
    }
    const unbindWalkInput = bindWalkInput(session, handler);
    return () => {
      unbindWalkInput();
      handler.destroy();
    };
  }, [session, navigation]);
}
