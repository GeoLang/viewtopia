import { ActionIcon, Popover, Select, Stack, Tooltip } from '@mantine/core';
import { IconMap2 } from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap } from '../store/app';
import { BASEMAP_SELECT_GROUPS } from '../hooks/basemapTiles';

const RENDERER_OPTIONS: { value: Renderer; label: string }[] = [
  { value: 'cesium', label: 'CesiumJS' },
  { value: 'maplibre', label: 'MapLibre' },
];

/** Map-corner popover holding the basemap and renderer pickers, so they stop
 * costing permanent toolbar space. */
export function BasemapRendererControl() {
  const { activeTab, renderer, setRenderer, basemap, setBasemap } = useAppStore();
  const uiHidden = useAppStore((s) => s.uiHidden);
  if (uiHidden) return null;

  // the 2d map is leaflet: the renderer choice doesn't apply, and vector
  // styles render as their raster approximation, so they stay choosable
  // under a label that says what 2d shows
  const onMapTab = activeTab === 'map';
  const availableGroups = onMapTab
    ? BASEMAP_SELECT_GROUPS.map((g) =>
        g.group.startsWith('Vector')
          ? { ...g, group: 'Vector (raster approximation on 2D)' }
          : g,
      )
    : BASEMAP_SELECT_GROUPS;
  // a plugin can set tiles outside the built-in list, and the select renders
  // blank on a value with no matching option
  const basemapGroups =
    basemap === 'custom'
      ? [...availableGroups, { group: 'Plugin', items: [{ value: 'custom', label: 'Custom' }] }]
      : availableGroups;

  return (
    <Popover width={220} position="top-start" shadow="md">
      <Popover.Target>
        <Tooltip label="Basemap & renderer" position="right">
          <ActionIcon
            aria-label="Basemap & renderer"
            variant="default"
            size="lg"
            style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 200 }}
          >
            <IconMap2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Basemap"
            aria-label="Basemap"
            comboboxProps={{ width: 190, position: 'bottom-start' }}
            data={basemapGroups}
            value={basemap}
            onChange={(v) => v && setBasemap(v as Basemap)}
          />
          <Select
            size="xs"
            label="Renderer"
            aria-label="Renderer"
            // the 2d tab always draws with leaflet, so show that instead of
            // freezing on the persisted globe renderer
            data={onMapTab ? [{ value: 'leaflet', label: 'Leaflet' }] : RENDERER_OPTIONS}
            value={onMapTab ? 'leaflet' : renderer}
            disabled={onMapTab}
            description={onMapTab ? '2D always renders with Leaflet — switch to 3D to change engines' : undefined}
            onChange={(v) => v && setRenderer(v as Renderer)}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
