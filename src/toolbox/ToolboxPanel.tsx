/**
 * ToolboxPanel — vector geoprocessing in the browser, computed by topoi over
 * wasm in a worker (engine.ts). The tool list, the inputs each tool reads and
 * the parameter fields it shows all come from catalog.ts, and every run goes
 * through runTool, so a single run and a batch step take the same path.
 *
 * Every distance, tolerance and cell size is meters: the ops run in a local
 * equirectangular frame centred on their inputs (projection.ts).
 */
import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconMap, IconPlayerPlay, IconVectorTriangle, IconX } from '@tabler/icons-react';
import { TOOLS, TOOL_GROUPS, toolsInGroup, type ParamKey, type ToolId } from './catalog';
import { runTool, type ToolOutput, type ToolParams } from './engine';
import { bboxOf, frameFor, projectBbox, type Bbox } from './projection';
import type { JoinPredicate } from './topoi';
import { propertyKeys, useGeoJsonSources } from '../lib/geojsonSources';
import { useAgentLayerStore } from '../store/agentLayers';
import { getViewBounds } from '../lib/viewBounds';

type Fc = GeoJSON.FeatureCollection;

/** the run parameters as the form holds them: an extent is typed as text */
interface RawParams extends Omit<ToolParams, 'extent'> {
  extentText: string;
}

interface Step {
  id: string;
  tool: ToolId;
  /** a source id, 'last', or 'step:<index>'; several only for a multi-input tool */
  from: string[];
  second: string | null;
  params: RawParams;
}

const DEFAULT_PARAMS: RawParams = {
  distance: 100,
  segments: 8,
  tolerance: 10,
  field: '',
  extentText: '',
  cellSize: 1000,
  predicate: 'intersects',
  prefix: 'src_',
};

const MAX_GRID_CELLS = 200000;

function concat(fcs: Fc[]): Fc {
  return { type: 'FeatureCollection', features: fcs.flatMap((fc) => fc.features) };
}

function parseExtent(text: string): Bbox | null {
  const parts = text.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  return parts as Bbox;
}

function viewBbox(): Bbox {
  const b = getViewBounds();
  return [b.west, b.south, b.east, b.north];
}

