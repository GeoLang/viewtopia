import { ActionIcon, Button, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import type { ColorRamp } from '../../raster/types';
import { propertyKeys } from '../../lib/geojsonSources';
import {
  useAgentLayerStore,
  ZOOM_LIMITS,
  type AgentLayer,
  type ZoomRange,
} from '../../store/agentLayers';
import { useColumnLabels } from '../../store/datasetSchemas';
import {
  CATEGORY_PALETTE,
  buildCategorized,
  buildGraduated,
  categoricalFields,
  legendEntries,
  numericFields,
  symbologyField,
  type BreakMethod,
  type GraduatedSymbology,
  type RuleOp,
  type Symbology,
  type SymbologyRule,
} from './symbology';

const RAMPS: ColorRamp[] = ['viridis', 'magma', 'inferno', 'plasma', 'terrain', 'rdylgn', 'spectral', 'greens', 'reds', 'blues', 'grays'];
const OPS: RuleOp[] = ['==', '!=', '<', '<=', '>', '>='];

function swatch(color: string, onChange: (c: string) => void) {
  return (
    <input
      type="color"
      value={color}
      onChange={(e) => onChange(e.target.value)}
      data-testid="symbology-color"
      style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
    />
  );
}

/**
 * The zoom levels the layer draws over. The whole span is stored as no range at
 * all, so a layer nobody limited stays unlimited.
 */
function ZoomRangeControl({ layer }: { layer: AgentLayer }) {
  const setZoomRange = useAgentLayerStore((s) => s.setZoomRange);
  const range = layer.zoomRange ?? ZOOM_LIMITS;
  const patch = (p: Partial<ZoomRange>) => setZoomRange(layer.id, { ...range, ...p });
  const bound = (edge: 'min' | 'max', onChange: (value: number) => void) => (
    <NumberInput
      size="xs"
      flex={1}
      min={ZOOM_LIMITS.min}
      max={ZOOM_LIMITS.max}
      value={range[edge]}
      onChange={(value) => {
        if (value !== '') onChange(Number(value));
      }}
      data-testid={`agent-layer-${edge}-zoom`}
    />
  );
  return (
    <Group gap={4} wrap="nowrap" data-testid="agent-layer-zoom-range">
      <Text size="xs" c="dimmed">
        Zoom
      </Text>
      {bound('min', (min) => patch({ min }))}
      <Text size="xs" c="dimmed">
        to
      </Text>
      {bound('max', (max) => patch({ max }))}
    </Group>
  );
}

export function SymbologyLegend({ sym }: { sym: Symbology }) {
  const { columnLabel } = useColumnLabels();
  const symField = symbologyField(sym);
  const field = symField && columnLabel(symField);
  return (
    <Group gap={2} wrap="nowrap" data-testid="agent-layer-legend">
      {legendEntries(sym).map((entry) => (
        <div
          key={`${entry.color}-${entry.label}`}
          data-testid="agent-layer-legend-class"
          title={field ? `${field}: ${entry.label}` : entry.label}
          style={{ background: entry.color, width: 18, height: 8, borderRadius: 2 }}
        />
      ))}
      <Text size="xs" c="dimmed">
        {legendEntries(sym)[0]?.label}
      </Text>
    </Group>
  );
}

/**
 * Per-layer symbology controls for the layer panel. Every change goes straight
 * to the store, so the map restyles as the user works.
 */
export function SymbologyEditor({ layer }: { layer: AgentLayer }) {
  const setSymbology = useAgentLayerStore((s) => s.setSymbology);
  const { columnOptions } = useColumnLabels();
  const sym = layer.symbology;
  const numeric = numericFields(layer);
  const categorical = categoricalFields(layer);
  const allFields = propertyKeys({
    id: layer.id,
    name: layer.name,
    geojson: layer.sourceGeojson ?? layer.geojson,
  });

  const kinds = [
    { value: 'none', label: 'Single colour' },
    ...(numeric.length ? [{ value: 'graduated', label: 'Graduated' }] : []),
    ...(categorical.length ? [{ value: 'categorized', label: 'Categorized' }] : []),
    ...(allFields.length ? [{ value: 'rules', label: 'Rules' }] : []),
  ];

  if (kinds.length === 1) {
    return (
      <Stack gap={6}>
        <Text size="xs" c="dimmed" data-testid="agent-layer-no-shading">
          Nothing to style by: no field varies across these features.
        </Text>
        <ZoomRangeControl layer={layer} />
      </Stack>
    );
  }

  const apply = (next: Symbology | null) => setSymbology(layer.id, next);

  const switchKind = (kind: string | null) => {
    if (!kind || kind === 'none') return apply(null);
    if (kind === 'graduated') return apply(buildGraduated(layer, numeric[0]));
    if (kind === 'categorized') return apply(buildCategorized(layer, categorical[0]));
    apply({
      kind: 'rules',
      rules: [{ field: allFields[0], op: '==', value: '', color: CATEGORY_PALETTE[0] }],
    });
  };

  const rebuildGraduated = (g: GraduatedSymbology, patch: Partial<GraduatedSymbology>) => {
    const next = { ...g, ...patch };
    apply(buildGraduated(layer, next.field, next.method, next.breaks.length, next.ramp) ?? null);
  };

  const setRules = (rules: SymbologyRule[]) =>
    rules.length ? apply({ kind: 'rules', rules }) : apply(null);

  return (
    <Stack gap={6}>
      <Select
        size="xs"
        data={kinds}
        value={sym?.kind ?? 'none'}
        onChange={switchKind}
        data-testid="agent-layer-symbology-kind"
        allowDeselect={false}
      />

      {sym?.kind === 'graduated' && (
        <>
          <Select
            size="xs"
            data={columnOptions(numeric)}
            value={sym.field}
            onChange={(field) => field && rebuildGraduated(sym, { field })}
            data-testid="agent-layer-field"
            allowDeselect={false}
          />
          <Group gap={4} wrap="nowrap">
            <Select
              size="xs"
              flex={1}
              data={[
                { value: 'equal', label: 'Equal intervals' },
                { value: 'quantile', label: 'Quantiles' },
              ]}
              value={sym.method}
              onChange={(method) => method && rebuildGraduated(sym, { method: method as BreakMethod })}
              data-testid="agent-layer-method"
              allowDeselect={false}
            />
            <NumberInput
              size="xs"
              w={54}
              min={2}
              max={9}
              value={sym.breaks.length}
              onChange={(n) => {
                const classes = Number(n);
                if (classes >= 2) apply(buildGraduated(layer, sym.field, sym.method, classes, sym.ramp) ?? null);
              }}
              data-testid="agent-layer-classes"
            />
          </Group>
          <Select
            size="xs"
            data={RAMPS}
            value={sym.ramp}
            onChange={(ramp) => ramp && rebuildGraduated(sym, { ramp: ramp as ColorRamp })}
            data-testid="agent-layer-ramp"
            allowDeselect={false}
          />
        </>
      )}

      {sym?.kind === 'categorized' && (
        <>
          <Select
            size="xs"
            data={columnOptions(categorical)}
            value={sym.field}
            onChange={(field) => field && apply(buildCategorized(layer, field))}
            data-testid="agent-layer-field"
            allowDeselect={false}
          />
          <Stack gap={2}>
            {sym.categories.map((cat, i) => (
              <Group key={String(cat.value)} gap={6} wrap="nowrap">
                {swatch(cat.color, (color) =>
                  apply({
                    ...sym,
                    categories: sym.categories.map((c, j) => (j === i ? { ...c, color } : c)),
                  }),
                )}
                <Text size="xs" c="white" lineClamp={1}>
                  {String(cat.value)}
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      )}

      {sym?.kind === 'rules' && (
        <Stack gap={4}>
          {sym.rules.map((rule, i) => {
            const patch = (p: Partial<SymbologyRule>) =>
              setRules(sym.rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
            return (
              // rules have no identity beyond their position
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <Group key={i} gap={4} wrap="nowrap" data-testid="agent-layer-rule">
                {swatch(rule.color, (color) => patch({ color }))}
                <Select
                  size="xs"
                  flex={1}
                  data={columnOptions(allFields)}
                  value={rule.field}
                  onChange={(field) => field && patch({ field })}
                  allowDeselect={false}
                />
                <Select
                  size="xs"
                  w={64}
                  data={OPS}
                  value={rule.op}
                  onChange={(op) => op && patch({ op: op as RuleOp })}
                  allowDeselect={false}
                />
                <input
                  value={rule.value}
                  onChange={(e) => patch({ value: e.target.value })}
                  placeholder="value"
                  data-testid="agent-layer-rule-value"
                  style={{
                    width: 54,
                    background: 'var(--mantine-color-dark-8)',
                    border: '1px solid var(--mantine-color-dark-5)',
                    borderRadius: 4,
                    color: 'white',
                    fontSize: 12,
                    padding: '2px 4px',
                  }}
                />
                <ActionIcon aria-label="Remove rule"
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setRules(sym.rules.filter((_, j) => j !== i))}
                  data-testid="agent-layer-rule-remove"
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            );
          })}
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={12} />}
            onClick={() =>
              setRules([
                ...sym.rules,
                {
                  field: allFields[0],
                  op: '==',
                  value: '',
                  color: CATEGORY_PALETTE[sym.rules.length % CATEGORY_PALETTE.length],
                },
              ])
            }
            data-testid="agent-layer-rule-add"
          >
            Add rule
          </Button>
        </Stack>
      )}

      {sym && <SymbologyLegend sym={sym} />}

      <ZoomRangeControl layer={layer} />
    </Stack>
  );
}
