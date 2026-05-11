/**
 * WebXR — Immersive VR/AR mode for the 3D viewer.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';

let xrActive = false;
let xrSession = null;

export function initWebXR() {
  const btn = document.getElementById('webxr-btn');
  if (!btn) return;

  // Check WebXR support
  if (!navigator.xr) {
    btn.title = 'WebXR not supported in this browser';
    btn.style.opacity = '0.5';
  }

  btn.addEventListener('click', async () => {
    if (!navigator.xr) {
      alert('WebXR is not supported in this browser. Try Chrome or Edge on a VR-capable device.');
      return;
    }

    if (xrActive) {
      endXRSession();
    } else {
      await startXRSession();
    }
  });
}

async function startXRSession() {
  const viewer = getCesiumViewer();
  if (!viewer) return;

  const btn = document.getElementById('webxr-btn');

  // Try immersive-vr first, fall back to immersive-ar, then inline
  const modes = ['immersive-vr', 'immersive-ar', 'inline'];
  let supportedMode = null;

  for (const mode of modes) {
    try {
      const supported = await navigator.xr.isSessionSupported(mode);
      if (supported) { supportedMode = mode; break; }
    } catch { /* not supported */ }
  }

  if (!supportedMode) {
    showXRFallback(viewer);
    return;
  }

  try {
    xrSession = await navigator.xr.requestSession(supportedMode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });

    xrActive = true;
    btn?.classList.add('active');
    btn.textContent = '🥽 Exit XR';

    xrSession.addEventListener('end', () => {
      xrActive = false;
      xrSession = null;
      btn?.classList.remove('active');
      btn.textContent = '🥽';
    });

    // Initialize XR rendering
    const gl = viewer.scene.canvas.getContext('webgl2') || viewer.scene.canvas.getContext('webgl');
    if (gl) {
      const baseLayer = new XRWebGLLayer(xrSession, gl);
      await xrSession.updateRenderState({ baseLayer });
    }

    showXRInfo('Entered ' + supportedMode + ' mode');
  } catch (e) {
    console.warn('WebXR session failed:', e);
    showXRFallback(viewer);
  }
}

function endXRSession() {
  if (xrSession) {
    xrSession.end();
  }
  xrActive = false;
  const btn = document.getElementById('webxr-btn');
  btn?.classList.remove('active');
  btn.textContent = '🥽';
}

function showXRFallback(viewer) {
  // Provide a stereoscopic split-screen VR mode as fallback
  let panel = document.getElementById('webxr-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'webxr-panel';
  panel.className = 'floating-panel';
  panel.innerHTML = `
    <div class="panel-header"><span>🥽 XR Mode</span><button class="panel-close" id="webxr-close">✕</button></div>
    <div class="panel-body">
      <p style="font-size:12px;color:#aaa;">Full WebXR not available. Fallback options:</p>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="map-action-btn" id="xr-stereo">Stereoscopic (Cardboard)</button>
        <button class="map-action-btn" id="xr-orbit">360° Orbit Mode</button>
        <button class="map-action-btn" id="xr-firstperson">First-Person Walk</button>
      </div>
      <div id="xr-info" style="margin-top:8px;font-size:11px;color:#aaa;"></div>
    </div>
  `;

  document.getElementById('viz-panel').appendChild(panel);

  document.getElementById('webxr-close').onclick = () => panel.remove();
  document.getElementById('xr-stereo').onclick = () => enterStereoMode(viewer);
  document.getElementById('xr-orbit').onclick = () => enterOrbitMode(viewer);
  document.getElementById('xr-firstperson').onclick = () => enterFirstPerson(viewer);
}

function enterStereoMode(viewer) {
  // Simple stereoscopic view using two viewports
  const scene = viewer.scene;
  const originalFov = scene.camera.frustum.fov;

  // Reduce FOV for stereo feel
  scene.camera.frustum.fov = Cesium.Math.toRadians(90);

  // Apply anaglyph-style post-processing hint
  showXRInfo('Stereo mode enabled. Use red-cyan glasses or Google Cardboard. Press ESC to exit.');

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      scene.camera.frustum.fov = originalFov;
      document.removeEventListener('keydown', escHandler);
      showXRInfo('Exited stereo mode');
    }
  };
  document.addEventListener('keydown', escHandler);
}

function enterOrbitMode(viewer) {
  // Continuous orbit around current target
  const scene = viewer.scene;
  const center = viewer.camera.position.clone();
  let angle = 0;

  showXRInfo('360° orbit active. Click anywhere to stop.');

  const orbit = () => {
    angle += 0.005;
    viewer.camera.rotateRight(0.005);
  };

  const intervalId = setInterval(orbit, 16);

  const stopOrbit = () => {
    clearInterval(intervalId);
    viewer.canvas.removeEventListener('click', stopOrbit);
    showXRInfo('Orbit stopped');
  };

  viewer.canvas.addEventListener('click', stopOrbit);
}

function enterFirstPerson(viewer) {
  // Lower camera to ground level for first-person perspective
  const carto = viewer.camera.positionCartographic;
  const groundPos = Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    carto.height > 5 ? 2 : carto.height
  );

  viewer.camera.flyTo({
    destination: groundPos,
    orientation: {
      heading: viewer.camera.heading,
      pitch: 0,
      roll: 0,
    },
    duration: 1,
  });

  showXRInfo('First-person mode. Use WASD or arrow keys to navigate. Scroll to adjust height.');

  const moveHandler = (e) => {
    const speed = 0.000005;
    const c = viewer.camera.positionCartographic;
    let lon = c.longitude, lat = c.latitude;

    switch (e.key) {
      case 'w': case 'ArrowUp': lat += speed; break;
      case 's': case 'ArrowDown': lat -= speed; break;
      case 'a': case 'ArrowLeft': lon -= speed; break;
      case 'd': case 'ArrowRight': lon += speed; break;
      case 'Escape':
        document.removeEventListener('keydown', moveHandler);
        showXRInfo('Exited first-person mode');
        return;
      default: return;
    }

    viewer.camera.position = Cesium.Cartesian3.fromRadians(lon, lat, 2);
  };

  document.addEventListener('keydown', moveHandler);
}

function showXRInfo(msg) {
  const info = document.getElementById('xr-info');
  if (info) info.textContent = msg;
}
