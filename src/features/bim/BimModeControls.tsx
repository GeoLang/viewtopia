import { useEffect, useState } from 'react';
import { Button, Divider, SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import type { Cesium3DTileset } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useElementStore, type ElementModel } from '../elements/store';
import { endStoreyView, enterBimMode, leaveBimMode, setBimNavigation } from './bimMode';
import { readEdgeData, setEdgesShown, type EdgeData } from './edges';
import { bimStoreys, removeSection, sectionAtHeight, showStorey, storeyTop, type Storey } from './storeys';
import {
  storeyViewShowing,
  useBimModeStore,
  type BimNavigation,
  type BimSession,
  type StoreyScope,
} from './store';

const CHECKING_EDGES = 'checking';

const EDGE_NOTES: Record<Exclude<EdgeData, 'present'> | typeof CHECKING_EDGES, string> = {
  checking: 'Reading one tile to see whether it has edge data.',
  'not loaded': 'No tile has loaded yet, so edge data is unchecked.',
  absent:
    'CAD edges are unavailable: the tiles of this model have no EXT_mesh_primitive_edge_visibility data to draw.',
};

function failureText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

function CadEdges({ tileset }: { tileset: Cesium3DTileset }) {
  const edgesShown = useBimModeStore((state) => state.edgesShown);
  const [edgeData, setEdgeData] = useState<EdgeData | typeof CHECKING_EDGES>(CHECKING_EDGES);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopListening: (() => void) | undefined;
    const check = () => {
      stopListening?.();
      stopListening = undefined;
      readEdgeData(tileset)
        .then((found) => {
          if (cancelled) return;
          setEdgeData(found);
          if (found === 'not loaded') stopListening = tileset.tileLoad.addEventListener(check);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setFailure(failureText(reason));
        });
    };
    check();
    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, [tileset]);

  if (failure) {
    return (
      <Text size="xs" c="yellow" data-testid="bim-edges-note">
        Edge data could not be read, so CAD edges are unavailable: {failure}
      </Text>
    );
  }
  if (edgeData !== 'present') {
    return (
      <Text size="xs" c="dimmed" data-testid="bim-edges-note">
        {EDGE_NOTES[edgeData]}
      </Text>
    );
  }
  return (
    <Switch
      size="xs"
      color="violet"
      label="CAD edges"
      checked={edgesShown}
      onChange={(event) => setEdgesShown({ shown: event.currentTarget.checked })}
    />
  );
}

