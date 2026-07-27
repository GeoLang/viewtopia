import { useEffect, useRef, useState } from 'react';
import {
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
} from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';

/** Zoom step as a fraction of camera height, so a click feels equal at any altitude. */
const ZOOM_FRACTION = 0.4;
/** Compass drag sensitivity, matching maplibre's feel. */
const DRAG_DEG_PER_PX = 0.5;
/** Below this movement a pointer press counts as a click (reset north). */
const CLICK_SLOP_PX = 3;

const buttonStyle: React.CSSProperties = {
  width: 29,
  height: 29,
  display: 'block',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: '29px',
  padding: 0,
  color: '#333',
};

/**
 * Zoom + compass for the Cesium globe, mirroring MapLibre's NavigationControl
 * (CesiumJS ships no built-in equivalent). Reads the viewer from the registry:
 * the viewer is created after this mounts, so attachment polls until it exists.
 */
export function CesiumNavControl() {
  const [headingDeg, setHeadingDeg] = useState(0);

  useEffect(() => {
    let detach: (() => void) | null = null;
    const timer = setInterval(() => {
      const viewer = getActiveCesiumViewer();
      if (!viewer) return;
      clearInterval(timer);
      const onRender = () => {
        if (viewer.isDestroyed()) return;
        const deg = CesiumMath.toDegrees(viewer.camera.heading);
        // re-render only on visible needle movement
        setHeadingDeg((prev) => (Math.abs(deg - prev) > 0.5 ? deg : prev));
      };
      viewer.scene.postRender.addEventListener(onRender);
      detach = () => {
        if (!viewer.isDestroyed()) viewer.scene.postRender.removeEventListener(onRender);
      };
    }, 100);
    return () => {
      clearInterval(timer);
      detach?.();
    };
  }, []);

  const zoom = (dir: 1 | -1) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const height = viewer.camera.positionCartographic?.height ?? 1_000_000;
    const amount = height * ZOOM_FRACTION;
    if (dir > 0) viewer.camera.zoomIn(amount);
    else viewer.camera.zoomOut(amount);
  };

  // setView, not flyTo: a zero-distance flight (same position, new heading)
  // completes without applying the orientation, verified live
  const resetNorth = () => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    viewer.camera.setView({
      orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
    });
  };

  /** Turn the camera to a heading, rotating about the globe point at screen
   * center (like cesium's own middle-drag); off-globe views turn in place. */
  const rotateTo = (headingRad: number) => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    const canvas = viewer.scene.canvas;
    const target = viewer.camera.pickEllipsoid(
      new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
    );
    if (target) {
      const range = Cartesian3.distance(viewer.camera.position, target);
      viewer.camera.lookAt(
        target,
        new HeadingPitchRange(headingRad, viewer.camera.pitch, range),
      );
      // lookAt pins the camera to the target's frame; release it or every
      // later camera move orbits the target
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    } else {
      viewer.camera.setView({
        orientation: { heading: headingRad, pitch: viewer.camera.pitch, roll: 0 },
      });
    }
  };

  const drag = useRef<{ startX: number; lastX: number; moved: boolean } | null>(null);

  const onCompassDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, lastX: e.clientX, moved: false };
  };

  const onCompassMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = drag.current;
    if (!st) return;
    if (Math.abs(e.clientX - st.startX) > CLICK_SLOP_PX) st.moved = true;
    const dx = e.clientX - st.lastX;
    st.lastX = e.clientX;
    if (!st.moved || dx === 0) return;
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    rotateTo(viewer.camera.heading + CesiumMath.toRadians(dx * DRAG_DEG_PER_PX));
  };

  const onCompassUp = () => {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (!wasDrag) resetNorth();
  };

  // a cancelled press (capture lost, touch interrupted) is neither click nor drag
  const onCompassCancel = () => {
    drag.current = null;
  };

  return (
    <div
      data-testid="cesium-nav-control"
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 0 0 2px rgba(0,0,0,.1)',
      }}
    >
      <button
        type="button"
        aria-label="Zoom in"
        style={{ ...buttonStyle, borderBottom: '1px solid #ddd' }}
        onClick={() => zoom(1)}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        style={{ ...buttonStyle, borderBottom: '1px solid #ddd' }}
        onClick={() => zoom(-1)}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Reset bearing to north"
        style={{ ...buttonStyle, touchAction: 'none' }}
        onPointerDown={onCompassDown}
        onPointerMove={onCompassMove}
        onPointerUp={onCompassUp}
        onPointerCancel={onCompassCancel}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          role="img"
          aria-hidden="true"
          style={{
            verticalAlign: 'middle',
            transform: `rotate(${-headingDeg}deg)`,
          }}
        >
          <path d="M12 2 L16 12 L12 10 L8 12 Z" fill="#e33" />
          <path d="M12 22 L16 12 L12 14 L8 12 Z" fill="#999" />
        </svg>
      </button>
    </div>
  );
}
