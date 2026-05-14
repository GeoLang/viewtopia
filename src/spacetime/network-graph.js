/**
 * Network Graph Visualization — render entity relationships as an
 * interactive force-directed network diagram.
 *
 * GeoTime-style link analysis: nodes = entities, edges = relationships.
 * Uses d3-force layout algorithm (implemented from scratch to avoid dependency).
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} color
 * @property {string} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} source
 * @property {string} target
 * @property {string} type
 * @property {number} strength
 * @property {string} label
 */

let graphPanel = null;
let canvas = null;
let ctx = null;
let nodes = [];
let edges = [];
let simRunning = false;
let animFrame = null;
let dragNode = null;
let hoveredNode = null;
let onNodeClick = null;

const WIDTH = 600;
const HEIGHT = 450;

/**
 * Build graph from entities and links.
 * @param {Map<string, import('./models.js').Entity>} entities
 * @param {import('./models.js').Link[]} links
 * @param {Object} opts
 * @param {Function} [opts.onNodeClick]
 */
export function showNetworkGraph(entities, links, opts = {}) {
  onNodeClick = opts.onNodeClick || null;

  // Build nodes
  nodes = [];
  const nodeIds = new Set();
  for (const [id, entity] of entities) {
    nodes.push({
      id,
      label: entity.name,
      color: entity.color,
      kind: entity.kind,
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: 0,
      vy: 0,
    });
    nodeIds.add(id);
  }

  // Build edges
  edges = [];
  for (const link of links) {
    if (nodeIds.has(link.sourceId) && nodeIds.has(link.targetId)) {
      edges.push({
        source: link.sourceId,
        target: link.targetId,
        type: link.kind,
        strength: link.strength ?? 0.5,
        label: link.kind,
      });
    }
  }

  createPanel();
  startSimulation();
}

export function hideNetworkGraph() {
  if (graphPanel) graphPanel.style.display = 'none';
  stopSimulation();
}

function createPanel() {
  if (!graphPanel) {
    graphPanel = document.createElement('div');
    graphPanel.id = 'network-graph-panel';
    graphPanel.className = 'network-graph-panel';
    graphPanel.innerHTML = `
      <div class="ng-header">
        <span>Link Analysis</span>
        <button class="st-btn ng-close">✕</button>
      </div>
      <canvas class="ng-canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
      <div class="ng-legend"></div>
    `;
    document.body.appendChild(graphPanel);

    canvas = graphPanel.querySelector('.ng-canvas');
    ctx = canvas.getContext('2d');
    graphPanel.querySelector('.ng-close').onclick = () => hideNetworkGraph();

    // Interaction
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);
  }

  graphPanel.style.display = '';

  // Legend
  const types = [...new Set(edges.map(e => e.type))];
  const legendEl = graphPanel.querySelector('.ng-legend');
  legendEl.innerHTML = types.map(t => `<span class="ng-leg-item">${t}</span>`).join('');
}

// --- Force-directed layout (simplified Fruchterman-Reingold) ---

function startSimulation() {
  simRunning = true;
  tick();
}

function stopSimulation() {
  simRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;
}

function tick() {
  if (!simRunning) return;
  stepSimulation();
  draw();
  animFrame = requestAnimationFrame(tick);
}

function stepSimulation() {
  const k = Math.sqrt((WIDTH * HEIGHT) / Math.max(1, nodes.length));
  const repulsion = k * 30;
  const cooling = 0.95;

  // Repulsive forces between all node pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = repulsion / dist;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx += fx;
      nodes[i].vy += fy;
      nodes[j].vx -= fx;
      nodes[j].vy -= fy;
    }
  }

  // Attractive forces along edges
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const force = (dist * dist) / k * edge.strength;
    const fx = (dx / dist) * force * 0.01;
    const fy = (dy / dist) * force * 0.01;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Center gravity
  for (const node of nodes) {
    node.vx += (WIDTH / 2 - node.x) * 0.001;
    node.vy += (HEIGHT / 2 - node.y) * 0.001;
  }

  // Apply velocity + cooling + bounds
  for (const node of nodes) {
    if (node === dragNode) continue;
    node.vx *= cooling;
    node.vy *= cooling;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(20, Math.min(WIDTH - 20, node.x));
    node.y = Math.max(20, Math.min(HEIGHT - 20, node.y));
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Draw edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(150,150,150,${0.3 + edge.strength * 0.7})`;
    ctx.lineWidth = 1 + edge.strength * 2;
    ctx.stroke();

    // Label at midpoint
    if (edge.label) {
      ctx.fillStyle = '#888';
      ctx.font = '9px sans-serif';
      ctx.fillText(edge.label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4);
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const r = node === hoveredNode ? 10 : 7;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, node.x, node.y + r + 12);
  }
}

// --- Mouse interaction ---

function getNodeAt(x, y) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = x - n.x, dy = y - n.y;
    if (dx * dx + dy * dy < 100) return n;
  }
  return null;
}

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e) {
  const { x, y } = canvasCoords(e);
  dragNode = getNodeAt(x, y);
}

function onMouseMove(e) {
  const { x, y } = canvasCoords(e);
  if (dragNode) {
    dragNode.x = x;
    dragNode.y = y;
    dragNode.vx = 0;
    dragNode.vy = 0;
  }
  hoveredNode = getNodeAt(x, y);
  canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
}

function onMouseUp() {
  dragNode = null;
}

function onDblClick(e) {
  const { x, y } = canvasCoords(e);
  const node = getNodeAt(x, y);
  if (node && onNodeClick) onNodeClick(node.id);
}
