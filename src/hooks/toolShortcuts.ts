import { useAppStore } from '../store/app';
import { useDrawStore, type DrawMode } from '../store/draw';
import { useMeasureStore, type MeasureMode } from '../store/measure';

/** one-letter keys per tool mode; panels read these for their tooltip hints */
export const DRAW_TOOL_KEYS: Record<NonNullable<DrawMode>, string> = {
  point: 'p',
  line: 'l',
  polygon: 'g',
  circle: 'c',
  rectangle: 'r',
};

export const MEASURE_TOOL_KEYS: Partial<Record<NonNullable<MeasureMode>, string>> = {
  distance: 'm',
  area: 'a',
};

function activateDrawMode(mode: NonNullable<DrawMode>) {
  const app = useAppStore.getState();
  const draw = useDrawStore.getState();
  if (app.activePanel === 'draw' && draw.mode === mode) {
    draw.setMode(null);
    return;
  }
  app.setActivePanel('draw');
  draw.setMode(mode);
}

function activateMeasureMode(mode: NonNullable<MeasureMode>) {
  const app = useAppStore.getState();
  const measure = useMeasureStore.getState();
  if (app.activePanel === 'measure' && measure.mode === mode) {
    measure.setMode(null);
    return;
  }
  app.setActivePanel('measure');
  measure.setMode(mode);
}

export const TOOL_SHORTCUTS: Record<string, () => void> = {};
for (const [mode, key] of Object.entries(DRAW_TOOL_KEYS)) {
  TOOL_SHORTCUTS[key] = () => activateDrawMode(mode as NonNullable<DrawMode>);
}
for (const [mode, key] of Object.entries(MEASURE_TOOL_KEYS)) {
  TOOL_SHORTCUTS[key] = () => activateMeasureMode(mode as NonNullable<MeasureMode>);
}
