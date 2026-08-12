import { useEffect } from 'react';
import { Badge } from '@mantine/core';
import { useAppStore, type ToolPanel } from '../store/app';
import { useOgcLayerStore } from '../store/ogcLayers';
import { useAgentLayerStore } from '../store/agentLayers';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { isPreviewPanel } from './toolMenus';
import { PluginPanel } from '../plugins/PluginHost';
import { MeasurementPanel } from './tools/MeasurementPanel';
import { FeaturePickerPanel } from './tools/FeaturePickerPanel';
import { GeoJsonEditorPanel } from './tools/GeoJsonEditorPanel';
import { StyleEditorPanel } from './tools/StyleEditorPanel';
import { PortalPanel } from '../features/portal/PortalPanel';
import { StacBrowserPanel } from '../features/stac/StacBrowserPanel';
import { useStacStore } from '../features/stac/store';
import { DashboardPanel } from '../features/dashboards/DashboardPanel';
import { ProjectPanel } from '../features/project/ProjectPanel';
import { SqlWorkspacePanel } from '../features/sql/SqlWorkspacePanel';
import { GeocodingPanel } from './tools/GeocodingPanel';
import { RoutingPanel } from './tools/RoutingPanel';
import { TravelTimePanel } from './tools/TravelTimePanel';
import { DrawPanel } from './tools/DrawPanel';
import { AnnotatePanel } from './tools/AnnotatePanel';
import { GeofencePanel } from './tools/GeofencePanel';
import { BookmarkPanel } from './tools/BookmarkPanel';
import { LayerManager } from './layers/LayerManager';
import { LegendPanel } from '../features/symbology/LegendPanel';
import { OGCLayersPanel } from './layers/OGCLayersPanel';
import { DragDropImport } from './tools/DragDropImport';
import { ClippingPanel } from './tools/ClippingPanel';
import { CrossSectionPanel } from './tools/CrossSectionPanel';
import { HeatmapPanel } from './tools/HeatmapPanel';
import { TimelapsePanel } from './tools/TimelapsePanel';
import { WeatherPanel } from './tools/WeatherPanel';
import { FloodPanel } from './tools/FloodPanel';
import { WindPanel } from './tools/WindPanel';
import { LightingPanel } from './tools/LightingPanel';
import { SolarPanel } from './tools/SolarPanel';
import { TrafficPanel } from './tools/TrafficPanel';
import { PhotoPanel } from './tools/PhotoPanel';
import { OfflinePanel } from './tools/OfflinePanel';
import { IndoorPanel } from './tools/IndoorPanel';
import { DronePanel } from './tools/DronePanel';
import { AccessibilityPanel } from './tools/AccessibilityPanel';
import { Export3DPanel } from './tools/Export3DPanel';
import { FlythroughPanel } from './tools/FlythroughPanel';
import { ShadowsPanel } from './tools/ShadowsPanel';
import { ViewshedPanel } from './tools/ViewshedPanel';
import { VolumePanel } from './tools/VolumePanel';
import { TerrainAnalysisPanel } from './tools/TerrainAnalysisPanel';
import { TerrainProfilePanel } from './tools/TerrainProfilePanel';
import { SpatialStatsPanel } from './tools/SpatialStatsPanel';
import { ChartsPanel } from './tools/ChartsPanel';
import { SplitViewPanel } from './tools/SplitViewPanel';
import { StoriesPanel } from './tools/StoriesPanel';
import { CollaborationPanel } from './tools/CollaborationPanel';
import { TimelinePanel } from './tools/TimelinePanel';
import { DataTablePanel } from './tools/DataTablePanel';
import { TourLauncher } from './TourOverlay';
import { ShareLinkPanel } from './tools/ShareLinkPanel';
import { SettingsPanel } from './tools/SettingsPanel';
import { AssetsPanel } from './tools/AssetsPanel';
import { BuildingsPanel } from './tools/BuildingsPanel';
import { ModelImportPanel } from './tools/ModelImportPanel';
import { TrackImportPanel } from './tools/TrackImportPanel';
import { CesiumIonPanel } from './tools/CesiumIonPanel';
import { Google3DPanel } from './tools/Google3DPanel';
import { GlobalTerrainPanel } from './tools/GlobalTerrainPanel';
import { VectorTilesPanel } from './tools/VectorTilesPanel';
import { RasterPanel } from '../raster/RasterPanel';
import { ToolboxPanel } from '../toolbox/ToolboxPanel';
import { ImageOverlayPanel } from '../overlay/ImageOverlayPanel';
import { ConvertPanel } from '../features/convert/ConvertPanel';
import { RunHistoryPanel } from '../features/runs/RunHistoryPanel';
import { PrintExportPanel } from './tools/PrintExportPanel';

