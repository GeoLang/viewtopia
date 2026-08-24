import { useEffect, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Button,
  Select,
  SegmentedControl,
  ColorSwatch,
  Slider,
  Badge,
  Tooltip,
} from '@mantine/core';
import { IconPencil, IconCloudUpload } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useDrawStore, drawnFeatureGeometry, type DrawMode, type DrawnFeature } from '../../store/draw';
import { DRAW_TOOL_KEYS } from '../../hooks/toolShortcuts';
import {
  commitFeatureInserts,
  fetchBranches,
  fetchDatasets,
  type NamedRecord,
} from '../../lib/branchFeatures';

const COLORS = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#f87171'];

/** Circle keeps its radius as a property, the geometry is the center point. */
function savedProperties(f: DrawnFeature): Record<string, unknown> {
  return {
    ...(f.properties ?? {}),
    ...(f.type === 'Circle' && f.radius != null ? { _radius_m: String(f.radius) } : {}),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const modeLabel = (mode: NonNullable<DrawMode>, label: string) => ({
  value: mode,
  label: (
    <Tooltip label={`Shortcut: ${DRAW_TOOL_KEYS[mode].toUpperCase()}`} openDelay={300}>
      <span>{label}</span>
    </Tooltip>
  ),
});

export function DrawPanel({ onClose }: { onClose: () => void }) {
  const mode = useDrawStore((s) => s.mode);
  const color = useDrawStore((s) => s.color);
  const lineWidth = useDrawStore((s) => s.lineWidth);
  const features = useDrawStore((s) => s.features);
  const pending = useDrawStore((s) => s.pending);
  const setMode = useDrawStore((s) => s.setMode);
  const setColor = useDrawStore((s) => s.setColor);
  const setLineWidth = useDrawStore((s) => s.setLineWidth);
  const clearAll = useDrawStore((s) => s.clearAll);
  const cancelPending = useDrawStore((s) => s.cancelPending);
  const removeFeature = useDrawStore((s) => s.removeFeature);

  const [saveOpen, setSaveOpen] = useState(false);
  const [datasets, setDatasets] = useState<NamedRecord[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [branches, setBranches] = useState<NamedRecord[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!saveOpen) return;
    fetchDatasets().then(setDatasets).catch((err) => setSaveError(errorMessage(err)));
  }, [saveOpen]);

  useEffect(() => {
    if (!datasetId) return;
    setBranchId(null);
    fetchBranches(datasetId)
      .then((found) => {
        setBranches(found);
        setBranchId(found.find((b) => b.name === 'main')?.id ?? found[0]?.id ?? null);
      })
      .catch((err) => setSaveError(errorMessage(err)));
  }, [datasetId]);

  async function saveToDataset() {
    if (!branchId || features.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const inserts = features.map((f) => ({
        id: f.id,
        properties: savedProperties(f),
        geometry: drawnFeatureGeometry(f),
      }));
      await commitFeatureInserts(branchId, inserts, `add ${inserts.length} drawn shape(s)`);
      for (const insert of inserts) removeFeature(insert.id);
      setSaveNotice(`${inserts.length} shape(s) committed`);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const activateMode = (m: DrawMode) => {
    if (mode === m) {
      setMode(null);
    } else {
      setMode(m);
    }
  };

  return (
    <PanelCard width={260}>
      <PanelHeader
        icon={<IconPencil size={16} />}
        title="Draw"
        onClose={onClose}
        badge={
          features.length > 0 && (
            <Badge size="xs" variant="light" color="violet">
              {features.length}
            </Badge>
          )
        }
      />

      <Stack gap="xs">
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode === 'point' || mode === 'line' || mode === 'polygon' ? mode : ''}
          onChange={(v) => v && activateMode(v as DrawMode)}
          data={[
            modeLabel('point', 'Point'),
            modeLabel('line', 'Line'),
            modeLabel('polygon', 'Polygon'),
          ]}
        />
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode === 'circle' || mode === 'rectangle' ? mode : ''}
          onChange={(v) => v && activateMode(v as DrawMode)}
          data={[
            modeLabel('circle', 'Circle'),
            modeLabel('rectangle', 'Rectangle'),
          ]}
        />

        <Text size="xs" c="dimmed">Color</Text>
        <Group gap={6}>
          {COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              size={20}
              onClick={() => setColor(c)}
              style={{
                cursor: 'pointer',
                border: c === color ? '2px solid white' : '2px solid transparent',
              }}
            />
          ))}
        </Group>

        <Text size="xs" c="dimmed">Line Width: {lineWidth}px</Text>
        <Slider
          size="xs"
          min={1}
          max={8}
          value={lineWidth}
          onChange={setLineWidth}
          color="violet"
        />

        {mode && (
          <Text size="xs" c="green" ta="center" py="xs">
            {mode === 'point' && 'Click the map to place a point.'}
            {mode === 'line' && `Click to add vertices (${pending.length} pts). Double-click to finish.`}
            {mode === 'polygon' && `Click to add vertices (${pending.length} pts). Double-click to finish.`}
            {mode === 'circle' && (pending.length === 0 ? 'Click center, then click edge.' : 'Click to set radius.')}
            {mode === 'rectangle' && (pending.length === 0 ? 'Click first corner.' : 'Click opposite corner.')}
          </Text>
        )}

        {!mode && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            Select a shape above, then click on the map to draw.
          </Text>
        )}

        {pending.length > 0 && (
          <Button size="xs" variant="subtle" color="gray" onClick={cancelPending} fullWidth>
            Cancel Current
          </Button>
        )}

        <Button
          size="xs"
          variant="light"
          color="red"
          onClick={clearAll}
          disabled={features.length === 0}
          fullWidth
        >
          Clear All ({features.length})
        </Button>

        {!saveOpen && (
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconCloudUpload size={12} />}
            onClick={() => setSaveOpen(true)}
            disabled={features.length === 0}
            data-testid="draw-save-open"
            fullWidth
          >
            Save to dataset
          </Button>
        )}

        {saveOpen && (
          <>
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
            {saveError && (
              <Text size="xs" c="red">
                {saveError}
              </Text>
            )}
            {saveNotice && (
              <Text size="xs" c="green" data-testid="draw-save-notice">
                {saveNotice}
              </Text>
            )}
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconCloudUpload size={12} />}
              onClick={() => void saveToDataset()}
              disabled={!branchId || features.length === 0}
              loading={saving}
              data-testid="draw-save-commit"
              fullWidth
            >
              Commit {features.length} shape(s)
            </Button>
          </>
        )}
      </Stack>
    </PanelCard>
  );
}
