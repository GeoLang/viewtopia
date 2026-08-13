import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  Button,
  Slider,
  Select,
  Loader,
  TextInput,
  ActionIcon,
  FileButton,
} from '@mantine/core';
import type {
  ErrorEvent as MapErrorEvent,
  Map as MapLibreMap,
  MapSourceDataEvent,
} from 'maplibre-gl';
import {
  IconClock,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveMapLibre, getPaneMapLibre } from '../../viewer/registry';
import { useAppStore } from '../../store/app';
import { useSplitViewStore, COMPARE_PANE, type Pane } from '../../store/splitView';
import {
  buildSteps,
  listLayers,
  stepInterval,
  stepLabel,
  tileUrl,
  timedLayers,
  type PlumbLayer,
  type StepSize,
} from '../../lib/geoplumb';
import { addLocalPmtiles, addRemotePmtiles } from '../../features/pmtiles/source';
import { addPmtilesLayers, removePmtilesLayers } from '../../features/pmtiles/mapLayers';
import { makeArchive, orderedArchives, type PmtilesArchive } from '../../features/pmtiles/series';

/** Source ids; each layer is `<source>-raster`, the convention the other raster tools use. */
const A_SOURCE = 'timelapse-a';
const B_SOURCE = 'timelapse-b';
/** The one archive of the series that is on the map right now. */
const SERIES_SOURCE = 'timelapse-pmtiles';

type Mode = 'swipe' | 'sideBySide' | 'opacity';
type SourceMode = 'geoplumb' | 'pmtiles';

const SOURCE_MODES = [
  { value: 'geoplumb', label: 'Geoplumb layers' },
  { value: 'pmtiles', label: 'PMTiles series' },
];

const MODES = [
  { value: 'swipe', label: 'Swipe' },
  { value: 'sideBySide', label: 'Side by Side' },
  { value: 'opacity', label: 'Opacity Blend' },
];

const STEP_SIZES = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function removeRaster(map: MapLibreMap | null, source: string) {
  if (!map) return;
  if (map.getLayer(`${source}-raster`)) map.removeLayer(`${source}-raster`);
  if (map.getSource(source)) map.removeSource(source);
}

function setRaster(map: MapLibreMap, source: string, url: string, opacity: number) {
  removeRaster(map, source);
  map.addSource(source, { type: 'raster', tiles: [url], tileSize: 256 });
  map.addLayer({
    id: `${source}-raster`,
    type: 'raster',
    source,
    paint: { 'raster-opacity': opacity },
  });
}

/**
 * Run once the map exists with a loaded style, and say how to give up. The
 * pane map is built a few frames after the split turns on, so the caller
 * cannot assume it is there when the mode changes.
 */
