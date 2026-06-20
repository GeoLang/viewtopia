import { useAppStore } from '../store/app';
import { useSpaceTimeStore } from '../features/spacetime/store';
import { PluginPanel } from '../plugins/PluginHost';
import { MeasurementPanel } from './tools/MeasurementPanel';
import { FeaturePickerPanel } from './tools/FeaturePickerPanel';
import { GeoJsonEditorPanel } from './tools/GeoJsonEditorPanel';
import { StyleEditorPanel } from './tools/StyleEditorPanel';
import { GeocodingPanel } from './tools/GeocodingPanel';
import { RoutingPanel } from './tools/RoutingPanel';
import { DrawPanel } from './tools/DrawPanel';
import { AnnotatePanel } from './tools/AnnotatePanel';
import { GeofencePanel } from './tools/GeofencePanel';
import { BookmarkPanel } from './tools/BookmarkPanel';
import { LayerManager } from './layers/LayerManager';
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
import { NoisePanel } from './tools/NoisePanel';
import { EnergyPanel } from './tools/EnergyPanel';
import { SolarPanel } from './tools/SolarPanel';
import { TrafficPanel } from './tools/TrafficPanel';
import { PhotoPanel } from './tools/PhotoPanel';
import { OfflinePanel } from './tools/OfflinePanel';
import { IndoorPanel } from './tools/IndoorPanel';
import { DronePanel } from './tools/DronePanel';
import { WebXRPanel } from './tools/WebXRPanel';
import { AccessibilityPanel } from './tools/AccessibilityPanel';
import { Export3DPanel } from './tools/Export3DPanel';
import { FlythroughPanel } from './tools/FlythroughPanel';
import { ShadowsPanel } from './tools/ShadowsPanel';
import { ViewshedPanel } from './tools/ViewshedPanel';
import { VolumePanel } from './tools/VolumePanel';
import { PointCloudComparePanel } from './tools/PointCloudComparePanel';
import { TerrainAnalysisPanel } from './tools/TerrainAnalysisPanel';
import { TerrainProfilePanel } from './tools/TerrainProfilePanel';
import { SpatialStatsPanel } from './tools/SpatialStatsPanel';
import { ClassificationPanel } from './tools/ClassificationPanel';
import { ChartsPanel } from './tools/ChartsPanel';
import { SplitViewPanel } from './tools/SplitViewPanel';
import { StoriesPanel } from './tools/StoriesPanel';
import { CollaborationPanel } from './tools/CollaborationPanel';
import { TimelinePanel } from './tools/TimelinePanel';
import { DataTablePanel } from './tools/DataTablePanel';
import { TourPanel } from './tools/TourPanel';
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
import { RasterViewerPanel } from './tools/RasterViewerPanel';
import { PrintExportPanel } from './tools/PrintExportPanel';

export function ToolPanels() {
  const {
    activePanel,
    setActivePanel,
    layers,
    toggleLayerVisibility,
    setLayerOpacity,
    removeLayer,
    reorderLayers,
    bookmarks,
    addBookmark,
    removeBookmark,
  } = useAppStore();
  const flyTo = useSpaceTimeStore((s) => s.flyTo);

  const close = () => setActivePanel(null);

  switch (activePanel) {
    case 'measure':
      return <MeasurementPanel onClose={close} />;
    case 'featurePicker':
      return <FeaturePickerPanel onClose={close} />;
    case 'geojsonEditor':
      return <GeoJsonEditorPanel onClose={close} />;
    case 'styleEditor':
      return <StyleEditorPanel onClose={close} />;
    case 'geocoding':
      return (
        <GeocodingPanel
          onFlyTo={(lat, lng, zoom) => flyTo(lng, lat, zoom)}
          onClose={close}
        />
      );
    case 'routing':
      return <RoutingPanel onClose={close} />;
    case 'draw':
      return <DrawPanel onClose={close} />;
    case 'annotate':
      return <AnnotatePanel onClose={close} />;
    case 'geofence':
      return <GeofencePanel onClose={close} />;
    case 'bookmark':
      return (
        <BookmarkPanel
          bookmarks={bookmarks}
          onFlyTo={(bm) => flyTo(bm.lng, bm.lat, bm.zoom)}
          onSave={(name) =>
            addBookmark({
              id: crypto.randomUUID(),
              name,
              lat: 0,
              lng: 0,
              zoom: 8,
              createdAt: Date.now(),
            })
          }
          onDelete={removeBookmark}
          onClose={close}
        />
      );
    case 'layers':
      return (
        <LayerManager
          layers={layers}
          onToggle={toggleLayerVisibility}
          onOpacity={setLayerOpacity}
          onRemove={removeLayer}
          onReorder={reorderLayers}
          onClose={close}
        />
      );
    case 'ogc':
      return (
        <OGCLayersPanel
          layers={[]}
          onAdd={() => {}}
          onRemove={() => {}}
          onClose={close}
        />
      );
    case 'import':
      return <DragDropImport onImport={() => {}} onClose={close} />;
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
    case 'noise':
      return <NoisePanel onClose={close} />;
    case 'energy':
      return <EnergyPanel onClose={close} />;
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
    case 'webxr':
      return <WebXRPanel onClose={close} />;
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
    case 'pointCloudCompare':
      return <PointCloudComparePanel onClose={close} />;
    case 'terrainAnalysis':
      return <TerrainAnalysisPanel onClose={close} />;
    case 'terrainProfile':
      return <TerrainProfilePanel onClose={close} />;
    case 'spatialStats':
      return <SpatialStatsPanel onClose={close} />;
    case 'classification':
      return <ClassificationPanel onClose={close} />;
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
      return <TourPanel onClose={close} />;
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
      return <RasterViewerPanel onClose={close} />;
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