function StoreyViews({ session }: { session: BimSession }) {
  const storeys = useBimModeStore((state) => state.storeys);
  const storeyView = useBimModeStore((state) => state.storeyView);
  const isolated = useElementStore((state) => state.isolated);
  const [scope, setScope] = useState<StoreyScope>('only');
  const [reading, setReading] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cut, setCut] = useState<string | null>(null);
  const showing = storeyViewShowing(storeyView, isolated);
  const shownStorey = showing ? storeys?.find((known) => known.node.key === showing.storeyKey) : undefined;
  const top = shownStorey && storeys ? storeyTop(storeys, shownStorey) : null;

  useEffect(() => {
    bimStoreys().catch((reason: unknown) => setFailure(failureText(reason)));
  }, [session]);

  const cutAtTop = (storey: Storey, { above, height }: { above: Storey; height: number }) => {
    setFailure(null);
    try {
      sectionAtHeight(height);
      setCut(
        `${storey.label} is cut at the base of ${above.label}, ${height.toFixed(2)} m above the ellipsoid. The cut stays open, because Cesium cannot fill it.`,
      );
    } catch (reason) {
      setFailure(failureText(reason));
    }
  };

  const uncut = () => {
    setFailure(null);
    try {
      removeSection();
      setCut(null);
    } catch (reason) {
      setFailure(failureText(reason));
    }
  };

  const show = (storeyKey: string | null, chosenScope: StoreyScope) => {
    setFailure(null);
    const storey = storeys?.find((known) => known.node.key === storeyKey);
    if (!storey) {
      endStoreyView();
      return;
    }
    setReading(storey.label);
    showStorey(storey, chosenScope)
      .catch((reason: unknown) => setFailure(failureText(reason)))
      .finally(() => setReading(null));
  };

  return (
    <Stack gap={4}>
      <Select
        size="xs"
        label="Storey view"
        placeholder={storeys?.length === 0 ? 'The element tree lists no storeys' : 'Whole model'}
        clearable
        disabled={!storeys || storeys.length === 0}
        data={(storeys ?? []).map((storey) => ({ value: storey.node.key, label: storey.label }))}
        value={showing?.storeyKey ?? null}
        onChange={(storeyKey) => show(storeyKey, scope)}
      />
      <SegmentedControl
        size="xs"
        fullWidth
        value={scope}
        onChange={(value) => {
          const chosenScope = value as StoreyScope;
          setScope(chosenScope);
          if (showing) show(showing.storeyKey, chosenScope);
        }}
        data={[
          { value: 'only', label: 'Only this storey' },
          { value: 'and_below', label: 'With storeys below' },
        ]}
      />
      {scope === 'and_below' && (
        <Text size="xs" c="dimmed" data-testid="bim-storey-order-note">
          Storeys below are worked out from the middle height of each storey's elements.
        </Text>
      )}
      {top?.kind === 'known' && shownStorey && (
        <Button size="xs" variant="light" color="violet" onClick={() => cutAtTop(shownStorey, top)}>
          Section at the top of {shownStorey.label}
        </Button>
      )}
      {top?.kind === 'unknown' && (
        <Text size="xs" c="dimmed" data-testid="bim-storey-top-note">
          No section at this storey's top: {top.reason}
        </Text>
      )}
      {cut && (
        <Stack gap={2}>
          <Text size="xs" c="dimmed" data-testid="bim-storey-cut">
            {cut}
          </Text>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={uncut} style={{ alignSelf: 'flex-start' }}>
            Remove the section
          </Button>
        </Stack>
      )}
      {reading && (
        <Text size="xs" c="dimmed" data-testid="bim-storey-reading">
          Reading the elements of {reading}.
        </Text>
      )}
      {failure && (
        <Text size="xs" c="red" data-testid="bim-storey-error">
          {failure}
        </Text>
      )}
    </Stack>
  );
}

export function BimModeControls({
  model,
  tileset,
}: {
  model: ElementModel;
  tileset: Cesium3DTileset | undefined;
}) {
  const session = useBimModeStore((state) => state.session);
  const navigation = useBimModeStore((state) => state.navigation);
  const [failure, setFailure] = useState<string | null>(null);

  if (!tileset) {
    return (
      <Text size="xs" c="dimmed" data-testid="bim-not-loaded">
        BIM mode is available once {model.name} has loaded.
      </Text>
    );
  }

  if (session?.tileset !== tileset) {
    const enter = () => {
      const viewer = getActiveCesiumViewer();
      if (!viewer) {
        setFailure('There is no Cesium globe on screen.');
        return;
      }
      try {
        enterBimMode({ viewer, tileset, model, navigation: 'orbit' });
        setFailure(null);
      } catch (reason) {
        setFailure(failureText(reason));
      }
    };
    return (
      <Stack gap={4}>
        <Button size="xs" variant="light" color="violet" onClick={enter}>
          Enter BIM mode
        </Button>
        {failure && (
          <Text size="xs" c="red" data-testid="bim-enter-error">
            {failure}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="xs" data-testid="bim-controls">
      <Divider label="BIM mode" labelPosition="left" />
      <SegmentedControl
        size="xs"
        fullWidth
        value={navigation}
        onChange={(value) => setBimNavigation(value as BimNavigation)}
        data={[
          { value: 'orbit', label: 'Orbit' },
          { value: 'walk', label: 'Walk' },
        ]}
      />
      <StoreyViews session={session} />
      <CadEdges tileset={tileset} />
      <Button size="xs" variant="subtle" color="gray" onClick={leaveBimMode}>
        Leave BIM mode
      </Button>
    </Stack>
  );
}
