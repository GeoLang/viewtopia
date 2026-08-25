import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, Stack, Group, Button, Select, ScrollArea, Badge } from '@mantine/core';
import {
  IconDatabaseEdit,
  IconMap,
  IconRefresh,
  IconCloudUpload,
  IconPencil,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore, drawnFeatureGeometry, type DrawMode } from '../../store/draw';
import {
  branchLayerId,
  fetchBranches,
  fetchBranchFeature,
  fetchBranchFeatures,
  fetchDatasets,
  type BranchFeature,
  type NamedRecord,
} from '../../lib/branchFeatures';
import { addGeoJsonLayer } from '../../lib/mapLayers';
import { getSyncState, onSyncStateChange, queueFeatureUpdate, syncNow } from '../../offline/sync';
import type { FeatureVersion } from '../../offline/conflicts';
import {
  PropertyRows,
  rowsFromProperties,
  rowsToTypedProperties,
  type PropertyRow,
} from './PropertyRows';

const PANEL_COLOR = 'teal';
const LAYER_STYLE = { color: '#20c997', opacity: 0.5, lineWidth: 2, filled: true, stroked: true };

function featureLabel(feature: BranchFeature): string {
  const named = feature.properties.name ?? feature.properties.apn ?? feature.properties.address;
  return typeof named === 'string' && named ? named : feature.id.slice(0, 8);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asVersion(feature: BranchFeature): FeatureVersion {
  return {
    id: feature.id,
    properties: feature.properties,
    geometry: feature.geometry ?? undefined,
  };
}

function redrawModeFor(geometry: GeoJSON.Geometry): DrawMode {
  switch (geometry.type) {
    case 'Point':
    case 'MultiPoint':
      return 'point';
    case 'LineString':
    case 'MultiLineString':
      return 'line';
    case 'GeometryCollection': {
      const first = geometry.geometries[0];
      return first ? redrawModeFor(first) : 'polygon';
    }
    default:
      return 'polygon';
  }
}

/** A single shape replacing a multi geometry keeps the multi type. */
function matchGeometryFamily(
  drawn: GeoJSON.Geometry,
  previous: GeoJSON.Geometry,
): GeoJSON.Geometry {
  if (previous.type === 'GeometryCollection') {
    return { type: 'GeometryCollection', geometries: [drawn] };
  }
  if (previous.type === 'MultiPoint' && drawn.type === 'Point') {
    return { type: 'MultiPoint', coordinates: [drawn.coordinates] };
  }
  if (previous.type === 'MultiLineString' && drawn.type === 'LineString') {
    return { type: 'MultiLineString', coordinates: [drawn.coordinates] };
  }
  if (previous.type === 'MultiPolygon' && drawn.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [drawn.coordinates] };
  }
  return drawn;
}

