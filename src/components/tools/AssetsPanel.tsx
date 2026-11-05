import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  ScrollArea,
  Badge,
  CopyButton,
  FileButton,
  Progress,
  Select,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconHierarchy2,
  IconReportAnalytics,
  IconLink,
  IconPackage,
  IconUpload,
  IconTrash,
  IconRefresh,
  IconWorldOff,
  IconWorldUpload,
  IconPhoto,
  IconMountain,
} from '@tabler/icons-react';
import { CzmlDataSource, type Viewer } from 'cesium';
import { PanelCard, PanelHeader } from '../PanelCard';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { flyToTileset } from '../../viewer/flyToTileset';
import { getAuthToken } from '../../features/auth/store';
import { noticeRefusal } from '../../lib/apiAuth';
import { useAppStore } from '../../store/app';
import { jobErrorText, newestAssetJob } from '../../features/elements/assetJobs';
import { isIfcFileName, useElementStore } from '../../features/elements/store';
import { loadedTileset, useTiles3dLayerStore, type Tiles3dLayer } from '../../store/tiles3dLayers';
import { useOgcLayerStore } from '../../store/ogcLayers';
import { useOpenCzmlAssetStore } from '../../store/openCzmlAssets';
import { removeTerrainBundle, setTerrainBundle } from '../../features/terrain/bundles';

// nginx /api/ is ptolemy; /tiles/ rewrites to tiletopia /api/
const API = '/tiles/v1';
const POLL_MS = 3000;
const ACCEPT =
  '.las,.laz,.e57,.ply,.tif,.tiff,.hgt,.dt0,.dt1,.dt2,.gltf,.glb,.obj,.fbx,.ifc,.ifczip,.dae,.jpg,.jpeg,.png,.jp2,.j2k,.czml,.zip';

type AssetStatus = 'uploading' | 'tiling' | 'ready' | 'error';

const imageryTileTemplate = (assetId: string) => `${API}/assets/${assetId}/imagery/{z}/{x}/{y}.png`;

interface Asset {
  id: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  sizeBytes: number;
  /** How far its tiling job has got, 0..1. Unset until the job reports. */
  tilingProgress?: number;
  tilingError?: string;
  tilingWarning?: string;
  tilingReportRead?: boolean;
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function parseAsset(raw: unknown): Asset | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a.id !== 'string') return null;
  const status = a.status;
  return {
    id: a.id,
    name: typeof a.name === 'string' && a.name ? a.name : a.id,
    assetType: typeof a.asset_type === 'string' ? a.asset_type : 'unknown',
    status:
      status === 'uploading' || status === 'tiling' || status === 'ready' || status === 'error'
        ? status
        : 'error',
    sizeBytes: typeof a.size_bytes === 'number' ? a.size_bytes : 0,
  };
}

/** The tiling job an upload queued, absent for a type that tiles on demand. */
function jobIdOf(raw: unknown): string | null {
  const id = (raw as Record<string, unknown> | null)?.job_id;
  return typeof id === 'string' ? id : null;
}

/**
 * The job behind an asset this session did not upload, so a tiling row survives
 * a reload. No job is the normal answer for a type that tiles on demand.
 */
async function newestJobId(assetId: string): Promise<string | null> {
  const job = await newestAssetJob(assetId).catch(() => null);
  const id = job?.id;
  return typeof id === 'string' ? id : null;
}

/** A tiling job's progress, 0..1, or null when the server sent no number. */
function parseJobProgress(raw: unknown): number | null {
  const progress = (raw as Record<string, unknown> | null)?.progress;
  return typeof progress === 'number' && Number.isFinite(progress) ? progress : null;
}

