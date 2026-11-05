import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  FileButton,
  Group,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  compareVersions,
  exportDxf,
  listElementChanges,
  listModelVersions,
  pollChangeReport,
  saveDownloadedFile,
  uploadModelVersion,
  type ChangeKind,
  type ChangeReport,
  type ElementChange,
  type ModelVersion,
} from './api';
import { failureText, useShowElementInScene } from './showElementInScene';

const MODEL_FILES = '.ifc,.ifczip';
const ALL_KINDS = 'all';

function isOpenVersion(version: ModelVersion, assetId: string): boolean {
  return version.id === assetId || String(version.assetId) === assetId;
}

function versionLabel(version: ModelVersion): string {
  return `Version ${version.versionNumber}, ${version.name}`;
}

function changeText(change: ElementChange): string {
  const parts = [...change.changedKeys];
  if (change.geometryChanged) parts.push('geometry');
  if (change.locationChanged) parts.push('location');
  return parts.join(', ');
}

function ChangeList({
  report,
  assetId,
  canShowInScene,
}: {
  report: ChangeReport;
  assetId: string;
  canShowInScene: boolean;
}) {
  const { showElement, showNote, showError } = useShowElementInScene(assetId);
  const [kind, setKind] = useState<ChangeKind | typeof ALL_KINDS>(ALL_KINDS);
  const [changes, setChanges] = useState<ElementChange[]>([]);
  const [nextPage, setNextPage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const kindFilter = kind === ALL_KINDS ? undefined : kind;
  const shownError = showError ?? error;

  const showChange = (change: ElementChange) => {
    const name = change.label ?? change.id;
    return showElement(change.id, {
      name,
      notInModelNote:
        change.kind === 'removed'
          ? `${name} was removed, so the open version of the model does not have it.`
          : `${name} is not in the open version of the model. Open the version that holds it to see it.`,
    });
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listElementChanges(report.id, { kind: kindFilter })
      .then((page) => {
        if (cancelled) return;
        setChanges(page.items);
        setNextPage(page.continuationToken);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failureText(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [report.id, kindFilter]);

  const readMore = () => {
    listElementChanges(report.id, { kind: kindFilter, continuationToken: nextPage })
      .then((page) => {
        setChanges((known) => [...known, ...page.items]);
        setNextPage(page.continuationToken);
      })
      .catch((failure: unknown) => setError(failureText(failure)));
  };

  const { added, removed, changed, unchanged } = report.summary;
  return (
    <Stack gap={4} data-testid="change-report">
      <Text size="xs" data-testid="change-summary">
        {added} added, {removed} removed, {changed} changed, {unchanged} unchanged.
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={kind}
        onChange={(value) => setKind(value as ChangeKind | typeof ALL_KINDS)}
        data={[
          { value: ALL_KINDS, label: 'All' },
          { value: 'added', label: 'Added' },
          { value: 'removed', label: 'Removed' },
          { value: 'changed', label: 'Changed' },
        ]}
      />
      {canShowInScene ? (
        <Text size="xs" c="dimmed">
          Click a change to select its element in the open version and fly to it.
        </Text>
      ) : (
        <Text size="xs" c="dimmed" data-testid="change-show-note">
          Changes show in the scene once the open version has loaded on the Cesium globe with element ids.
        </Text>
      )}
      {shownError && (
        <Text size="xs" c="red" data-testid="change-list-error">
          {shownError}
        </Text>
      )}
      {showNote && (
        <Text size="xs" c="yellow" data-testid="change-show-result">
          {showNote}
        </Text>
      )}
      <ScrollArea.Autosize mah={220}>
        <Stack gap={2} data-testid="change-rows">
          {changes.map((change) => (
            <UnstyledButton
              key={`${change.kind}-${change.id}`}
              data-testid={`change-${change.id}`}
              disabled={!canShowInScene}
              onClick={() => void showChange(change)}
              style={{ padding: '2px 4px', borderRadius: 4 }}
            >
              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light" color={change.kind === 'changed' ? 'yellow' : 'gray'}>
                  {change.kind}
                </Badge>
                <Text size="xs" lineClamp={1}>
                  {change.label ?? change.id} ({change.ifcClass})
                </Text>
              </Group>
              {change.kind === 'changed' && (
                <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {changeText(change)}
                </Text>
              )}
            </UnstyledButton>
          ))}
          {nextPage !== undefined && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={readMore}>
              More changes
            </Button>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function DxfExport({ assetId }: { assetId: string }) {
  const [cutHeight, setCutHeight] = useState<string | number>('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportFile = async () => {
    setError(null);
    setExporting(true);
    try {
      saveDownloadedFile(await exportDxf(assetId, typeof cutHeight === 'number' ? cutHeight : undefined));
    } catch (failure) {
      setError(failureText(failure));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack gap={4}>
      <Divider label="DXF export" labelPosition="left" />
      <Group gap={4} wrap="nowrap" align="flex-end">
        <NumberInput
          size="xs"
          flex={1}
          label="Cut height in metres, blank for the whole model"
          value={cutHeight}
          onChange={setCutHeight}
        />
        <Button size="xs" variant="light" color="violet" loading={exporting} onClick={() => void exportFile()}>
          Export DXF
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        3D faces in the model's own metres with Z up, not georeferenced. A cut keeps what lies at or below the
        height, with no 2D section lines.
      </Text>
      {error && (
        <Text size="xs" c="red" data-testid="dxf-error">
          {error}
        </Text>
      )}
    </Stack>
  );
}

export function ModelVersions({ assetId, canShowInScene }: { assetId: string; canShowInScene: boolean }) {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [listReads, setListReads] = useState(0);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [report, setReport] = useState<ChangeReport | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resetFileInput = useRef<() => void>(null);
  const comparison = useRef<{ running: AbortController | null }>({ running: null });

  useEffect(() => {
    const comparing = comparison.current;
    return () => comparing.running?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    listModelVersions(assetId)
      .then((read) => {
        if (cancelled) return;
        setVersions(read);
        const comparable = read.filter((version) => version.hasElementStore);
        setToId((chosen) => chosen ?? comparable[0]?.id ?? null);
        setFromId((chosen) => chosen ?? comparable[1]?.id ?? null);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failureText(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, listReads]);

  const uploadFile = async (file: File | null) => {
    // browsers fire no change event when the file already in the input is picked again
    resetFileInput.current?.();
    if (!file) return;
    setError(null);
    setNotice(null);
    setUploading(file.name);
    try {
      const uploaded = await uploadModelVersion(assetId, file);
      setNotice(`${uploaded.name} is the next version of this model and is being tiled.`);
      setListReads((reads) => reads + 1);
    } catch (failure) {
      setError(failureText(failure));
    } finally {
      setUploading(null);
    }
  };

  const compare = async () => {
    if (fromId === null || toId === null) return;
    comparison.current.running?.abort();
    const controller = new AbortController();
    comparison.current.running = controller;
    setError(null);
    setReport(null);
    try {
      const started = await compareVersions(fromId, toId);
      if (controller.signal.aborted) return;
      setReport(started);
      await pollChangeReport(started.id, { onUpdate: setReport, signal: controller.signal });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureText(failure));
    }
  };

  const comparable = versions
    .filter((version) => version.hasElementStore)
    .map((version) => ({ value: version.id, label: versionLabel(version) }));
  const reportRunning = report !== null && (report.status === 'NOT_STARTED' || report.status === 'IN_PROGRESS');

  return (
    <Stack gap="xs" data-testid="model-versions">
      <Group gap={4}>
        <FileButton onChange={(file) => void uploadFile(file)} accept={MODEL_FILES} resetRef={resetFileInput}>
          {(props) => (
            <Button {...props} size="compact-xs" variant="light" color="violet" loading={uploading !== null}>
              Upload new version
            </Button>
          )}
        </FileButton>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setListReads((reads) => reads + 1)}>
          Refresh
        </Button>
      </Group>
      {uploading && (
        <Text size="xs" c="dimmed" data-testid="version-uploading">
          Uploading {uploading}.
        </Text>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="version-notice">
          {notice}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" data-testid="versions-error">
          {error}
        </Text>
      )}
      <Stack gap={2} data-testid="version-rows">
        {versions.map((version) => (
          <Group key={version.id} gap={4} wrap="nowrap" justify="space-between" data-testid={`version-${version.id}`}>
            <Text size="xs" lineClamp={1} fw={isOpenVersion(version, assetId) ? 600 : undefined}>
              {versionLabel(version)}
              {isOpenVersion(version, assetId) ? ' (open)' : ''}
            </Text>
            <Badge size="xs" variant="light" color={version.status === 'error' ? 'red' : 'gray'}>
              {version.status}
            </Badge>
          </Group>
        ))}
      </Stack>

      <Divider label="Change report" labelPosition="left" />
      {comparable.length < 2 ? (
        <Text size="xs" c="dimmed" data-testid="compare-unavailable">
          A change report needs two tiled versions with element stores.
        </Text>
      ) : (
        <Stack gap={4}>
          <Group gap={4} wrap="nowrap" grow>
            <Select size="xs" label="From" allowDeselect={false} data={comparable} value={fromId} onChange={setFromId} />
            <Select size="xs" label="To" allowDeselect={false} data={comparable} value={toId} onChange={setToId} />
          </Group>
          <Button
            size="xs"
            variant="light"
            color="violet"
            loading={reportRunning}
            disabled={fromId === null || toId === null || fromId === toId}
            onClick={() => void compare()}
          >
            Compare
          </Button>
        </Stack>
      )}
      {reportRunning && (
        <Text size="xs" c="dimmed" data-testid="change-report-running">
          Comparing the two versions.
        </Text>
      )}
      {report?.status === 'ERROR' && (
        <Text size="xs" c="red" data-testid="change-report-error">
          The comparison failed: {report.error}
        </Text>
      )}
      {report?.status === 'COMPLETE' && (
        <ChangeList report={report} assetId={assetId} canShowInScene={canShowInScene} />
      )}

      <DxfExport assetId={assetId} />
    </Stack>
  );
}
