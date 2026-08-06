import { create } from 'zustand';
import type { VirtualField } from './expressions';

/**
 * Virtual fields are stored expressions, never written into the geojson: the
 * table evaluates them for display and the stats and chart read them like any
 * other column. Keyed by data source name, so they outlive closing the panel.
 */
interface VirtualFieldState {
  fields: Record<string, VirtualField[]>;
  addField: (layerKey: string, field: VirtualField) => void;
  removeField: (layerKey: string, name: string) => void;
}

export const useVirtualFieldStore = create<VirtualFieldState>((set) => ({
  fields: {},
  addField: (layerKey, field) =>
    set((s) => ({
      fields: {
        ...s.fields,
        [layerKey]: [...(s.fields[layerKey] ?? []).filter((f) => f.name !== field.name), field],
      },
    })),
  removeField: (layerKey, name) =>
    set((s) => ({
      fields: {
        ...s.fields,
        [layerKey]: (s.fields[layerKey] ?? []).filter((f) => f.name !== name),
      },
    })),
}));
