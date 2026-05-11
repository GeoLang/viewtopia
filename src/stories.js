/**
 * Story Player — narrated 3D presentations with camera transitions.
 * Ported from TileTopia's stories.js for ViewTopia.
 */
import * as Cesium from 'cesium';
import { getCesiumViewer } from './renderers.js';
import { hasTileTopia } from './backends.js';

const API = '/api/v1';
let player = null;

export function getStoryPlayer() {
  if (!player) {
    const viewer = getCesiumViewer();
    if (viewer) player = new StoryPlayer(viewer);
  }
  return player;
}

export function initStories() {
  const toolbar = document.getElementById('toolbar-actions');
  if (!toolbar) return;

  const btn = document.createElement('button');
  btn.className = 'map-action-btn';
  btn.id = 'story-btn';
  btn.title = 'Stories';
  btn.textContent = '📖 Stories';
  toolbar.appendChild(btn);

  btn.addEventListener('click', () => {
    const sp = getStoryPlayer();
    if (sp) sp.showList();
  });
}

class StoryPlayer {
  constructor(viewer) {
    this.viewer = viewer;
    this.story = null;
    this.currentIndex = 0;
    this.playing = false;
    this.timer = null;
    this.annotationEntities = [];
    this._createControls();
    this._createListPanel();
  }

  load(story) {
    this.story = story;
    this.currentIndex = 0;
    this.playing = false;
    this._clearTimer();
    this._showControls(true);
    this._hideListPanel();
    this._updateUI();
    if (story.slides?.length > 0) this.goToSlide(0);
  }

  play() {
    if (!this.story?.slides?.length) return;
    this.playing = true;
    this._updateUI();
    this._scheduleNext();
  }

  pause() {
    this.playing = false;
    this._clearTimer();
    this._updateUI();
  }

  nextSlide() {
    if (!this.story) return;
    if (this.currentIndex < this.story.slides.length - 1) this.goToSlide(this.currentIndex + 1);
  }

  prevSlide() {
    if (!this.story) return;
    if (this.currentIndex > 0) this.goToSlide(this.currentIndex - 1);
  }

  goToSlide(index) {
    if (!this.story || index < 0 || index >= this.story.slides.length) return;
    this.currentIndex = index;
    const slide = this.story.slides[index];
    this._flyToCamera(slide.camera, slide.transition, slide.duration_seconds);
    this._showAnnotations(slide.annotations || []);
    this._updateUI();
    if (this.playing) this._scheduleNext();
  }

  stop() {
    this.playing = false;
    this._clearTimer();
    this._clearAnnotations();
    this._showControls(false);
    this.story = null;
  }

  async showList() {
    const panel = document.getElementById('story-list-panel');
    if (!panel) return;

    if (panel.style.display === 'block') {
      panel.style.display = 'none';
      return;
    }

    panel.querySelector('.sl-body').innerHTML = '<div class="bk-empty">Loading…</div>';
    panel.style.display = 'block';

    // Fetch stories from TileTopia
    if (hasTileTopia()) {
      try {
        const res = await fetch(`${API}/stories`);
        if (res.ok) {
          const stories = await res.json();
          this._renderStoryList(stories);
          return;
        }
      } catch { /* ignore */ }
    }

    // Demo story
    this._renderStoryList([{
      id: 'demo',
      title: 'Welcome Tour',
      description: 'A quick tour of the world',
      slides: [
        { title: 'New York', camera: { longitude: -74.006, latitude: 40.7128, height: 5000, heading: 0, pitch: -30 }, duration_seconds: 4 },
        { title: 'London', camera: { longitude: -0.1278, latitude: 51.5074, height: 5000, heading: 0, pitch: -30 }, duration_seconds: 4 },
        { title: 'Tokyo', camera: { longitude: 139.6917, latitude: 35.6895, height: 5000, heading: 0, pitch: -30 }, duration_seconds: 4 },
        { title: 'Sydney', camera: { longitude: 151.2093, latitude: -33.8688, height: 5000, heading: 0, pitch: -30 }, duration_seconds: 4 },
      ],
    }]);
  }