export function DatasetEditorPanel({ onClose }: { onClose: () => void }) {
  const [datasets, setDatasets] = useState<NamedRecord[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [branches, setBranches] = useState<NamedRecord[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [features, setFeatures] = useState<BranchFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<PropertyRow[]>([]);
  /** the selected feature as the branch held it, the merge's ancestor */
  const [openedAs, setOpenedAs] = useState<FeatureVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [syncStatus, setSyncStatus] = useState('idle');
  /** true while the Draw machinery is capturing a replacement geometry */
  const [redrawing, setRedrawing] = useState(false);
  /** drawn-features count when the capture started */
  const redrawBaseline = useRef(0);
  /** unmount must clear the draw mode only when this panel set it */
  const redrawingRef = useRef(false);

  const selected = features.find((f) => f.id === selectedId) ?? null;

  const stopRedraw = useCallback(() => {
    if (!redrawingRef.current) return;
    redrawingRef.current = false;
    useDrawStore.getState().setMode(null);
    setRedrawing(false);
  }, []);

  useEffect(() => stopRedraw, [stopRedraw]);

  useEffect(() => onSyncStateChange((state) => {
    setPending(state.pendingCount);
    setSyncStatus(state.status);
  }), []);

  useEffect(() => {
    fetchDatasets().then(setDatasets).catch((err) => setError(message(err)));
  }, []);

  useEffect(() => {
    if (!datasetId) return;
    setBranchId(null);
    fetchBranches(datasetId)
      .then((found) => {
        setBranches(found);
        setBranchId(found.find((b) => b.name === 'main')?.id ?? found[0]?.id ?? null);
      })
      .catch((err) => setError(message(err)));
  }, [datasetId]);

  const loadFeatures = useCallback(async (branch: string) => {
    stopRedraw();
    setError(null);
    setSelectedId(null);
    setRows([]);
    setOpenedAs(null);
    try {
      setFeatures(await fetchBranchFeatures(branch));
    } catch (err) {
      setFeatures([]);
      setError(message(err));
    }
  }, [stopRedraw]);

  useEffect(() => {
    if (branchId) void loadFeatures(branchId);
  }, [branchId, loadFeatures]);

  function select(feature: BranchFeature) {
    stopRedraw();
    setSelectedId(feature.id);
    setRows(rowsFromProperties(feature.properties));
    setOpenedAs(asVersion(feature));
  }

  function edit(next: PropertyRow[]) {
    setRows(next);
    if (!branchId || !selected) return;
    const properties = rowsToTypedProperties(next, selected.properties);
    setFeatures(features.map((f) => (f.id === selected.id ? { ...f, properties } : f)));
    void queueFeatureUpdate(
      branchId,
      { ...asVersion(selected), properties },
      openedAs,
    );
  }

  function startRedraw() {
    if (!selected?.geometry) return;
    redrawBaseline.current = useDrawStore.getState().features.length;
    redrawingRef.current = true;
    useDrawStore.getState().setMode(redrawModeFor(selected.geometry));
    setRedrawing(true);
  }

  const applyRedraw = useCallback(
    (drawn: GeoJSON.Geometry) => {
      if (!branchId || !selected?.geometry) return;
      const geometry = matchGeometryFamily(drawn, selected.geometry);
      setFeatures((current) =>
        current.map((f) => (f.id === selected.id ? { ...f, geometry } : f)),
      );
      void queueFeatureUpdate(branchId, { ...asVersion(selected), geometry }, openedAs);
    },
    [branchId, selected, openedAs],
  );

  // take the shape the Draw machinery finishes as the replacement geometry
  useEffect(() => {
    if (!redrawing) return;
    const unsubscribe = useDrawStore.subscribe((state) => {
      if (state.features.length <= redrawBaseline.current) return;
      const drawn = state.features[state.features.length - 1];
      queueMicrotask(() => {
        useDrawStore.getState().removeFeature(drawn.id);
        stopRedraw();
        applyRedraw(drawnFeatureGeometry(drawn));
      });
    });
    return unsubscribe;
  }, [redrawing, applyRedraw, stopRedraw]);

  /**
   * Commit the queue, then take the branch's answer as the new ancestor, or the
   * next edit would conflict with the value this browser just wrote.
   */
  async function commit() {
    await syncNow();
    if (!branchId || !selected || getSyncState().conflicts.length > 0) return;
    const fresh = await fetchBranchFeature(branchId, selected.id);
    if (!fresh) return;
    setFeatures((current) => current.map((f) => (f.id === fresh.id ? fresh : f)));
    setRows(rowsFromProperties(fresh.properties));
    setOpenedAs(asVersion(fresh));
  }

  function showOnMap() {
    if (!branchId) return;
    const drawable = features.filter((f) => f.geometry);
    if (drawable.length === 0) {
      setError('no feature on this branch has a geometry ViewTopia can draw');
      return;
    }
    addGeoJsonLayer(
      branchLayerId(branchId),
      {
        type: 'FeatureCollection',
        features: drawable.map((f) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties,
        })),
      },
      LAYER_STYLE,
    );
  }

  return (
    <PanelCard width={340}>
      <PanelHeader
        icon={<IconDatabaseEdit size={16} />}
        title="Dataset Editor"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color={PANEL_COLOR}>
            {features.length}
          </Badge>
        }
      />

      <Stack gap="xs">
        <Select
          size="xs"
          label="Dataset"
          placeholder={datasets.length ? 'Pick a dataset' : 'No datasets available'}
          data={datasets.map((d) => ({ value: d.id, label: d.name }))}
          value={datasetId}
          onChange={setDatasetId}
        />
        <Select
          size="xs"
          label="Branch"
          placeholder="Pick a branch"
          data={branches.map((b) => ({ value: b.id, label: b.name }))}
          value={branchId}
          onChange={setBranchId}
          disabled={branches.length === 0}
        />

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}

        {branchId && features.length === 0 && !error && (
          <Text size="xs" c="dimmed">
            This branch has no features.
          </Text>
        )}

        {features.length > 0 && (
          <ScrollArea.Autosize mah={140}>
            <Stack gap={2}>
              {features.map((f) => (
                <Group
                  key={f.id}
                  data-testid="dataset-editor-feature"
                  px={6}
                  py={2}
                  style={{
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: f.id === selectedId ? 'var(--mantine-color-dark-6)' : 'transparent',
                  }}
                  onClick={() => select(f)}
                >
                  <Text size="xs" c={f.id === selectedId ? PANEL_COLOR : 'gray.4'}>
                    {featureLabel(f)}
                  </Text>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {selected && (
          <>
            <Text size="xs" c="dimmed">
              Properties
            </Text>
            <ScrollArea.Autosize mah={200}>
              <PropertyRows rows={rows} onChange={edit} color={PANEL_COLOR} />
            </ScrollArea.Autosize>
            {redrawing ? (
              <>
                <Text size="xs" c="green">
                  Draw the replacement on the map. A line or polygon finishes on
                  double-click.
                </Text>
                <Button size="xs" variant="subtle" color="gray" onClick={stopRedraw}>
                  Cancel redraw
                </Button>
              </>
            ) : (
              <Button
                size="xs"
                variant="light"
                color={PANEL_COLOR}
                data-testid="dataset-editor-redraw"
                leftSection={<IconPencil size={12} />}
                disabled={!selected.geometry}
                onClick={startRedraw}
              >
                Redraw geometry
              </Button>
            )}
          </>
        )}

        <Group gap={4} grow>
          <Button
            size="xs"
            variant="light"
            color={PANEL_COLOR}
            leftSection={<IconMap size={12} />}
            disabled={features.length === 0}
            onClick={showOnMap}
          >
            Show on map
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={12} />}
            disabled={!branchId}
            onClick={() => branchId && void loadFeatures(branchId)}
          >
            Reload
          </Button>
        </Group>

        <Button
          size="xs"
          variant="light"
          color={PANEL_COLOR}
          data-testid="dataset-editor-commit"
          leftSection={<IconCloudUpload size={12} />}
          disabled={pending === 0}
          onClick={() => void commit()}
        >
          {pending === 0 ? `Nothing to commit (${syncStatus})` : `Commit ${pending} edit(s)`}
        </Button>
      </Stack>
    </PanelCard>
  );
}