/** floating marker over unfinished tools so they never pass as shipped features */
function PreviewMarker({ panel }: { panel: ToolPanel }) {
  if (!isPreviewPanel(panel)) return null;
  return (
    <Badge
      size="sm"
      color="orange"
      style={{
        position: 'absolute',
        top: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
      }}
    >
      Preview: not functional yet
    </Badge>
  );
}

export function ToolPanels() {
  const {
    activePanel,
    setActivePanel,
    layers,
    removeLayer,
    reorderLayers,
  } = useAppStore();
  const ogcLayers = useOgcLayerStore((s) => s.layers);
  const addOgcLayer = useOgcLayerStore((s) => s.addLayer);
  const removeOgcLayer = useOgcLayerStore((s) => s.removeLayer);
  const addAgentLayer = useAgentLayerStore((s) => s.addLayer);
  const stacRasterUrl = useStacStore((s) => s.rasterAnalysisUrl);
  const flyTo = useSpaceTimeStore((s) => s.flyTo);
  // Space-Time lives in its own store but is one of the panels users open from
  // the toolbar, so Escape closes it here too rather than in a second listener.
  const spaceTimeOpen = useSpaceTimeStore((s) => s.panelOpen);
  const closeSpaceTime = useSpaceTimeStore((s) => s.closePanel);

  const close = () => setActivePanel(null);

  // a temporary panel can sit under other controls (e.g. the nav toggle over its
  // close X), so Escape always closes whatever panel is open.
  useEffect(() => {
    if (!activePanel && !spaceTimeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setActivePanel(null);
      closeSpaceTime();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePanel, spaceTimeOpen, setActivePanel, closeSpaceTime]);

  const panel = renderPanel();
  if (!panel) return null;
  return (
    <>
      {panel}
      <PreviewMarker panel={activePanel} />
    </>
  );

  function renderPanel() {
    switch (activePanel) {
    case 'measure':
      return <MeasurementPanel onClose={close} />;
    case 'featurePicker':
      return <FeaturePickerPanel onClose={close} />;
    case 'geojsonEditor':
      return <GeoJsonEditorPanel onClose={close} />;
    case 'styleEditor':
      return <StyleEditorPanel onClose={close} />;
    case 'portal':
      return <PortalPanel onClose={close} />;
    case 'stacBrowser':
      return <StacBrowserPanel onClose={close} />;
    case 'dashboards':
      return <DashboardPanel onClose={close} />;
    case 'geocoding':
      return (
        <GeocodingPanel
          onFlyTo={(lat, lng, zoom) => flyTo(lng, lat, zoom)}
          onClose={close}
        />
      );
    case 'routing':
      return <RoutingPanel onClose={close} />;
    case 'travelTime':
      return <TravelTimePanel onClose={close} />;
    case 'draw':
      return <DrawPanel onClose={close} />;
    case 'annotate':
      return <AnnotatePanel onClose={close} />;
    case 'geofence':
      return <GeofencePanel onClose={close} />;
    case 'bookmark':
      return <BookmarkPanel onClose={close} />;
    case 'layers':
      return (
        <LayerManager
          layers={layers}
          onRemove={removeLayer}
          onReorder={reorderLayers}
          onClose={close}
        />
      );
    case 'legend':
      return <LegendPanel onClose={close} />;
    case 'ogc':
      return (
        <OGCLayersPanel
          layers={ogcLayers}
          onAdd={addOgcLayer}
          onRemove={removeOgcLayer}
          onClose={close}
        />
      );
    case 'import':
      return (
        <DragDropImport
          // imported files join the agent layers, so every renderer draws them
          onImport={(name, geojson) =>
            addAgentLayer({ id: crypto.randomUUID(), name, color: '#38bdf8', geojson })
          }
          onClose={close}
        />
      );
    case 'project':
      return <ProjectPanel onClose={close} />;
    case 'sqlWorkspace':
      return <SqlWorkspacePanel onClose={close} />;
    case 'clipping':
      return <ClippingPanel onClose={close} />;
    case 'crossSection':
      return <CrossSectionPanel onClose={close} />;
    case 'heatmap':
      return <HeatmapPanel onClose={close} />;
    case 'timelapse':
      return <TimelapsePanel onClose={close} />;
    case 'weather':
      return <WeatherPanel onClose={close} />;
    case 'flood':
      return <FloodPanel onClose={close} />;
    case 'wind':
      return <WindPanel onClose={close} />;
    case 'lighting':
      return <LightingPanel onClose={close} />;
    case 'solar':
      return <SolarPanel onClose={close} />;
    case 'traffic':
      return <TrafficPanel onClose={close} />;
    case 'photo':
      return <PhotoPanel onClose={close} />;
    case 'offline':
      return <OfflinePanel onClose={close} />;
    case 'indoor':
      return <IndoorPanel onClose={close} />;
    case 'drone':
      return <DronePanel onClose={close} />;
    case 'accessibility':
      return <AccessibilityPanel onClose={close} />;
    case 'export3d':
      return <Export3DPanel onClose={close} />;
    case 'flythrough':
      return <FlythroughPanel onClose={close} />;
    case 'shadows':
      return <ShadowsPanel onClose={close} />;
    case 'viewshed':
      return <ViewshedPanel onClose={close} />;
    case 'volume':
      return <VolumePanel onClose={close} />;
    case 'terrainAnalysis':
      return <TerrainAnalysisPanel onClose={close} />;
    case 'terrainProfile':
      return <TerrainProfilePanel onClose={close} />;
    case 'spatialStats':
      return <SpatialStatsPanel onClose={close} />;
    case 'charts':
      return <ChartsPanel onClose={close} />;
    case 'splitView':
      return <SplitViewPanel onClose={close} />;
    case 'stories':
      return <StoriesPanel onClose={close} />;
    case 'collaboration':
      return <CollaborationPanel onClose={close} />;
    case 'timeline':
      return <TimelinePanel onClose={close} />;
    case 'dataTable':
      return <DataTablePanel onClose={close} />;
    case 'tour':
      return <TourLauncher onClose={close} />;
    case 'shareLink':
      return <ShareLinkPanel onClose={close} />;
    case 'settings':
      return <SettingsPanel onClose={close} />;
    case 'assets':
      return <AssetsPanel onClose={close} />;
    case 'buildings':
      return <BuildingsPanel onClose={close} />;
    case 'modelImport':
      return <ModelImportPanel onClose={close} />;
    case 'trackImport':
      return <TrackImportPanel onClose={close} />;
    case 'cesiumIon':
      return <CesiumIonPanel onClose={close} />;
    case 'google3d':
      return <Google3DPanel onClose={close} />;
    case 'globalTerrain':
      return <GlobalTerrainPanel onClose={close} />;
    case 'vectorTiles':
      return <VectorTilesPanel onClose={close} />;
    case 'rasterViewer':
      return <RasterPanel onClose={close} initialUrl={stacRasterUrl} />;
    case 'toolbox':
      return <ToolboxPanel onClose={close} />;
    case 'runHistory':
      return <RunHistoryPanel onClose={close} />;
    case 'imageOverlay':
      return <ImageOverlayPanel onClose={close} />;
    case 'convert':
      return <ConvertPanel onClose={close} />;
    case 'printExport':
      return <PrintExportPanel onClose={close} />;
    default:
      // Check if it's a plugin panel
      if (activePanel) {
        return <PluginPanel pluginId={activePanel} onClose={close} />;
      }
      return null;
    }
  }
}