function parsePhotoSetPresetNames(raw: unknown): string[] {
  const presets = (raw as Record<string, unknown> | null)?.presets;
  if (!Array.isArray(presets)) return [];
  return presets.flatMap((preset) => (typeof preset?.name === 'string' ? [preset.name] : []));
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} kB`;
  return `${bytes} B`;
}

function assetLayer(asset: Asset): Tiles3dLayer {
  return {
    id: asset.id,
    name: asset.name,
    url: `${API}/assets/${asset.id}/tileset.json`,
    visible: true,
  };
}

const STATUS_COLOR: Record<AssetStatus, string> = {
  uploading: 'yellow',
  tiling: 'yellow',
  ready: 'green',
  error: 'red',
};

function ImageryServiceUrls({ asset }: { asset: Asset }) {
  const imageryUrl = `${window.location.origin}${API}/assets/${asset.id}/imagery`;
  const services = [
    { label: 'WMTS capabilities', url: `${imageryUrl}/wmts/1.0.0/WMTSCapabilities.xml` },
    { label: 'TMS tile map', url: `${imageryUrl}/tms/tilemapresource.xml` },
    { label: 'TMS tiles', url: `${imageryUrl}/tms/{z}/{x}/{y}.png` },
  ];
  return (
    <Stack gap={2}>
      {services.map(({ label, url }) => (
        <Group key={label} gap={4} wrap="nowrap" align="flex-end">
          <TextInput size="xs" flex={1} label={label} value={url} readOnly />
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <ActionIcon
                size="sm"
                variant="subtle"
                color={copied ? 'green' : 'violet'}
                title={`Copy ${label} URL of ${asset.name}`} aria-label={`Copy ${label} URL of ${asset.name}`}
                onClick={copy}
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            )}
          </CopyButton>
        </Group>
      ))}
    </Stack>
  );
}

interface PlacementStep {
  kind: 'model' | 'image';
  required: boolean;
}

const MODEL_NEEDS_PLACEMENT: PlacementStep = { kind: 'model', required: true };
// tiletopia falls back to an IFC file's IFCSITE coordinates
const MODEL_MAY_NAME_ITS_SITE: PlacementStep = { kind: 'model', required: false };
// tiletopia refuses a JPEG or PNG with no world_file or bounds
const IMAGE_NEEDS_PLACEMENT: PlacementStep = { kind: 'image', required: true };
// tiletopia falls back to a JPEG 2000 file's GeoJP2 and GMLJP2 boxes
const IMAGE_MAY_HOLD_PLACEMENT: PlacementStep = { kind: 'image', required: false };

const PLACEMENT_STEP_BY_EXTENSION = new Map<string, PlacementStep>([
  ['gltf', MODEL_NEEDS_PLACEMENT],
  ['glb', MODEL_NEEDS_PLACEMENT],
  ['obj', MODEL_NEEDS_PLACEMENT],
  ['fbx', MODEL_NEEDS_PLACEMENT],
  ['dae', MODEL_NEEDS_PLACEMENT],
  ['ifc', MODEL_MAY_NAME_ITS_SITE],
  ['ifczip', MODEL_MAY_NAME_ITS_SITE],
  ['jpg', IMAGE_NEEDS_PLACEMENT],
  ['jpeg', IMAGE_NEEDS_PLACEMENT],
  ['png', IMAGE_NEEDS_PLACEMENT],
  ['jp2', IMAGE_MAY_HOLD_PLACEMENT],
  ['j2k', IMAGE_MAY_HOLD_PLACEMENT],
]);

const PLACEMENT_HINT = {
  model: {
    required: 'This file has no placement. Give the longitude and latitude to put it at.',
    optional: 'Leave these blank if the IFC file names its site coordinates.',
  },
  image: {
    required: 'This image has no placement. Give bounds or a world file, with a CRS.',
    optional: 'Leave these blank if the file holds its placement in GeoJP2 or GMLJP2 boxes.',
  },
};

interface PlacementText {
  longitude: string;
  latitude: string;
  bounds: string;
  worldFile: string;
  crs: string;
}

const EMPTY_PLACEMENT: PlacementText = {
  longitude: '',
  latitude: '',
  bounds: '',
  worldFile: '',
  crs: '',
};

class PlacementError extends Error {}

const DECIMAL_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

const readNumber = (text: string) => (DECIMAL_NUMBER.test(text) ? Number(text) : NaN);

function modelPlacementFields(text: PlacementText, required: boolean): Record<string, string> {
  const longitude = text.longitude.trim();
  const latitude = text.latitude.trim();
  if (!required && !longitude && !latitude) return {};
  if (!(Math.abs(readNumber(longitude)) <= 180)) {
    throw new PlacementError('Longitude must be a number from -180 to 180.');
  }
  if (!(Math.abs(readNumber(latitude)) <= 90)) {
    throw new PlacementError('Latitude must be a number from -90 to 90.');
  }
  return { longitude, latitude };
}

function checkBounds(bounds: string): void {
  const values = bounds.split(',').map((part) => readNumber(part.trim()));
  const [west, south, east, north] = values;
  if (values.length !== 4 || !(west < east) || !(south < north)) {
    throw new PlacementError(
      'Bounds must be west,south,east,north in CRS units, with west below east and south below north.',
    );
  }
}

function checkWorldFile(worldFile: string): void {
  const values = worldFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(readNumber);
  const [xScale, yRotation, xRotation, yScale] = values;
  if (values.length !== 6 || !values.every(Number.isFinite)) {
    throw new PlacementError('A world file must be 6 lines, each a number.');
  }
  if (xRotation !== 0 || yRotation !== 0) {
    throw new PlacementError('A rotated world file is refused, north must be up.');
  }
  if (!(xScale > 0) || !(yScale < 0)) {
    throw new PlacementError('A world file needs a positive x pixel size and a negative y one.');
  }
}

function imagePlacementFields(text: PlacementText, required: boolean): Record<string, string> {
  const bounds = text.bounds.trim();
  const worldFile = text.worldFile.trim();
  const crs = text.crs.trim();
  if (!required && !bounds && !worldFile && !crs) return {};
  if (bounds && worldFile) {
    throw new PlacementError('Bounds and a world file both place the image, give one of them.');
  }
  if (required && !bounds && !worldFile) {
    throw new PlacementError('This image needs bounds or a world file.');
  }
  if (!/^(EPSG:)?\d+$/i.test(crs)) {
    throw new PlacementError('CRS must be an EPSG code such as EPSG:32632.');
  }
  if (bounds) checkBounds(bounds);
  if (worldFile) checkWorldFile(worldFile);
  return {
    crs,
    ...(bounds ? { bounds } : {}),
    ...(worldFile ? { world_file: worldFile } : {}),
  };
}

function PlacementForm({
  file,
  step,
  onUpload,
  onCancel,
}: {
  file: File;
  step: PlacementStep;
  onUpload: (fields: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(EMPTY_PLACEMENT);
  const [problem, setProblem] = useState<string | null>(null);
  const inputProps = (name: keyof PlacementText) => ({
    size: 'xs',
    value: text[name],
    onChange: (event: { currentTarget: { value: string } }) =>
      setText({ ...text, [name]: event.currentTarget.value }),
  });
  const submit = () => {
    const readFields = step.kind === 'model' ? modelPlacementFields : imagePlacementFields;
    try {
      onUpload(readFields(text, step.required));
    } catch (failure) {
      if (!(failure instanceof PlacementError)) throw failure;
      setProblem(failure.message);
    }
  };
  return (
    <Stack gap={4} mb="xs" data-testid="assets-placement">
      <Text size="xs" c="dimmed">
        {file.name}: {PLACEMENT_HINT[step.kind][step.required ? 'required' : 'optional']}
      </Text>
      {step.kind === 'model' ? (
        <Group gap={4} wrap="nowrap" grow>
          <TextInput label="Longitude" placeholder="12.35" {...inputProps('longitude')} />
          <TextInput label="Latitude" placeholder="45.45" {...inputProps('latitude')} />
        </Group>
      ) : (
        <>
          <TextInput
            label="Bounds"
            placeholder="west,south,east,north"
            {...inputProps('bounds')}
          />
          <Textarea label="World file" rows={3} {...inputProps('worldFile')} />
          <TextInput label="CRS" placeholder="EPSG:32632" {...inputProps('crs')} />
        </>
      )}
      {problem && (
        <Text size="xs" c="red" data-testid="assets-placement-error">
          {problem}
        </Text>
      )}
      <Group gap={4} wrap="nowrap">
        <Button size="compact-xs" color="violet" onClick={submit}>
          Upload file
        </Button>
        <Button size="compact-xs" variant="default" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

export function AssetsPanel({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [serviceUrlsAssetId, setServiceUrlsAssetId] = useState<string | null>(null);
  const [openingCzmlAssetId, setOpeningCzmlAssetId] = useState<string | null>(null);
  const [pendingPhotoSet, setPendingPhotoSet] = useState<File | null>(null);
  const [photoSetPresetNames, setPhotoSetPresetNames] = useState<string[]>([]);
  const [photoSetPresetName, setPhotoSetPresetName] = useState<string | null>(null);
  const [nodeOdmMissing, setNodeOdmMissing] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{
    file: File;
    step: PlacementStep;
  } | null>(null);
  const resetFileInput = useRef<() => void>(null);
  const added = useTiles3dLayerStore((s) => s.layers);
  const ogcLayers = useOgcLayerStore((s) => s.layers);
  const openCzmlAssets = useOpenCzmlAssetStore((s) => s.openAssets);

  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const renderer = useAppStore((s) => s.renderer);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    setViewer(getActiveCesiumViewer());
    if (renderer !== 'cesium') return;
    const timer = setInterval(() => {
      const v = getActiveCesiumViewer();
      if (v) {
        setViewer(v);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [renderer]);

  const poll = useCallback(({ id, name }: Asset, uploadJobId: string | null = null) => {
    if (timers.current.has(id)) return;
    let jobId = uploadJobId;
    let jobLookedUp = uploadJobId !== null;
    const stop = () => {
      const t = timers.current.get(id);
      if (t) clearInterval(t);
      timers.current.delete(id);
    };
    // tiletopia answers another owner's asset or job with the 404 of a missing one
    const stopOnRefusal = (status: number) => {
      stop();
      setError(
        `${name} stopped updating: the asset service answered HTTP ${status}. A 404 means it was deleted or belongs to another user.`,
      );
    };
    const readJob = async () => {
      const res = await fetch(`${API}/jobs/${jobId}`, { headers: authHeaders() }).catch(
        () => null,
      );
      if (res) noticeRefusal(res.status);
      if (res?.status === 404) stopOnRefusal(res.status);
      if (!res?.ok) return null;
      const job = await res.json().catch(() => null);
      const progress = parseJobProgress(job);
      const tilingError = jobErrorText(job);
      setAssets((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                tilingProgress: progress ?? a.tilingProgress,
                tilingError: tilingError ?? a.tilingError,
              }
            : a,
        ),
      );
      return tilingError;
    };
    const tick = async () => {
      const res = await fetch(`${API}/assets/${id}`, { headers: authHeaders() }).catch(() => null);
      if (res) noticeRefusal(res.status);
      // photo set jobs run for hours and outlast network drops and nginx 502s
      if (!res || res.status >= 500) return;
      if (!res.ok) {
        stopOnRefusal(res.status);
        return;
      }
      const asset = parseAsset(await res.json().catch(() => null));
      if (!asset) {
        stop();
        return;
      }
      // spread over the previous row: the asset endpoint knows nothing of the
      // job, so a plain replace would drop the progress read from it
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...asset } : a)));
      if (asset.status === 'ready') {
        stop();
        return;
      }
      if (!jobLookedUp) {
        jobLookedUp = true;
        jobId = await newestJobId(id);
      }
      const tilingError = jobId ? await readJob() : null;
      // tiletopia marks the asset as error before it writes the job's error
      if (asset.status === 'error' && (!jobId || tilingError)) stop();
    };
    timers.current.set(
      id,
      setInterval(() => void tick(), POLL_MS),
    );
  }, []);

  const refresh = useCallback(async () => {
    // without a token every call can only answer 401, so we never send one
    if (!getAuthToken()) {
      setNeedsSignIn(true);
      setAssets([]);
      return;
    }
    setNeedsSignIn(false);
    setLoading(true);
    setError(null);
    const res = await fetch(`${API}/assets`, { headers: authHeaders() }).catch(() => null);
    setLoading(false);
    if (res) noticeRefusal(res.status);
    if (!res) {
      setError('The asset service is unreachable.');
      return;
    }
    if (res.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    if (!res.ok) {
      setError(`Asset list failed with HTTP ${res.status}`);
      return;
    }
    const body = await res.json().catch(() => null);
    const list = (Array.isArray(body) ? body : []).flatMap((raw) => {
      const a = parseAsset(raw);
      return a ? [a] : [];
    });
    setAssets(list);
    for (const a of list) {
      if (a.status !== 'ready') poll(a);
    }
  }, [poll]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running.values()) clearInterval(t);
      running.clear();
    };
  }, []);

  const upload = (file: File, uploadFields: Record<string, string> = {}) => {
    setError(null);
    setUploadPct(0);
    const form = new FormData();
    form.append('name', file.name);
    for (const [name, value] of Object.entries(uploadFields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/assets`);
    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadPct(null);
      noticeRefusal(xhr.status);
      if (xhr.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (xhr.status === 400 && xhr.responseText) {
        setError(xhr.responseText);
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        setError(`Upload failed with HTTP ${xhr.status}`);
        return;
      }
      let asset: Asset | null = null;
      let jobId: string | null = null;
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        asset = parseAsset(body);
        jobId = jobIdOf(body);
      } catch {
        asset = null;
      }
      if (!asset) {
        setError('The server returned an asset we could not read.');
        return;
      }
      const created = asset;
      setAssets((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      if (created.status !== 'ready' && created.status !== 'error') poll(created, jobId);
    };
    xhr.onerror = () => {
      setUploadPct(null);
      setError('Upload failed. The asset service is unreachable.');
    };
    xhr.send(form);
  };

  const loadPhotoSetPresetNames = async () => {
    const res = await fetch(`${API}/photogrammetry/presets`, { headers: authHeaders() }).catch(
      () => null,
    );
    if (res) noticeRefusal(res.status);
    if (!res?.ok) return;
    const body: unknown = await res.json().catch(() => null);
    setPhotoSetPresetNames(parsePhotoSetPresetNames(body));
    setNodeOdmMissing((body as Record<string, unknown> | null)?.configured === false);
  };

  const chooseFile = (file: File | null) => {
    // browsers fire no change event when the file already in the input is picked again
    resetFileInput.current?.();
    if (!file) return;
    setPendingPhotoSet(null);
    setPendingPlacement(null);
    if (file.name.toLowerCase().endsWith('.zip')) {
      setError(null);
      setPendingPhotoSet(file);
      void loadPhotoSetPresetNames();
      return;
    }
    const step = PLACEMENT_STEP_BY_EXTENSION.get(file.name.toLowerCase().split('.').pop() ?? '');
    if (step) {
      setError(null);
      setPendingPlacement({ file, step });
      return;
    }
    upload(file);
  };

  const remove = async (id: string) => {
    setConfirmId(null);
    setError(null);
    const res = await fetch(`${API}/assets/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).catch(() => null);
    if (res) noticeRefusal(res.status);
    if (!res?.ok) {
      setError(res ? `Delete failed with HTTP ${res.status}` : 'The asset service is unreachable.');
      return;
    }
    const t = timers.current.get(id);
    if (t) clearInterval(t);
    timers.current.delete(id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
    useOpenCzmlAssetStore.getState().closeAsset(id);
    // the panel adds a layer under /tiles/v1, chat under an absolute url, and tiletopia's WMTS template names /api/v1
    const assetUrlPath = `/v1/assets/${id}/`;
    for (const store of [useOgcLayerStore, useTiles3dLayerStore]) {
      const { layers, removeLayer } = store.getState();
      for (const layer of layers) {
        if (layer.url.includes(assetUrlPath)) removeLayer(layer.id);
      }
    }
    if (viewer) removeTerrainBundle(viewer, id);
  };

  // the layer is what draws the model, on this globe and on every member's of a
  // live map. tileset.json and its tiles are public reads, so no token here
  const addToGlobe = async (asset: Asset) => {
    if (!viewer) return;
    setError(null);
    useTiles3dLayerStore.getState().putLayer(assetLayer(asset));
    const tileset = await loadedTileset(asset.id);
    if (!tileset) {
      setError(`${asset.name} failed to load. Its layer row says why.`);
      return;
    }
    await flyToTileset(viewer, tileset);
  };

  const readTilingReport = async (asset: Asset) => {
    setError(null);
    try {
      const tilingWarning = jobErrorText(await newestAssetJob(asset.id)) ?? undefined;
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, tilingWarning, tilingReportRead: true } : a)),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const openElements = (asset: Asset) => {
    if (!added.some((layer) => layer.id === asset.id)) void addToGlobe(asset);
    useElementStore.getState().openModel(assetLayer(asset));
    useAppStore.getState().setActivePanel('modelElements');
  };

  const setTerrain = async (asset: Asset) => {
    if (!viewer) return;
    setError(null);
    try {
      // tiletopia writes a DEM upload's terrain bundle under the asset id
      await setTerrainBundle(viewer, asset.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const openCzml = async (asset: Asset) => {
    if (!viewer) return;
    setError(null);
    setOpeningCzmlAssetId(asset.id);
    try {
      // CzmlDataSource.load names an unnamed data source after the url's last segment, "czml" here
      const dataSource = await new CzmlDataSource(asset.name).load(
        `${API}/assets/${asset.id}/czml`,
      );
      await viewer.dataSources.add(dataSource);
      useOpenCzmlAssetStore.getState().putOpenAsset(asset.id, { viewer, dataSource });
      await viewer.flyTo(dataSource);
    } catch (failure) {
      // cesium's rejections carry the inner error on later lines, often as a bare "undefined"
      const message = (failure instanceof Error ? failure.message : String(failure)).split('\n')[0];
      setError(`${asset.name} did not load: ${message}`);
    } finally {
      setOpeningCzmlAssetId(null);
    }
  };

  const addAction = (asset: Asset) => {
    const notReady = asset.status !== 'ready';
    if (asset.assetType === 'czml') {
      if (openCzmlAssets[asset.id]?.viewer === viewer) {
        return {
          label: `Remove ${asset.name} from globe`,
          icon: <IconWorldOff size={14} />,
          disabled: false,
          run: () => useOpenCzmlAssetStore.getState().closeAsset(asset.id),
        };
      }
      return {
        label: `Add ${asset.name} to globe`,
        icon: <IconWorldUpload size={14} />,
        disabled: notReady || !viewer || openingCzmlAssetId === asset.id,
        run: () => void openCzml(asset),
      };
    }
    if (asset.assetType === 'imagery') {
      const template = imageryTileTemplate(asset.id);
      return {
        label: `Add ${asset.name} as a map layer`,
        icon: <IconPhoto size={14} />,
        disabled: notReady || ogcLayers.some((layer) => layer.url === template),
        run: () => {
          useOgcLayerStore.getState().addXyzLayer(asset.name, template);
        },
      };
    }
    if (asset.assetType === 'terrain') {
      return {
        label: `Use ${asset.name} as globe terrain`,
        icon: <IconMountain size={14} />,
        disabled: notReady || !viewer,
        run: () => void setTerrain(asset),
      };
    }
    return {
      label: `Add ${asset.name} to globe`,
      icon: <IconWorldUpload size={14} />,
      disabled: notReady || !viewer || added.some((layer) => layer.id === asset.id),
      run: () => void addToGlobe(asset),
    };
  };

  const addButton = (asset: Asset) => {
    const action = addAction(asset);
    return (
      <ActionIcon
        size="sm"
        variant="subtle"
        color="violet"
        title={action.label} aria-label={action.label}
        disabled={action.disabled}
        onClick={action.run}
      >
        {action.icon}
      </ActionIcon>
    );
  };

  return (
    <PanelCard width={320} maxHeight="60vh">
      <PanelHeader
        icon={<IconPackage size={16} />}
        title="Assets"
        onClose={onClose}
        badge={
          <Badge size="xs" variant="light" color="violet">
            {assets.length}
          </Badge>
        }
        actions={
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            title="Refresh assets" aria-label="Refresh assets"
            loading={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      {needsSignIn ? (
        <Text size="xs" c="dimmed" py="lg" ta="center" data-testid="assets-signin">
          Sign in to browse and upload assets.
        </Text>
      ) : (
        <>
          <FileButton onChange={chooseFile} accept={ACCEPT} resetRef={resetFileInput}>
            {(props) => (
              <Button
                size="xs"
                variant="subtle"
                color="violet"
                leftSection={<IconUpload size={14} />}
                mb="xs"
                fullWidth
                loading={uploadPct !== null}
                {...props}
              >
                Upload and tile
              </Button>
            )}
          </FileButton>

          {pendingPhotoSet && (
            <Stack gap={4} mb="xs" data-testid="assets-photo-set">
              <Text size="xs" c="dimmed">
                {pendingPhotoSet.name} uploads as a photo set: a .zip of .jpg or .jpeg photos with
                EXIF GPS. Its reconstruction can run for hours.
              </Text>
              {nodeOdmMissing && (
                <Text size="xs" c="red" data-testid="assets-photo-set-refused">
                  This server cannot reconstruct a photo set: TILETOPIA_NODEODM_URL is not set on
                  tiletopia.
                </Text>
              )}
              {photoSetPresetNames.length > 0 && !nodeOdmMissing && (
                <Select
                  size="xs"
                  label="Preset"
                  placeholder="default"
                  data={photoSetPresetNames}
                  value={photoSetPresetName}
                  onChange={setPhotoSetPresetName}
                />
              )}
              <Group gap={4} wrap="nowrap">
                {!nodeOdmMissing && (
                  <Button
                    size="compact-xs"
                    color="violet"
                    onClick={() => {
                      upload(
                        pendingPhotoSet,
                        photoSetPresetName ? { photogrammetry_preset: photoSetPresetName } : {},
                      );
                      setPendingPhotoSet(null);
                    }}
                  >
                    Upload photo set
                  </Button>
                )}
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => setPendingPhotoSet(null)}
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}

          {pendingPlacement && (
            <PlacementForm
              key={`${pendingPlacement.file.name}-${pendingPlacement.file.lastModified}`}
              file={pendingPlacement.file}
              step={pendingPlacement.step}
              onUpload={(fields) => {
                upload(pendingPlacement.file, fields);
                setPendingPlacement(null);
              }}
              onCancel={() => setPendingPlacement(null)}
            />
          )}

          {uploadPct !== null && (
            <Progress
              size="xs"
              mb="xs"
              color="violet"
              value={uploadPct}
              data-testid="assets-upload-progress"
            />
          )}

          {error && (
            <Text size="xs" c="red" mb="xs" data-testid="assets-error">
              {error}
            </Text>
          )}

          <ScrollArea flex={1}>
            <Stack gap={4}>
              {assets.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="xl">
                  No assets. Upload a file to get started.
                </Text>
              ) : (
                assets.map((asset) => (
                  <Group
                    key={asset.id}
                    justify="space-between"
                    wrap="nowrap"
                    p="xs"
                    data-testid={`assets-row-${asset.id}`}
                    style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                  >
                    <Stack gap={2} flex={1} style={{ minWidth: 0 }}>
                      <Text size="xs" c="white" fw={500} truncate>
                        {asset.name}
                      </Text>
                      <Group gap={4}>
                        <Badge size="xs" variant="light">
                          {asset.assetType}
                        </Badge>
                        <Badge size="xs" variant="light" color={STATUS_COLOR[asset.status]}>
                          {asset.status}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatSize(asset.sizeBytes)}
                        </Text>
                      </Group>
                      {asset.tilingProgress !== undefined && asset.status === 'tiling' && (
                        <Progress
                          size="xs"
                          color="violet"
                          value={Math.round(asset.tilingProgress * 100)}
                          aria-label={`Tiling ${asset.name}`}
                          data-testid={`assets-tiling-${asset.id}`}
                        />
                      )}
                      {asset.status === 'error' && asset.tilingError && (
                        <Text
                          size="xs"
                          c="red"
                          lineClamp={4}
                          title={asset.tilingError}
                          data-testid={`assets-tiling-error-${asset.id}`}
                        >
                          {asset.tilingError}
                        </Text>
                      )}
                      {asset.status === 'ready' && asset.tilingWarning && (
                        <Group gap={4} wrap="nowrap" align="flex-start">
                          <IconAlertTriangle size={12} color="var(--mantine-color-yellow-5)" />
                          <Text
                            size="xs"
                            c="yellow"
                            lineClamp={4}
                            title={asset.tilingWarning}
                            data-testid={`assets-tiling-warning-${asset.id}`}
                          >
                            {asset.tilingWarning}
                          </Text>
                        </Group>
                      )}
                      {asset.status === 'ready' && asset.tilingReportRead && !asset.tilingWarning && (
                        <Text size="xs" c="dimmed" data-testid={`assets-tiling-clean-${asset.id}`}>
                          Its tiling job reported nothing lost.
                        </Text>
                      )}
                      {serviceUrlsAssetId === asset.id && <ImageryServiceUrls asset={asset} />}
                    </Stack>
                    {confirmId === asset.id ? (
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          color="red"
                          onClick={() => void remove(asset.id)}
                        >
                          Delete
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </Group>
                    ) : (
                      <Group gap={4} wrap="nowrap">
                        {asset.assetType === 'imagery' && asset.status === 'ready' && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="violet"
                            title={`Service URLs of ${asset.name}`} aria-label={`Service URLs of ${asset.name}`}
                            aria-expanded={serviceUrlsAssetId === asset.id}
                            onClick={() =>
                              setServiceUrlsAssetId((shown) =>
                                shown === asset.id ? null : asset.id,
                              )
                            }
                          >
                            <IconLink size={14} />
                          </ActionIcon>
                        )}
                        {asset.status === 'ready' && isIfcFileName(asset.name) && (
                          <>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="violet"
                              title={`Tiling report of ${asset.name}`} aria-label={`Tiling report of ${asset.name}`}
                              onClick={() => void readTilingReport(asset)}
                            >
                              <IconReportAnalytics size={14} />
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="violet"
                              title={`Elements of ${asset.name}`} aria-label={`Elements of ${asset.name}`}
                              disabled={!viewer}
                              onClick={() => openElements(asset)}
                            >
                              <IconHierarchy2 size={14} />
                            </ActionIcon>
                          </>
                        )}
                        {addButton(asset)}
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          title={`Delete ${asset.name}`} aria-label={`Delete ${asset.name}`}
                          onClick={() => setConfirmId(asset.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                ))
              )}
            </Stack>
          </ScrollArea>
        </>
      )}
    </PanelCard>
  );
}
