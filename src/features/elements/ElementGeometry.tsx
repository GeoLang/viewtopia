import { useEffect, useRef, useState } from 'react';
import { Button, Divider, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { noteElementEditsChanged } from '../scene/ElementEditPreviews';
import {
  editResultMessage,
  fetchElementVolume,
  parseMesh,
  parseNumbers,
  parseTriple,
  postElementEdit,
  type ElementEditRequest,
} from './elementEdits';

export function ElementGeometry({
  assetId,
  elementId,
  canEdit,
  signedIn,
}: {
  assetId: string;
  elementId: string;
  canEdit: boolean;
  signedIn: boolean;
}) {
  const [volume, setVolume] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState('0, 0, 0');
  const [radians, setRadians] = useState('0');
  const [origin, setOrigin] = useState('0, 0, 0');
  const [size, setSize] = useState('1, 1, 1');
  const [positions, setPositions] = useState('');
  const [indices, setIndices] = useState('');
  const [relationId, setRelationId] = useState('');
  const [addToRelation, setAddToRelation] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [shownElement, setShownElement] = useState(elementId);
  if (shownElement !== elementId) {
    setShownElement(elementId);
    setVolume(null);
    setFailure(null);
    setNotice(null);
    setConfirmingDelete(false);
  }
  const latestElement = useRef(elementId);
  useEffect(() => {
    latestElement.current = elementId;
  }, [elementId]);

  if (!signedIn) return null;

  const run = async (edit: ElementEditRequest) => {
    const askedFor = elementId;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await postElementEdit(assetId, edit);
      noteElementEditsChanged();
      if (latestElement.current !== askedFor) return;
      setNotice(editResultMessage(edit.kind, result.drawn, result.elementId));
      setConfirmingDelete(false);
    } catch (reason) {
      if (latestElement.current === askedFor) setFailure(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const readVolume = async () => {
    const askedFor = elementId;
    setBusy(true);
    setFailure(null);
    try {
      const volumeOfElement = await fetchElementVolume(assetId, askedFor);
      if (latestElement.current === askedFor) setVolume(volumeOfElement);
    } catch (reason) {
      if (latestElement.current === askedFor) setFailure(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const yaw = parseNumbers(radians);
  const relationNumbers = parseNumbers(relationId);
  const relation =
    relationNumbers?.length === 1 && Number.isInteger(relationNumbers[0]) && relationNumbers[0] >= 0
      ? relationNumbers[0]
      : null;

  return (
    <Stack gap={4} data-testid="element-geometry">
      <Divider label="Geometry" labelPosition="left" />
      <Group gap={4} wrap="nowrap">
        <Button size="compact-xs" variant="light" color="violet" loading={busy} onClick={() => void readVolume()}>
          Volume from mesh
        </Button>
        {volume !== null && (
          <Text size="xs" data-testid="element-volume">
            {volume.toFixed(3)} m³
          </Text>
        )}
      </Group>
      {canEdit && (
        <>
          <Text size="xs" c="dimmed">
            A move is in the parent placement. That is the model frame when no map conversion placed the file.
          </Text>
          <TextInput
            size="xs"
            label="Move dx, dy, dz"
            value={delta}
            onChange={(event) => setDelta(event.currentTarget.value)}
          />
          <Button
            size="compact-xs"
            variant="light"
            color="violet"
            disabled={busy || parseTriple(delta) === null}
            onClick={() => {
              const parsed = parseTriple(delta);
              if (parsed) void run({ kind: 'translate', elementId, delta: parsed });
            }}
          >
            Move
          </Button>
          <TextInput
            size="xs"
            label="Yaw in radians"
            value={radians}
            onChange={(event) => setRadians(event.currentTarget.value)}
          />
          <Button
            size="compact-xs"
            variant="light"
            color="violet"
            disabled={busy || yaw === null || yaw.length !== 1}
            onClick={() => {
              if (yaw?.length === 1) void run({ kind: 'yaw', elementId, radians: yaw[0] });
            }}
          >
            Rotate about Z
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            disabled={busy}
            onClick={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true);
                return;
              }
              void run({ kind: 'delete', elementId });
            }}
          >
            {confirmingDelete ? 'Delete this element from the IFC' : 'Delete element'}
          </Button>
          <TextInput
            size="xs"
            label="New box origin"
            value={origin}
            onChange={(event) => setOrigin(event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            label="New box size"
            value={size}
            onChange={(event) => setSize(event.currentTarget.value)}
          />
          <Button
            size="compact-xs"
            variant="light"
            color="violet"
            disabled={busy || parseTriple(origin) === null || parseTriple(size) === null}
            onClick={() => {
              const parsedOrigin = parseTriple(origin);
              const parsedSize = parseTriple(size);
              if (parsedOrigin && parsedSize) void run({ kind: 'add', origin: parsedOrigin, size: parsedSize });
            }}
          >
            Add a box
          </Button>
          <TextInput
            size="xs"
            label="Replacement positions"
            placeholder="x, y, z, x, y, z"
            value={positions}
            onChange={(event) => setPositions(event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            label="Replacement indices"
            placeholder="0, 1, 2"
            value={indices}
            onChange={(event) => setIndices(event.currentTarget.value)}
          />
          <Button
            size="compact-xs"
            variant="light"
            color="violet"
            disabled={busy || parseMesh(positions, indices) === null}
            onClick={() => {
              const mesh = parseMesh(positions, indices);
              if (mesh) void run({ kind: 'replace', elementId, ...mesh });
            }}
          >
            Replace mesh
          </Button>
          <TextInput
            size="xs"
            label="Relation express id"
            value={relationId}
            onChange={(event) => setRelationId(event.currentTarget.value)}
          />
          <Switch
            size="xs"
            color="violet"
            checked={addToRelation}
            onChange={(event) => setAddToRelation(event.currentTarget.checked)}
            label="Add this element to the relation"
          />
          <Button
            size="compact-xs"
            variant="light"
            color="violet"
            disabled={busy || relation === null}
            onClick={() => {
              if (relation !== null) void run({ kind: 'relation', elementId, relationId: relation, add: addToRelation });
            }}
          >
            {addToRelation ? 'Add to relation' : 'Remove from relation'}
          </Button>
        </>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="element-geometry-notice">
          {notice}
        </Text>
      )}
      {failure && (
        <Text size="xs" c="red" data-testid="element-geometry-error">
          {failure}
        </Text>
      )}
    </Stack>
  );
}
