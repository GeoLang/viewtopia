import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { ActionIcon, Button, Group, Paper, Stack, UnstyledButton } from '@mantine/core';
import { IconMessage, IconX } from '@tabler/icons-react';
import { Cartesian3, SceneTransforms, type Viewer } from 'cesium';
import type { Map as LeafletMap } from 'leaflet';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useAppStore } from '../store/app';
import { Thread, useMentionCandidates } from './CommentThread';
import { commentThreads, currentMapAnchor, postComment, type CommentThread } from './comments';
import { useLiveStore } from './liveStore';
import { useMapCommentsStore } from './mapCommentsStore';
import { MentionTextarea } from './MentionTextarea';
import type { LiveCommentMention } from './types';

const PIN_SIZE = 22;
const BOX_GAP = 10;
const BOX_WIDTH = 300;
const BOX_MAX_HEIGHT = 320;

interface ScreenPoint {
  x: number;
  y: number;
}

interface ContainerSize {
  width: number;
  height: number;
}

// the container measures 0 before layout, so cull only against a real size
function outsideContainer(point: ScreenPoint, size: ContainerSize): boolean {
  if (point.x < 0 || point.y < 0) return true;
  return (size.width > 0 && point.x > size.width) || (size.height > 0 && point.y > size.height);
}

/**
 * A box anchored beside a projected point, flipped away from whichever container
 * edge it would otherwise run off.
 */
function FloatingBox({
  point,
  size,
  children,
}: {
  point: ScreenPoint;
  size: ContainerSize;
  children: ReactNode;
}) {
  const flipX = size.width > 0 && point.x > size.width / 2;
  const flipY = size.height > 0 && point.y > size.height / 2;
  return (
    <Paper
      shadow="xl"
      radius="sm"
      p={6}
      style={{
        position: 'absolute',
        left: flipX ? undefined : point.x + BOX_GAP,
        right: flipX ? size.width - point.x + BOX_GAP : undefined,
        top: flipY ? undefined : point.y + BOX_GAP,
        bottom: flipY ? size.height - point.y + BOX_GAP : undefined,
        width: BOX_WIDTH,
        maxHeight: BOX_MAX_HEIGHT,
        overflowY: 'auto',
        background: 'var(--mantine-color-dark-7)',
        border: '1px solid var(--mantine-color-dark-5)',
        pointerEvents: 'auto',
        zIndex: 1,
      }}
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      {children}
    </Paper>
  );
}

/**
 * The placed comments, drawn over whichever renderer is up. Projection mirrors
 * `screenToLngLat` in ViewerArea in the forward direction.
 */