function whenMapReady(
  get: () => MapLibreMap | null,
  run: (map: MapLibreMap) => void,
): () => void {
  let cancelled = false;
  let timer: number | undefined;
  const tick = () => {
    if (cancelled) return;
    const map = get();
    if (!map) {
      timer = window.setTimeout(tick, 150);
      return;
    }
    if (!map.isStyleLoaded()) {
      map.once('idle', tick);
      return;
    }
    run(map);
  };
  tick();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

/**
 * Say whether one source still has tiles in flight, on whichever map holds it.
 * Every `sourcedataloading` is followed by a `sourcedata`, `sourcedataabort` or
 * `error`, and each of those carries the source's own outstanding-request
 * state, so the last event for the source is the answer.
 */
function watchTileLoading(
  get: () => MapLibreMap | null,
  source: string,
  setTilesLoading: (loading: boolean) => void,
): () => void {
  let detach: (() => void) | null = null;
  const stopWaiting = whenMapReady(get, (map) => {
    const onSourceData = (event: MapSourceDataEvent) => {
      if (event.sourceId !== source) return;
      setTilesLoading(!event.isSourceLoaded);
    };
    // the error event carries no loaded flag, so ask the source itself
    const onError = (event: MapErrorEvent) => {
      if (!('sourceId' in event) || event.sourceId !== source) return;
      setTilesLoading(!!map.getSource(source) && !map.isSourceLoaded(source));
    };
    map.on('sourcedataloading', onSourceData);
    map.on('sourcedata', onSourceData);
    map.on('sourcedataabort', onSourceData);
    map.on('error', onError);
    detach = () => {
      map.off('sourcedataloading', onSourceData);
      map.off('sourcedata', onSourceData);
      map.off('sourcedataabort', onSourceData);
      map.off('error', onError);
    };
  });
  return () => {
    stopWaiting();
    detach?.();
    setTilesLoading(false);
  };
}

function PlaybackControls({
  speed,
  onSpeed,
  playing,
  onPlaying,
  disabled,
}: {
  speed: number;
  onSpeed: (speed: number) => void;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Text size="xs" c="dimmed">
        Speed: {speed} steps/s
      </Text>
      <Slider
        size="xs"
        min={0.25}
        max={4}
        step={0.25}
        value={speed}
        onChange={onSpeed}
        color="violet"
      />

      <Button
        size="xs"
        variant="filled"
        color="violet"
        leftSection={playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
        onClick={() => onPlaying(!playing)}
        disabled={disabled}
        fullWidth
      >
        {playing ? 'Pause' : 'Play'}
      </Button>
    </>
  );
}

export function TimelapsePanel({ onClose }: { onClose: () => void }) {
  const [layers, setLayers] = useState<PlumbLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layerName, setLayerName] = useState<string | null>(null);
  const [stepSize, setStepSize] = useState<StepSize>('month');
  const [aIndex, setAIndex] = useState(0);
  const [bIndex, setBIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('swipe');
  const [position, setPosition] = useState(50);
  const [blend, setBlend] = useState(50);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [aTilesLoading, setATilesLoading] = useState(false);
  const [bTilesLoading, setBTilesLoading] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('geoplumb');
  const [archives, setArchives] = useState<PmtilesArchive[]>([]);
  const [archiveIndex, setArchiveIndex] = useState(0);
  const [archiveUrl, setArchiveUrl] = useState('');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [readingArchive, setReadingArchive] = useState(false);

  // maplibre draws the raster tiles, and the compare's second view is the
  // split pane, which only exists on the globe tab
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const hasMap = renderer === 'maplibre' && activeTab === 'globe';
  const geoplumbActive = hasMap && sourceMode === 'geoplumb';
  const seriesActive = hasMap && sourceMode === 'pmtiles';

  const layer = layers.find((l) => l.name === layerName) ?? null;
  const steps = useMemo(
    () => (layer?.temporalExtent ? buildSteps(layer.temporalExtent, stepSize) : []),
    [layer, stepSize],
  );
  const aStep = steps[aIndex] ?? null;
  const bStep = steps[bIndex] ?? null;
  const comparing = geoplumbActive && !!layerName && steps.length > 0;

  const series = useMemo(() => orderedArchives(archives), [archives]);
  const seriesIndex = Math.min(archiveIndex, Math.max(0, series.length - 1));
  const activeArchive = series[seriesIndex] ?? null;
  // B rides the split's second map unless the two are blended into one
  const bOnPane = mode !== 'opacity';

  const blendRef = useRef(blend);
  blendRef.current = blend;

  // put the split back the way the user had it, so a compare does not leave
  // their own split view on. First effect declared, so it captures the state
  // before the mode effect below touches it.
  const restore = useRef<{ active: boolean; comparePanes: Pane[] }>({
    active: false,
    comparePanes: useSplitViewStore.getState().comparePanes,
  });
  useEffect(() => {
    const before = useSplitViewStore.getState();
    restore.current = { active: before.active, comparePanes: before.comparePanes };
    return () => {
      const split = useSplitViewStore.getState();
      split.setSwipeAt(null);
      split.setActive(restore.current.active);
      split.setComparePanes(restore.current.comparePanes);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listLayers()
      .then((found) => {
        if (cancelled) return;
        setLayers(timedLayers(found));
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // a new sequence starts at its ends: oldest against newest
  useEffect(() => {
    setAIndex(0);
    setBIndex(Math.max(0, steps.length - 1));
    setPlaying(false);
  }, [steps]);

  // swipe and side by side both compare two maps, which is the split view.
  // Switching renderer mid-compare drops it rather than leaving a split behind.
  useEffect(() => {
    const split = useSplitViewStore.getState();
    if (!hasMap || !comparing || mode === 'opacity') {
      split.setActive(restore.current.active);
      return;
    }
    // a compare is A against B, so a 2x2 split goes back to two panes across
    split.setLayout('twoAcross');
    split.setPaneRenderer(COMPARE_PANE, 'maplibre');
    split.setActive(true);
  }, [hasMap, comparing, mode]);

  useEffect(() => {
    const swiping = hasMap && comparing && mode === 'swipe';
    useSplitViewStore.getState().setSwipeAt(swiping ? position : null);
  }, [hasMap, comparing, mode, position]);

  // A on the active map, always
  useEffect(() => {
    if (!geoplumbActive || !aStep || !layerName) {
      removeRaster(getActiveMapLibre(), A_SOURCE);
      return;
    }
    const url = tileUrl(layerName, stepInterval(aStep, stepSize));
    return whenMapReady(getActiveMapLibre, (map) => setRaster(map, A_SOURCE, url, 1));
  }, [geoplumbActive, layerName, aStep, stepSize]);

  // B on whichever map this mode compares against
  useEffect(() => {
    if (!geoplumbActive || !bStep || !layerName) {
      removeRaster(getActiveMapLibre(), B_SOURCE);
      removeRaster(getPaneMapLibre(), B_SOURCE);
      return;
    }
    // leaving a mode behind takes B off the map it was drawn on
    removeRaster(bOnPane ? getActiveMapLibre() : getPaneMapLibre(), B_SOURCE);
    const url = tileUrl(layerName, stepInterval(bStep, stepSize));
    return whenMapReady(bOnPane ? getPaneMapLibre : getActiveMapLibre, (map) =>
      setRaster(map, B_SOURCE, url, bOnPane ? 1 : blendRef.current / 100),
    );
  }, [geoplumbActive, layerName, bStep, stepSize, bOnPane]);

  useEffect(() => {
    if (!geoplumbActive || !aStep || !layerName) {
      setATilesLoading(false);
      return;
    }
    return watchTileLoading(getActiveMapLibre, A_SOURCE, setATilesLoading);
  }, [geoplumbActive, layerName, aStep]);

  useEffect(() => {
    if (!geoplumbActive || !bStep || !layerName) {
      setBTilesLoading(false);
      return;
    }
    return watchTileLoading(
      bOnPane ? getPaneMapLibre : getActiveMapLibre,
      B_SOURCE,
      setBTilesLoading,
    );
  }, [geoplumbActive, layerName, bStep, bOnPane]);

  // the blend slider repaints rather than re-adding the source, which would
  // refetch every tile on each drag
  useEffect(() => {
    if (bOnPane) return;
    const map = getActiveMapLibre();
    if (map?.getLayer(`${B_SOURCE}-raster`)) {
      map.setPaintProperty(`${B_SOURCE}-raster`, 'raster-opacity', blend / 100);
    }
  }, [blend, bOnPane]);

  useEffect(() => {
    if (!playing || sourceMode !== 'geoplumb' || steps.length < 2) return;
    const id = window.setInterval(() => {
      setBIndex((i) => (i + 1) % steps.length);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, steps.length, sourceMode]);

  // one archive of the series on the map at a time, swapped as the step moves
  useEffect(() => {
    if (!seriesActive || !activeArchive) return;
    const stopWaiting = whenMapReady(getActiveMapLibre, (map) =>
      addPmtilesLayers(map, {
        id: SERIES_SOURCE,
        url: activeArchive.url,
        info: activeArchive.info,
        opacity: 1,
        visible: true,
      }),
    );
    return () => {
      stopWaiting();
      const map = getActiveMapLibre();
      if (map) removePmtilesLayers(map, SERIES_SOURCE);
    };
  }, [seriesActive, activeArchive]);

  useEffect(() => {
    if (!playing || sourceMode !== 'pmtiles' || series.length < 2) return;
    const id = window.setInterval(() => {
      setArchiveIndex((i) => (i + 1) % series.length);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, series.length, sourceMode]);

  useEffect(
    () => () => {
      removeRaster(getActiveMapLibre(), A_SOURCE);
      removeRaster(getActiveMapLibre(), B_SOURCE);
      removeRaster(getPaneMapLibre(), B_SOURCE);
    },
    [],
  );

  /** Any hand on B stops the playback that is also driving it. */
  const takeOverB = (index: number) => {
    setPlaying(false);
    setBIndex(index);
  };

  const takeOverStep = (index: number) => {
    setPlaying(false);
    setArchiveIndex(index);
  };

  const addUrlArchive = async () => {
    const typed = archiveUrl.trim();
    if (!typed) return;
    setReadingArchive(true);
    try {
      const url = new URL(typed, window.location.href).href;
      const info = await addRemotePmtiles(url);
      setArchives((list) => [...list, makeArchive(url, `pmtiles://${url}`, info)]);
      setArchiveUrl('');
      setArchiveError(null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setReadingArchive(false);
    }
  };

  const addFileArchive = async (file: File | null) => {
    if (!file) return;
    setReadingArchive(true);
    try {
      const { url, info } = await addLocalPmtiles(file);
      setArchives((list) => [...list, makeArchive(file.name, url, info)]);
      setArchiveError(null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setReadingArchive(false);
    }
  };

  const setArchiveLabel = (id: string, timeLabel: string) =>
    setArchives((list) => list.map((a) => (a.id === id ? { ...a, timeLabel } : a)));

  const removeArchive = (id: string) => setArchives((list) => list.filter((a) => a.id !== id));

  const stepData = steps.map((s, i) => ({ value: String(i), label: stepLabel(s, stepSize) }));

  return (
    <PanelCard width={280}>
      <PanelHeader
        icon={<IconClock size={16} />}
        title="Timelapse"
        onClose={onClose}
      />

      {!hasMap ? (
        <Text size="xs" c="orange">
          Switch renderer to MapLibre first: the compare draws raster tiles into
          two MapLibre maps.
        </Text>
      ) : (
        <Stack gap="xs">
          <Select
            size="xs"
            label="Source"
            data={SOURCE_MODES}
            value={sourceMode}
            onChange={(v) => {
              if (!v) return;
              setPlaying(false);
              setSourceMode(v as SourceMode);
            }}
            allowDeselect={false}
          />

          {sourceMode === 'pmtiles' && (
            <>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  size="xs"
                  label="Archive URL"
                  placeholder="https://…/roads-2024.pmtiles"
                  style={{ flex: 1 }}
                  value={archiveUrl}
                  onChange={(e) => setArchiveUrl(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUrlArchive()}
                />
                <Button size="xs" variant="light" color="violet" onClick={addUrlArchive}>
                  Add
                </Button>
              </Group>

              <FileButton accept=".pmtiles" onChange={addFileArchive}>
                {(props) => (
                  <Button
                    {...props}
                    size="xs"
                    variant="default"
                    leftSection={<IconUpload size={14} />}
                    fullWidth
                  >
                    Add archive file
                  </Button>
                )}
              </FileButton>

              {readingArchive && (
                <Group gap="xs">
                  <Loader size="xs" color="violet" />
                  <Text size="xs" c="dimmed">
                    Reading the archive…
                  </Text>
                </Group>
              )}

              {archiveError && (
                <Text size="xs" c="red">
                  {archiveError}
                </Text>
              )}

              {series.length === 0 ? (
                <Text size="xs" c="dimmed">
                  Add the same layer's archives one per date. A date in the file name
                  (2024, 2024-06, 2024-06-01) becomes its step, and anything else you
                  label by hand.
                </Text>
              ) : (
                series.map((archive) => (
                  <Group key={archive.id} gap="xs" wrap="nowrap">
                    <Text size="xs" truncate style={{ flex: 1 }} title={archive.name}>
                      {archive.name}
                    </Text>
                    <TextInput
                      size="xs"
                      w={82}
                      aria-label={`Time for ${archive.name}`}
                      placeholder="YYYY-MM"
                      value={archive.timeLabel}
                      onChange={(e) => setArchiveLabel(archive.id, e.currentTarget.value)}
                    />
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${archive.name}`}
                      onClick={() => removeArchive(archive.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))
              )}

              {series.length > 1 && (
                <Slider
                  size="xs"
                  min={0}
                  max={series.length - 1}
                  step={1}
                  value={seriesIndex}
                  onChange={takeOverStep}
                  thumbLabel="Series step"
                  label={(value) => series[value]?.timeLabel || series[value]?.name}
                  color="violet"
                />
              )}

              {activeArchive && (
                <Text size="xs" c="dimmed" data-testid="pmtiles-series-step">
                  Step {seriesIndex + 1} of {series.length}:{' '}
                  {activeArchive.timeLabel || activeArchive.name}
                </Text>
              )}

              <PlaybackControls
                speed={speed}
                onSpeed={setSpeed}
                playing={playing}
                onPlaying={setPlaying}
                disabled={series.length < 2}
              />
            </>
          )}

          {sourceMode === 'geoplumb' && loading && (
            <Group gap="xs">
              <Loader size="xs" color="violet" />
              <Text size="xs" c="dimmed">
                Reading the layer list…
              </Text>
            </Group>
          )}

          {sourceMode === 'geoplumb' && error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}

          {sourceMode === 'geoplumb' && !loading && !error && layers.length === 0 && (
            <Text size="xs" c="dimmed">
              No layer on the tile service carries a time range, so there is
              nothing to compare across time.
            </Text>
          )}

          {sourceMode === 'geoplumb' && layers.length > 0 && (
            <>
              <Select
                size="xs"
                label="Layer"
                placeholder="Pick a timed layer"
                data={layers.map((l) => ({ value: l.name, label: l.name }))}
                value={layerName}
                onChange={setLayerName}
              />
              {layer?.collection && (
                <Text size="xs" c="dimmed">
                  {layer.collection}
                </Text>
              )}
            </>
          )}

          {comparing && (
            <>
              <Select
                size="xs"
                label="Step size"
                data={STEP_SIZES}
                value={stepSize}
                onChange={(v) => v && setStepSize(v as StepSize)}
                allowDeselect={false}
              />

              <Select
                size="xs"
                label="A"
                data={stepData}
                value={String(aIndex)}
                onChange={(v) => v && setAIndex(Number(v))}
                allowDeselect={false}
                searchable
              />

              <Select
                size="xs"
                label="B"
                data={stepData}
                value={String(bIndex)}
                onChange={(v) => v && takeOverB(Number(v))}
                allowDeselect={false}
                searchable
              />

              <Select
                size="xs"
                label="Comparison Mode"
                data={MODES}
                value={mode}
                onChange={(v) => v && setMode(v as Mode)}
                allowDeselect={false}
              />

              {mode === 'swipe' && (
                <>
                  <Text size="xs" c="dimmed">
                    Split Position: {position}%
                  </Text>
                  <Slider
                    size="xs"
                    min={0}
                    max={100}
                    value={position}
                    onChange={setPosition}
                    color="violet"
                  />
                </>
              )}

              {mode === 'opacity' && (
                <>
                  <Text size="xs" c="dimmed">
                    B over A: {blend}%
                  </Text>
                  <Slider
                    size="xs"
                    min={0}
                    max={100}
                    value={blend}
                    onChange={setBlend}
                    color="violet"
                  />
                </>
              )}

              <PlaybackControls
                speed={speed}
                onSpeed={setSpeed}
                playing={playing}
                onPlaying={setPlaying}
                disabled={steps.length < 2}
              />

              {(aTilesLoading || bTilesLoading) && (
                <Group gap="xs">
                  <Loader size="xs" color="violet" />
                  <Text size="xs" c="dimmed">
                    Pulling tiles…
                  </Text>
                </Group>
              )}

              <Text size="xs" c="dimmed">
                {aStep && bStep
                  ? `A ${stepLabel(aStep, stepSize)} vs B ${stepLabel(bStep, stepSize)}, ${steps.length} steps`
                  : `${steps.length} steps`}
                . Each step pulls that calendar interval, so a cold one takes a
                while to render.
              </Text>
            </>
          )}
        </Stack>
      )}
    </PanelCard>
  );
}
