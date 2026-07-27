import { useEffect, useState } from 'react';
import { Math as CesiumMath } from 'cesium';
import { getActiveCesiumViewer } from '../viewer/registry';
import { useAccessibilityStore } from '../store/accessibility';

/** Zoom step as a fraction of camera height, so a click feels equal at any altitude. */
const ZOOM_FRACTION = 0.4;

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
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);

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

  const resetNorth = () => {
    const viewer = getActiveCesiumViewer();
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: viewer.camera.position.clone(),
      orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
      duration: reduceMotion ? 0 : 0.5,
    });
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
        style={buttonStyle}
        onClick={resetNorth}
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