export function MapCommentsOverlay({
  cesiumRef,
  maplibreRef,
  leafletRef,
}: {
  cesiumRef: MutableRefObject<Viewer | null>;
  maplibreRef: MutableRefObject<MapLibreMap | null>;
  leafletRef: MutableRefObject<LeafletMap | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [draftText, setDraftText] = useState('');
  const [draftMentions, setDraftMentions] = useState<LiveCommentMention[]>([]);

  const live = useLiveStore((s) => s.documentId !== null);
  const documentId = useLiveStore((s) => s.documentId) ?? '';
  const comments = useLiveStore((s) => s.document.comments);
  const ownActor = useLiveStore((s) => s.actor);
  const role = useLiveStore((s) => s.role);
  const activeTab = useAppStore((s) => s.activeTab);
  const renderer = useAppStore((s) => s.renderer);
  const draft = useMapCommentsStore((s) => s.draft);
  const openThreadId = useMapCommentsStore((s) => s.openThreadId);
  const openThread = useMapCommentsStore((s) => s.openThread);
  const closeThread = useMapCommentsStore((s) => s.closeThread);
  const closeDraft = useMapCommentsStore((s) => s.closeDraft);

  const canWrite = role === 'edit' && ownActor !== null;
  const candidates = useMentionCandidates(canWrite);

  // read at render, so a map built after this mounted rebinds the camera listener
  const cesiumViewer = cesiumRef.current;
  const maplibreMap = maplibreRef.current;
  const leafletMap = leafletRef.current;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setSize({ width: root.clientWidth, height: root.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        redraw();
      });
    };
    const stopFrame = () => cancelAnimationFrame(frame);

    if (activeTab === 'globe' && renderer === 'cesium' && cesiumViewer) {
      const remove = cesiumViewer.scene.postRender.addEventListener(schedule);
      return () => {
        stopFrame();
        remove();
      };
    }
    if (activeTab === 'globe' && renderer === 'maplibre' && maplibreMap) {
      maplibreMap.on('move', schedule);
      return () => {
        stopFrame();
        maplibreMap.off('move', schedule);
      };
    }
    if (activeTab === 'map' && leafletMap) {
      leafletMap.on('move', schedule);
      return () => {
        stopFrame();
        leafletMap.off('move', schedule);
      };
    }
  }, [activeTab, renderer, cesiumViewer, maplibreMap, leafletMap]);

  if (!live) return null;

  const project = (lng: number, lat: number): ScreenPoint | null => {
    if (activeTab === 'globe' && renderer === 'cesium') {
      if (!cesiumViewer || cesiumViewer.isDestroyed()) return null;
      const point = SceneTransforms.worldToWindowCoordinates(
        cesiumViewer.scene,
        Cartesian3.fromDegrees(lng, lat),
      );
      return point ? { x: point.x, y: point.y } : null;
    }
    if (activeTab === 'globe' && renderer === 'maplibre') {
      if (!maplibreMap) return null;
      const point = maplibreMap.project([lng, lat]);
      return { x: point.x, y: point.y };
    }
    if (activeTab === 'map') {
      if (!leafletMap) return null;
      const point = leafletMap.latLngToContainerPoint([lat, lng]);
      return { x: point.x, y: point.y };
    }
    return null;
  };

  const pins: { thread: CommentThread; point: ScreenPoint }[] = [];
  for (const thread of commentThreads(comments)) {
    const anchor = thread.root.anchor;
    if (!anchor?.placed || thread.root.resolved) continue;
    const point = project(anchor.lng, anchor.lat);
    if (!point || outsideContainer(point, size)) continue;
    pins.push({ thread, point });
  }

  const opened = pins.find((pin) => pin.thread.root.id === openThreadId);
  const draftPoint = draft ? project(draft.lng, draft.lat) : null;

  const sendDraft = () => {
    if (!draft) return;
    const posted = postComment({
      text: draftText,
      anchor: { lng: draft.lng, lat: draft.lat, zoom: currentMapAnchor().zoom, placed: true },
      mentions: draftMentions,
    });
    if (!posted) return;
    setDraftText('');
    setDraftMentions([]);
    openThread(posted.id);
  };

  const discardDraft = () => {
    setDraftText('');
    setDraftMentions([]);
    closeDraft();
  };

  return (
    <div
      ref={rootRef}
      data-testid="map-comments-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
    >
      {pins.map(({ thread, point }) => (
        <UnstyledButton
          key={thread.root.id}
          data-testid="comment-pin"
          aria-label={`Comment by ${thread.root.authorName}`}
          onClick={(event) => {
            event.stopPropagation();
            openThread(thread.root.id);
          }}
          style={{
            position: 'absolute',
            left: point.x,
            top: point.y - PIN_SIZE,
            width: PIN_SIZE,
            height: PIN_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // the sharp corner is the bubble's tail, sitting on the anchor point
            borderRadius: '50% 50% 50% 2px',
            background: 'var(--mantine-color-violet-6)',
            border: '2px solid var(--mantine-color-white)',
            color: 'var(--mantine-color-white)',
            pointerEvents: 'auto',
          }}
        >
          <IconMessage size={12} />
        </UnstyledButton>
      ))}

      {opened && (
        <FloatingBox point={opened.point} size={size}>
          <Group justify="flex-end" gap={0}>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label="Close comment thread"
              onClick={closeThread}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
          <Thread
            thread={opened.thread}
            ownActor={ownActor}
            canWrite={canWrite}
            candidates={candidates}
            documentId={documentId}
            highlighted={false}
          />
        </FloatingBox>
      )}

      {canWrite && draft && draftPoint && (
        <FloatingBox point={draftPoint} size={size}>
          <Stack
            gap={6}
            onKeyDown={(event) => {
              if (event.key === 'Escape') discardDraft();
            }}
          >
            <Group justify="flex-end" gap={0}>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                aria-label="Discard comment"
                onClick={discardDraft}
              >
                <IconX size={12} />
              </ActionIcon>
            </Group>
            <MentionTextarea
              value={draftText}
              onChange={setDraftText}
              onPick={(mention) => setDraftMentions((picked) => [...picked, mention])}
              candidates={candidates}
              placeholder="Comment on this spot…"
              ariaLabel="Comment on this spot"
              minRows={2}
              maxRows={5}
              testId="map-comment-compose"
            />
            <Button
              size="compact-xs"
              color="violet"
              disabled={!draftText.trim()}
              data-testid="map-comment-submit"
              onClick={sendDraft}
            >
              Send
            </Button>
          </Stack>
        </FloatingBox>
      )}
    </div>
  );
}
