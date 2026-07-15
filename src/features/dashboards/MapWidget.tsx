import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Stack, Group, NumberInput } from '@mantine/core';
import { maplibreRasterStyle } from '../../hooks/basemapTiles';
import { useDashboardsStore } from './store';
import type { DashboardWidget } from './types';

export function MapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // init once; view updates handled by the effect below
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: maplibreRasterStyle('dark'),
      center,
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.jumpTo({ center, zoom });
  }, [center, zoom]);

  return (
    <div
      ref={containerRef}
      style={{ height: 140, borderRadius: 8, overflow: 'hidden', background: '#0d1117' }}
    />
  );
}

export function MapEditor({ widget }: { widget: DashboardWidget }) {
  const updateWidgetConfig = useDashboardsStore((s) => s.updateWidgetConfig);
  const center = (widget.config.center as [number, number]) ?? [0, 0];
  const zoom = (widget.config.zoom as number) ?? 1;

  return (
    <Stack gap="xs" mt="xs">
      <Group gap={4} grow>
        <NumberInput
          size="xs"
          label="Lng"
          value={center[0]}
          onChange={(v) => updateWidgetConfig(widget.id, { center: [Number(v) || 0, center[1]] })}
        />
        <NumberInput
          size="xs"
          label="Lat"
          value={center[1]}
          onChange={(v) => updateWidgetConfig(widget.id, { center: [center[0], Number(v) || 0] })}
        />
        <NumberInput
          size="xs"
          label="Zoom"
          min={0}
          max={22}
          value={zoom}
          onChange={(v) => updateWidgetConfig(widget.id, { zoom: Number(v) || 0 })}
        />
      </Group>
    </Stack>
  );
}
