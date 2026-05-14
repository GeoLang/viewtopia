import { Box, Text } from '@mantine/core';
import { useAppStore } from '../store/app';

export function ViewerArea() {
  const { activeTab, renderer } = useAppStore();

  return (
    <Box
      flex={1}
      style={{
        position: 'relative',
        background: '#0d1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Placeholder — actual map renderers will be mounted here */}
      <Text c="dimmed" size="lg">
        {activeTab === 'globe' && `3D Globe (${renderer})`}
        {activeTab === 'map' && '2D Map (Leaflet)'}
        {activeTab === 'image' && 'Image Viewer'}
        {activeTab === 'table' && 'Data Table'}
      </Text>

      {/* Container refs for CesiumJS, deck.gl, MapLibre, Leaflet */}
      <div
        id="cesium-container"
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'globe' && renderer === 'cesium' ? 'block' : 'none',
        }}
      />
      <div
        id="deckgl-container"
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'globe' && renderer === 'deckgl' ? 'block' : 'none',
        }}
      />
      <div
        id="maplibre-container"
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'globe' && renderer === 'maplibre' ? 'block' : 'none',
        }}
      />
      <div
        id="leaflet-container"
        style={{
          position: 'absolute',
          inset: 0,
          display: activeTab === 'map' ? 'block' : 'none',
        }}
      />
    </Box>
  );
}
