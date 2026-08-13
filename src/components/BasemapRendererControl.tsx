import { ActionIcon, Button, FileButton, Popover, Select, Stack, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileImport, IconMap2 } from '@tabler/icons-react';
import { useAppStore, type Renderer, type Basemap, type LocalBasemap } from '../store/app';
import { BASEMAP_SELECT_GROUPS, basemapSelectGroups } from '../hooks/basemapTiles';
import { addLocalPmtiles } from '../features/pmtiles/source';

const RENDERER_OPTIONS: { value: Renderer; label: string }[] = [
  { value: 'cesium', label: 'CesiumJS' },
  { value: 'maplibre', label: 'MapLibre' },
];

/** What is wrong with the picked archive right now, or nothing when it draws. */
function localBasemapNotice(local: LocalBasemap | null, drawsLocal: boolean): string | undefined {
  if (!local) return 'Pick a .pmtiles file to use one.';
  if (local.status === 'needs-file') return `${local.name} has to be picked again after a reload.`;
  if (!drawsLocal) return 'Only MapLibre reads a .pmtiles archive, so this view has no basemap.';
  return undefined;
}

/** Map-corner popover holding the basemap and renderer pickers, so they stop
 * costing permanent toolbar space. */
export function BasemapRendererControl() {
  const { activeTab, renderer, setRenderer, basemap, setBasemap, localBasemap, setLocalBasemap } =
    useAppStore();
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
  const basemapGroups = basemapSelectGroups(basemap, localBasemap, availableGroups);

  const loadLocalBasemap = async (file: File | null) => {
    if (!file) return;
    try {
      const { info } = await addLocalPmtiles(file);
      setLocalBasemap({ name: file.name, status: 'loaded', kind: info.kind });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unreadable archive';
      notifications.show({
        title: 'Basemap failed',
        message: `${file.name}: ${reason}`,
        color: 'red',
      });
    }
  };

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
            description={
              basemap === 'local'
                ? localBasemapNotice(localBasemap, !onMapTab && renderer === 'maplibre')
                : undefined
            }
            onChange={(v) => v && setBasemap(v as Basemap)}
          />
          <FileButton accept=".pmtiles" onChange={loadLocalBasemap}>
            {(props) => (
              <Button
                {...props}
                size="xs"
                variant="default"
                leftSection={<IconFileImport size={14} />}
              >
                Local .pmtiles
              </Button>
            )}
          </FileButton>
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