  _renderStoryList(stories) {
    const body = document.querySelector('.sl-body');
    if (!body) return;
    if (stories.length === 0) {
      body.innerHTML = '<div class="bk-empty">No stories available</div>';
      return;
    }
    body.innerHTML = stories.map(s => `
      <div class="sl-item" data-id="${s.id}">
        <div class="bk-name">${escapeHtml(s.title)}</div>
        <div class="bk-coords">${escapeHtml(s.description || '')} — ${s.slides?.length || 0} slides</div>
      </div>
    `).join('');

    body.querySelectorAll('.sl-item').forEach(item => {
      item.addEventListener('click', () => {
        const story = stories.find(s => String(s.id) === item.dataset.id);
        if (story) this.load(story);
      });
    });
  }

  _flyToCamera(camera, transition, duration) {
    if (!camera) return;
    const dest = Cesium.Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height);
    const heading = Cesium.Math.toRadians(camera.heading || 0);
    const pitch = Cesium.Math.toRadians(camera.pitch || -30);
    const roll = Cesium.Math.toRadians(camera.roll || 0);

    if (transition === 'cut') {
      this.viewer.camera.setView({ destination: dest, orientation: { heading, pitch, roll } });
    } else {
      this.viewer.camera.flyTo({
        destination: dest,
        orientation: { heading, pitch, roll },
        duration: transition === 'fade' ? 1.0 : (duration || 3.0),
      });
    }
  }

  _showAnnotations(annotations) {
    this._clearAnnotations();
    for (const ann of annotations) {
      const entity = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ann.longitude, ann.latitude, ann.height || 0),
        label: {
          text: ann.text, font: '14px sans-serif', fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
      });
      this.annotationEntities.push(entity);
    }
  }

  _clearAnnotations() {
    for (const e of this.annotationEntities) this.viewer.entities.remove(e);
    this.annotationEntities = [];
  }

  _scheduleNext() {
    this._clearTimer();
    if (!this.story || !this.playing) return;
    const slide = this.story.slides[this.currentIndex];
    const delay = (slide.duration_seconds || 5) * 1000;
    this.timer = setTimeout(() => {
      if (this.currentIndex < this.story.slides.length - 1) this.goToSlide(this.currentIndex + 1);
      else this.pause();
    }, delay);
  }

  _clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  _createControls() {
    const bar = document.createElement('div');
    bar.id = 'story-player-bar';
    bar.className = 'story-player-bar';
    bar.style.display = 'none';
    bar.innerHTML = `
      <button id="sp-prev" title="Previous">⏮</button>
      <button id="sp-play" title="Play/Pause">▶</button>
      <button id="sp-next" title="Next">⏭</button>
      <span id="sp-progress" class="sp-progress">0 / 0</span>
      <div id="sp-title" class="sp-title"></div>
      <button id="sp-close" title="Stop">✕</button>
    `;
    const vizContent = document.getElementById('viz-content') || document.body;
    vizContent.appendChild(bar);

    bar.querySelector('#sp-prev').addEventListener('click', () => this.prevSlide());
    bar.querySelector('#sp-play').addEventListener('click', () => { if (this.playing) this.pause(); else this.play(); });
    bar.querySelector('#sp-next').addEventListener('click', () => this.nextSlide());
    bar.querySelector('#sp-close').addEventListener('click', () => this.stop());
  }

  _createListPanel() {
    const panel = document.createElement('div');
    panel.id = 'story-list-panel';
    panel.className = 'bookmark-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="bk-header"><span>📖 Stories</span><button class="bk-close">&times;</button></div>
      <div class="sl-body bk-list"></div>
    `;
    const vizContent = document.getElementById('viz-content') || document.body;
    vizContent.appendChild(panel);
    panel.querySelector('.bk-close').addEventListener('click', () => { panel.style.display = 'none'; });
  }

  _hideListPanel() {
    const panel = document.getElementById('story-list-panel');
    if (panel) panel.style.display = 'none';
  }

  _showControls(visible) {
    const bar = document.getElementById('story-player-bar');
    if (bar) bar.style.display = visible ? 'flex' : 'none';
  }

  _updateUI() {
    if (!this.story) return;
    const progress = document.getElementById('sp-progress');
    const playBtn = document.getElementById('sp-play');
    const title = document.getElementById('sp-title');
    if (progress) progress.textContent = `${this.currentIndex + 1} / ${this.story.slides.length}`;
    if (playBtn) playBtn.textContent = this.playing ? '⏸' : '▶';
    if (title) title.textContent = this.story.slides[this.currentIndex]?.title || this.story.title;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
