import { useMemo } from 'react';
import { create } from 'zustand';
import { fieldLabel, type DatasetField } from '../lib/datasetSchema';

interface DatasetSchemaState {
  fieldsByDataset: Record<string, DatasetField[]>;
  setDatasetFields: (datasetId: string, fields: DatasetField[]) => void;
  forgetDataset: (datasetId: string) => void;
}

export const useDatasetSchemaStore = create<DatasetSchemaState>((set) => ({
  fieldsByDataset: {},
  setDatasetFields: (datasetId, fields) =>
    set((s) => ({ fieldsByDataset: { ...s.fieldsByDataset, [datasetId]: fields } })),
  forgetDataset: (datasetId) =>
    set((s) => ({
      fieldsByDataset: Object.fromEntries(
        Object.entries(s.fieldsByDataset).filter(([id]) => id !== datasetId),
      ),
    })),
}));

/**
 * Aliases are looked up by column name across every loaded dataset, because the
 * table, the picker and the symbology selects all work off property keys and
 * none of them carries a dataset id.
 */
export function useColumnLabels(): {
  columnLabel: (column: string) => string;
  columnOptions: (columns: string[]) => { value: string; label: string }[];
} {
  const fieldsByDataset = useDatasetSchemaStore((s) => s.fieldsByDataset);
  return useMemo(() => {
    const labels = new Map<string, string>();
    for (const fields of Object.values(fieldsByDataset)) {
      for (const field of fields) {
        if (!labels.has(field.name)) labels.set(field.name, fieldLabel(field));
      }
    }
    const columnLabel = (column: string) => labels.get(column) ?? column;
    return {
      columnLabel,
      columnOptions: (columns: string[]) =>
        columns.map((value) => ({ value, label: columnLabel(value) })),
    };
  }, [fieldsByDataset]);
}