// metre cells over a continent-wide view would run into the billions and hang
// the tab, so the count is checked before the worker ever sees it
function checkGrid(tool: ToolId, extent: Bbox, cellSize: number): void {
  if (tool !== 'grid-square' && tool !== 'grid-hex') return;
  if (cellSize <= 0) throw new Error('the cell size must be greater than zero');
  const [minX, minY, maxX, maxY] = projectBbox(extent, frameFor(extent));
  const cells = ((maxX - minX) / cellSize) * ((maxY - minY) / cellSize);
  if (cells > MAX_GRID_CELLS) {
    throw new Error(`that extent needs ${Math.round(cells)} cells, raise the cell size`);
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : 'the tool failed');

export function ToolboxPanel({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<ToolId>('buffer');
  const [from, setFrom] = useState<string[]>([]);
  const [second, setSecond] = useState<string | null>(null);
  const [params, setParams] = useState<RawParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tool: ToolId; output: ToolOutput } | null>(null);
  /** what the last run read, so a validate report can be handed to make-valid */
  const [lastInput, setLastInput] = useState<Fc | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [outputs, setOutputs] = useState<ToolOutput[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const sources = useGeoJsonSources();
  const addLayer = useAgentLayerStore((s) => s.addLayer);

  const spec = TOOLS[tool];
  const has = (key: ParamKey) => spec.params.includes(key);
  const set = (patch: Partial<RawParams>) => setParams((p) => ({ ...p, ...patch }));

  /** sources plus the outputs of the steps before `upto` */
  const refOptions = (upto: number) => [
    ...sources.map((s) => ({ value: s.id, label: s.name })),
    ...steps.slice(0, upto).map((_, i) => ({ value: `step:${i}`, label: `Step ${i + 1} output` })),
  ];
  const inputData = [
    ...refOptions(steps.length),
    ...(result?.output.kind === 'features' ? [{ value: 'last', label: 'Last result' }] : []),
  ];

  function sourceFc(ref: string, prior: ToolOutput[]): Fc {
    if (ref.startsWith('step:')) {
      const i = Number(ref.slice('step:'.length));
      const out = prior[i];
      if (!out) throw new Error(`step ${i + 1} has not run yet`);
      if (out.kind !== 'features') throw new Error(`step ${i + 1} produced a report, not features`);
      return out.geojson;
    }
    if (ref === 'last') {
      if (result?.output.kind !== 'features') throw new Error('there is no last result to read');
      return result.output.geojson;
    }
    const source = sources.find((s) => s.id === ref);
    if (!source) throw new Error('that layer is no longer on the map');
    return source.geojson;
  }

  async function execute(
    step: Omit<Step, 'id'>,
    prior: ToolOutput[],
  ): Promise<{ a: Fc | null; output: ToolOutput }> {
    const s = TOOLS[step.tool];
    const a =
      s.noInput || step.from.length === 0
        ? null
        : concat(step.from.map((ref) => sourceFc(ref, prior)));
    if (a && a.features.length === 0) throw new Error('the input layer has no features');
    const b = step.second ? sourceFc(step.second, prior) : null;
    const extent = !s.params.includes('extent')
      ? null
      : (parseExtent(step.params.extentText) ??
        (s.extentFrom === 'input' && a ? bboxOf([a]) : viewBbox()));
    if (extent) checkGrid(step.tool, extent, step.params.cellSize);
    return { a, output: await runTool(step.tool, { a, b }, { ...step.params, extent }) };
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const { a, output } = await execute({ tool, from, second, params }, outputs);
      setResult({ tool, output });
      setLastInput(a);
    } catch (err) {
      setError(message(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleMakeValid() {
    if (!lastInput) return;
    setRunning(true);
    setError(null);
    try {
      const output = await runTool('make-valid', { a: lastInput, b: null }, { ...params, extent: null });
      setResult({ tool: 'make-valid', output });
    } catch (err) {
      setError(message(err));
    } finally {
      setRunning(false);
    }
  }

  async function runBatch() {
    setBatchRunning(true);
    setBatchError(null);
    setOutputs([]);
    const done: ToolOutput[] = [];
    for (const [i, step] of steps.entries()) {
      try {
        done.push((await execute(step, done)).output);
      } catch (err) {
        setBatchError(`step ${i + 1} (${TOOLS[step.tool].label}) failed: ${message(err)}`);
        break;
      }
    }
    setOutputs(done);
    setBatchRunning(false);
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tool,
        from: prev.length > 0 ? [`step:${prev.length - 1}`] : from,
        second,
        params,
      },
    ]);
  }

  function removeStep(index: number) {
    // the refs after the dropped step move down with it, so a step never
    // silently reads the output of a different one
    const shift = (ref: string): string | null => {
      if (!ref.startsWith('step:')) return ref;
      const j = Number(ref.slice('step:'.length));
      if (j === index) return null;
      return j > index ? `step:${j - 1}` : ref;
    };
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((step) => ({
          ...step,
          from: step.from.map(shift).filter((ref): ref is string => ref !== null),
          second: step.second ? shift(step.second) : null,
        })),
    );
    setOutputs([]);
    setBatchError(null);
  }

  function setStepFrom(index: number, next: string[]) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, from: next } : step)));
  }

  function addAsLayer(id: ToolId, output: ToolOutput) {
    if (output.kind !== 'features') return;
    addLayer({
      id: crypto.randomUUID(),
      name: TOOLS[id].label,
      color: '#9b59b6',
      geojson: output.geojson,
    });
  }

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 340,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconVectorTriangle size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Geoprocessing
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          label="Tool"
          size="xs"
          data={TOOL_GROUPS.map((group) => ({
            group,
            items: toolsInGroup(group).map(({ id, label }) => ({ value: id, label })),
          }))}
          value={tool}
          // the result outlives the switch: picking the next tool is how a run
          // gets chained onto the last one
          onChange={(v) => {
            setTool((v as ToolId) ?? 'buffer');
            setError(null);
          }}
        />

        {sources.length === 0 && (
          <Text size="xs" c="dimmed">
            Draw or load features first — there is nothing to process yet.
          </Text>
        )}

        {!spec.noInput &&
          (spec.multi ? (
            <MultiSelect
              label="Input layers"
              size="xs"
              data={inputData}
              value={from}
              onChange={setFrom}
              placeholder="pick the layers"
            />
          ) : (
            <Select
              label="Input layer"
              size="xs"
              data={inputData}
              value={from[0] ?? null}
              onChange={(v) => setFrom(v ? [v] : [])}
              placeholder="pick a layer"
            />
          ))}

        {spec.second && (
          <Select
            label={spec.second}
            size="xs"
            data={inputData}
            value={second}
            onChange={setSecond}
            placeholder="pick a layer"
          />
        )}

        <Group gap={8}>
          {has('distance') && (
            <NumberInput
              label="Distance (m)"
              size="xs"
              w={100}
              value={params.distance}
              onChange={(v) => set({ distance: Number(v) })}
            />
          )}
          {has('segments') && (
            <NumberInput
              label="Segments"
              size="xs"
              w={90}
              min={1}
              max={64}
              value={params.segments}
              onChange={(v) => set({ segments: Number(v) })}
            />
          )}
          {has('tolerance') && (
            <NumberInput
              label="Tolerance (m)"
              size="xs"
              w={110}
              min={0}
              value={params.tolerance}
              onChange={(v) => set({ tolerance: Number(v) })}
            />
          )}
          {has('cellSize') && (
            <NumberInput
              label="Cell size (m)"
              size="xs"
              w={110}
              min={1}
              value={params.cellSize}
              onChange={(v) => set({ cellSize: Number(v) })}
            />
          )}
        </Group>

        {has('field') && (
          <Select
            label="Field"
            size="xs"
            data={propertyKeys(sources.find((s) => s.id === from[0]))}
            value={params.field || null}
            onChange={(v) => set({ field: v ?? '' })}
            placeholder="every feature into one"
            clearable
          />
        )}

        {has('predicate') && (
          <Select
            label="Predicate"
            size="xs"
            data={['intersects', 'within', 'nearest']}
            value={params.predicate}
            onChange={(v) => set({ predicate: (v as JoinPredicate) ?? 'intersects' })}
          />
        )}

        {has('prefix') && (
          <TextInput
            label="Property prefix"
            size="xs"
            value={params.prefix}
            onChange={(e) => set({ prefix: e.currentTarget.value })}
          />
        )}

        {has('extent') && (
          <Group gap={8} align="flex-end" wrap="nowrap">
            <TextInput
              label="Extent (w,s,e,n)"
              size="xs"
              style={{ flex: 1 }}
              placeholder={spec.extentFrom === 'input' ? 'the input bounds' : 'the current view'}
              value={params.extentText}
              onChange={(e) => set({ extentText: e.currentTarget.value })}
            />
            <Button
              size="xs"
              variant="default"
              onClick={() => set({ extentText: viewBbox().map((v) => v.toFixed(4)).join(',') })}
            >
              View
            </Button>
          </Group>
        )}

        {spec.hint && (
          <Text size="xs" c="dimmed">
            {spec.hint}
          </Text>
        )}

        <Group gap={8} wrap="nowrap">
          <Button
            size="xs"
            style={{ flex: 1 }}
            leftSection={<IconPlayerPlay size={14} />}
            onClick={handleRun}
            loading={running}
          >
            Run tool
          </Button>
          <Button size="xs" variant="default" onClick={addStep}>
            Add step
          </Button>
        </Group>

        {error && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {result?.output.kind === 'features' && (
          <Paper p="xs" withBorder bg="#0d1117">
            <Text size="xs" fw={500} c="white">
              {TOOLS[result.tool].label}: {result.output.geojson.features.length} features
            </Text>
            <Button
              size="xs"
              mt={6}
              variant="light"
              color="violet"
              leftSection={<IconMap size={14} />}
              onClick={() => addAsLayer(result.tool, result.output)}
            >
              Add as layer
            </Button>
          </Paper>
        )}

        {result?.output.kind === 'report' && (
          <Paper p="xs" withBorder bg="#0d1117">
            {result.output.report.valid ? (
              <Text size="xs" c="teal">
                Every feature is valid.
              </Text>
            ) : (
              <>
                <Text size="xs" fw={500} c="white" mb={4}>
                  {result.output.report.invalid.length} invalid features
                </Text>
                <Stack gap={2}>
                  {result.output.report.invalid.map((row) => (
                    <Text key={row.feature} size="xs" c="dimmed">
                      Feature {row.feature + 1}: {row.issues.map((i) => i.message).join('; ')}
                    </Text>
                  ))}
                </Stack>
                <Button
                  size="xs"
                  mt={6}
                  variant="light"
                  color="orange"
                  onClick={handleMakeValid}
                  loading={running}
                >
                  Make valid
                </Button>
              </>
            )}
          </Paper>
        )}

        <Divider label="Batch" labelPosition="center" />

        {steps.length === 0 ? (
          <Text size="xs" c="dimmed">
            Add step queues the tool as configured, then each step can read the one before it.
          </Text>
        ) : (
          <>
            {steps.map((step, i) => {
              const out = outputs[i];
              return (
                <Paper key={step.id} p={6} withBorder bg="#0d1117">
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="xs" c="white">
                      {i + 1}. {TOOLS[step.tool].label}
                    </Text>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => removeStep(i)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Group>
                  {!TOOLS[step.tool].noInput &&
                    (TOOLS[step.tool].multi ? (
                      <MultiSelect
                        aria-label={`Step ${i + 1} input`}
                        size="xs"
                        data={refOptions(i)}
                        value={step.from}
                        onChange={(v) => setStepFrom(i, v)}
                      />
                    ) : (
                      <Select
                        aria-label={`Step ${i + 1} input`}
                        size="xs"
                        data={refOptions(i)}
                        value={step.from[0] ?? null}
                        onChange={(v) => setStepFrom(i, v ? [v] : [])}
                        placeholder="pick an input"
                      />
                    ))}
                  {out && (
                    <Group gap={8} mt={4}>
                      <Badge size="xs" color="green">
                        {out.kind === 'features'
                          ? `${out.geojson.features.length} features`
                          : 'report'}
                      </Badge>
                      {out.kind === 'features' && (
                        <Button
                          size="xs"
                          variant="subtle"
                          aria-label={`Add step ${i + 1} as layer`}
                          onClick={() => addAsLayer(step.tool, out)}
                        >
                          Add as layer
                        </Button>
                      )}
                    </Group>
                  )}
                </Paper>
              );
            })}
            <Group gap={8}>
              <Button size="xs" onClick={runBatch} loading={batchRunning}>
                Run batch
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setSteps([]);
                  setOutputs([]);
                  setBatchError(null);
                }}
              >
                Clear steps
              </Button>
            </Group>
            {batchError && (
              <Alert color="red" variant="light" p="xs">
                <Text size="xs">{batchError}</Text>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
