import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Slider, Stack, Text } from '@mantine/core';
import { Cartesian3, Color, Matrix4 } from 'cesium';
import type { Cesium3DTileset } from 'cesium';
import { authHeaders, noticeRefusal } from '../../lib/apiAuth';
import { randomUuid } from '../../lib/randomUuid';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { getAuthToken } from '../auth/store';
import { ElementApiError, errorBodyOf } from '../elements/elementService';
import { addFacePlane } from './tilesetSection';
import { alignmentsFrom, crossSectionPlane, stationAt, type AlignmentCurve } from './alignmentSection';

function requestRender(): void {
  getActiveCesiumViewer()?.scene.requestRender();
}

async function fetchAlignments(assetId: string, signal: AbortSignal): Promise<AlignmentCurve[]> {
  if (!getAuthToken()) return [];
  const response = await fetch(`/v1/assets/${encodeURIComponent(assetId)}/alignments`, {
    headers: authHeaders(),
    signal,
  });
  noticeRefusal(response.status);
  if (response.status === 400) return [];
  if (!response.ok) {
    const body = errorBodyOf(await response.text());
    throw new ElementApiError(
      body?.message ?? `tiletopia answered HTTP ${response.status}.`,
      response.status,
      body?.code ?? null,
    );
  }
  return alignmentsFrom(await response.json());
}

export function AlignmentScrub({ assetId, tileset }: { assetId: string; tileset: Cesium3DTileset }) {
  const [curves, setCurves] = useState<AlignmentCurve[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [curveId, setCurveId] = useState<string | null>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCurves(null);
    setFailure(null);
    fetchAlignments(assetId, controller.signal)
      .then((found) => {
        setCurves(found);
        setCurveId(found[0]?.id ?? null);
        setDistance(0);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setFailure(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [assetId]);

  const curve = curves?.find((item) => item.id === curveId) ?? curves?.[0] ?? null;
  const station = useMemo(
    () => (curve ? stationAt(curve.stations, distance) : null),
    [curve, distance],
  );

  useEffect(() => {
    const viewer = getActiveCesiumViewer();
    if (!viewer || !station) return;
    const world = Matrix4.multiplyByPoint(
      tileset.root.computedTransform,
      new Cartesian3(station.position[0], station.position[1], station.position[2]),
      new Cartesian3(),
    );
    const entity = viewer.entities.add({
      position: world,
      point: {
        pixelSize: 12,
        color: Color.VIOLET,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    viewer.scene.requestRender();
    return () => {
      if (viewer.isDestroyed()) return;
      viewer.entities.remove(entity);
      viewer.scene.requestRender();
    };
  }, [station, tileset]);

  if (!curve) {
    return failure ? (
      <Text size="xs" c="red" data-testid="alignment-error">
        {failure}
      </Text>
    ) : null;
  }

  const plane = crossSectionPlane(station ?? curve.stations[0]);

  return (
    <Stack gap={4} data-testid="alignment-scrub">
      {curves && curves.length > 1 && (
        <Select
          size="xs"
          label="Alignment"
          allowDeselect={false}
          data={curves.map((item) => ({ value: item.id, label: item.name || item.id }))}
          value={curve.id}
          onChange={(value) => {
            setCurveId(value);
            setDistance(0);
          }}
        />
      )}
      <Text size="xs" c="dimmed">
        {curve.name || curve.id}: {distance.toFixed(1)} m of {curve.length.toFixed(1)} m
      </Text>
      <Slider
        size="xs"
        color="violet"
        min={0}
        max={Math.max(curve.length, 0)}
        step={0.1}
        value={Math.min(distance, curve.length)}
        onChange={setDistance}
        label={null}
        disabled={curve.length <= 0}
      />
      {curve.approximate && (
        <Text size="xs" c="dimmed">
          This curve is drawn straight. The file uses a type other than a line or a circular arc.
        </Text>
      )}
      <Button
        size="xs"
        variant="light"
        color="violet"
        disabled={plane === null}
        onClick={() => {
          if (!plane) return;
          addFacePlane(tileset, { id: randomUuid(), normal: plane.normal, offset: plane.offset }, requestRender);
        }}
        fullWidth
      >
        Cut a cross-section here
      </Button>
      {failure && (
        <Text size="xs" c="red">
          {failure}
        </Text>
      )}
    </Stack>
  );
}
