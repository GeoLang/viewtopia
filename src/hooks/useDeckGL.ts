import { useCallback, useEffect, useRef } from 'react';
import {
  Deck,
  FlyToInterpolator,
  WebMercatorViewport,
  type Layer,
  type PickingInfo,
} from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { useAppStore } from '../store/app';
import { useFeaturePickerStore, propsToRows } from '../store/featurePicker';
import { setActiveDeck } from '../viewer/registry';
import { getSharedCamera, setSharedCamera } from './sharedCamera';
import { BASEMAP_TILES } from './basemapTiles';
import { useDeckLayersStore, composedDeckLayers } from './deckLayers';

interface UseDeckGLOptions {
  containerId?: string;
}

interface DeckViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
  transitionInterpolator?: FlyToInterpolator;
}

/** deck.gl raster basemap as a TileLayer (stable id so it can be swapped in place). */
function makeBasemapLayer(name: string): Layer {
  const tile = BASEMAP_TILES[name] ?? BASEMAP_TILES.osm;
  return new TileLayer({
    id: 'basemap',
    data: tile.url,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const { boundingBox } = props.tile;
      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [
          boundingBox[0][0],
          boundingBox[0][1],
          boundingBox[1][0],
          boundingBox[1][1],
        ],
      });
    },
  });
}

/**
 * Standalone deck.gl renderer — a single `Deck` instance (NOT a MapLibre map),
 * mirroring the original vanilla renderer. Renders a raster basemap plus any
 * layer groups registered in the deck-layers store, with its own MapView camera
 * (default 45° pitch → the signature 2.5D view).
 */
export function useDeckGL(opts: UseDeckGLOptions = {}) {
  const deckRef = useRef<Deck | null>(null);
  const viewStateRef = useRef<DeckViewState | null>(null);
  const basemap = useAppStore((s) => s.basemap);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);

  const isActive = activeTab === 'globe' && renderer === 'deckgl';

  // Compose basemap + registered layer groups into the Deck.
  const pushLayers = () => {
    const deck = deckRef.current;
    if (!deck) return;
    const layers = [
      makeBasemapLayer(useAppStore.getState().basemap),
      ...composedDeckLayers(useDeckLayersStore.getState().groups),
    ];
    deck.setProps({ layers });
  };

  // Create/destroy the Deck based on active state.
  useEffect(() => {
    if (!isActive) {
      if (deckRef.current) {
        deckRef.current.finalize();
        deckRef.current = null;
        setActiveDeck(null);
      }
      return;
    }

    const container = document.getElementById(opts.containerId ?? 'deckgl-container');
    if (!container || deckRef.current) return;

    const cam = getSharedCamera();
    const viewState: DeckViewState = {
      longitude: cam.longitude,
      latitude: cam.latitude,
      zoom: cam.zoom,
      // Default to a 45° tilt for the 2.5D view (parity with the vanilla deck
      // renderer, which floored a flat pitch back to 45). A flat 0 arrives e.g.
      // from a top-down Cesium camera; an explicit tilt is preserved.
      pitch: cam.pitch || 45,
      bearing: cam.bearing,
    };
    viewStateRef.current = viewState;

    const deck = new Deck({
      parent: container as HTMLDivElement,
      initialViewState: viewState,
      viewState,
      controller: true,
      // Agent points draw at a 5px radius; picking dead-centre only (deck's
      // default) makes them near-unclickable next to Cesium's large pins.
      pickingRadius: 8,
      onViewStateChange: ({ viewState: vs }) => {
        const next = vs as DeckViewState;
        viewStateRef.current = next;
        deck.setProps({ viewState: next });
        setSharedCamera({
          longitude: next.longitude,
          latitude: next.latitude,
          zoom: next.zoom,
          pitch: next.pitch,
          bearing: next.bearing,
        });
      },
      // Deck tracks isHovering itself, but its default cursor ignores it.
      getCursor: ({ isDragging, isHovering }) => {
        if (isDragging) return 'grabbing';
        return isHovering && useFeaturePickerStore.getState().enabled
          ? 'pointer'
          : 'grab';
      },
      // Picking is a Deck-level prop, so the feature picker binds here rather
      // than in its own hook. Gated on the same toggle Cesium uses.
      onClick: (info: PickingInfo) => {
        if (!useFeaturePickerStore.getState().enabled) return;
        const props = (info.object as { properties?: Record<string, unknown> } | null)
          ?.properties;
        useFeaturePickerStore
          .getState()
          .setSelected(props ? propsToRows(props) : null);
      },
      layers: [],
    });

    deckRef.current = deck;
    setActiveDeck(deck);
    pushLayers();

    // Recompose whenever a feature hook updates its layer group.
    const unsub = useDeckLayersStore.subscribe(pushLayers);
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, opts.containerId]);

  // Swap basemap tiles when already active.
  useEffect(() => {
    if (!isActive) return;
    pushLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, isActive]);

  /**
   * Frame a [w, s, e, n] box (deck has no map.fitBounds). The fit is computed on
   * an unpitched viewport — deck's fitBounds is documented as non-perspective
   * only — and the current tilt is kept.
   */
  const fitBounds = useCallback((bounds: [number, number, number, number]) => {
    const deck = deckRef.current;
    const cur = viewStateRef.current;
    if (!deck || !cur || !deck.width || !deck.height) return;

    const fitted = new WebMercatorViewport({
      width: deck.width,
      height: deck.height,
    }).fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      // minExtent keeps a single-point layer from fitting to zoom Infinity.
      { padding: 60, maxZoom: 17, minExtent: 0.001 },
    );

    const next: DeckViewState = {
      ...cur,
      longitude: fitted.longitude,
      latitude: fitted.latitude,
      zoom: fitted.zoom,
    };
    viewStateRef.current = next;
    deck.setProps({ viewState: next });
    setSharedCamera({
      longitude: next.longitude,
      latitude: next.latitude,
      zoom: next.zoom,
      pitch: next.pitch,
      bearing: next.bearing,
    });
  }, []);

  /** Animate the camera to a location (deck has no map.flyTo). */
  const flyTo = (lng: number, lat: number, zoom?: number) => {
    const deck = deckRef.current;
    const cur = viewStateRef.current;
    if (!deck || !cur) return;
    const next: DeckViewState = {
      ...cur,
      longitude: lng,
      latitude: lat,
      zoom: zoom ?? 8,
      transitionDuration: 1500,
      transitionInterpolator: new FlyToInterpolator(),
    };
    viewStateRef.current = next;
    deck.setProps({ viewState: next });
  };

  return { deckRef, flyTo, fitBounds };
}
