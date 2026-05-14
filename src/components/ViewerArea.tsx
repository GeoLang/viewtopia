import { Box, Text } from '@mantine/core';
import { useAppStore } from '../store/app';
import { useCesium } from '../hooks/useCesium';
import { useDeckGL } from '../hooks/useDeckGL';
import { useMapLibre } from '../hooks/useMapLibre';
import { useLeaflet } from '../hooks/useLeaflet';

export function ViewerArea() {
  const { activeTab, renderer } = useAppStore();

  // Initialize all viewer engines (they mount into DOM containers below)
  useCesium({ containerId: 'cesium-container' });
  useDeckGL({ containerId: 'deckgl-container' });
  useMapLibre({ containerId: 'maplibre-container' });
  useLeaflet({ containerId: 'leaflet-container' });

  return (
    <Box
      flex={1}
      style={{
        position: 'relative',
        background: '#0d1117',
      }}
    >
      {/* CesiumJS 3D Globe */}
      <div
        id="cesium-container"
        style={{
          position: 'absolute',
          inset: 0,
          display:
            activeTab === 'globe' && renderer === 'cesium' ? 'block' : 'none',
        }}
      />

      {/* deck.gl overlay on MapLibre base */}
      <div
        id="deckgl-container"
        style={{
          position: 'absolute',
          inset: 0,
          display:
            activeTab === 'globe' && renderer === 'deckgl' ? 'block' : 'none',
        }}
      />

      {/* MapLibre GL standalone */}
      <div
        id="maplibre-container"
        style={{
          position: 'absolute',
          inset: 0,
          display:
            activeTab === 'globe' && renderer === 'maplibre'
              ? 'block'
              : 'none',
        }}
      />

      {/* Leaflet 2D Map */}
      <div
        id="leaflet-container"
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'map' ? 'block' : 'none',
        }}
      />

      {/* Image & Table placeholders */}
      {activeTab === 'image' && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text c="dimmed" size="lg">
            Image Viewer (drop an image or load from catalogue)
          </Text>
        </Box>
      )}
      {activeTab === 'table' && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text c="dimmed" size="lg">
            Data Table (load a dataset to view attributes)
          </Text>
        </Box>
      )}
    </Box>
  );
}
