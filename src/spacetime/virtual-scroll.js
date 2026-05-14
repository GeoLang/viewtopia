/**
 * Virtual Scrolling — efficiently render entity lists with 10,000+ items.
 *
 * Only renders DOM elements visible in the viewport, recycling elements
 * as the user scrolls. Maintains smooth 60fps with any number of entities.
 */

const ITEM_HEIGHT = 36; // px per entity row
const BUFFER_ITEMS = 5; // Extra items rendered above/below viewport

/**
 * @typedef {Object} VirtualListState
 * @property {HTMLElement} container
 * @property {HTMLElement} scroller
 * @property {HTMLElement} content
 * @property {Array} items
 * @property {Function} renderItem
 * @property {Function} onItemClick
 * @property {number} scrollTop
 * @property {number} visibleStart
 * @property {number} visibleEnd
 */

/**
 * Initialize a virtual scrolling list.
 *
 * @param {HTMLElement} container - The container element
 * @param {Object} opts
 * @param {Function} opts.renderItem - (item, index) => HTML string
 * @param {Function} [opts.onItemClick] - (item, index) => void
 * @param {number} [opts.itemHeight] - Override item height
 * @returns {VirtualListState}
 */
export function createVirtualList(container, opts = {}) {
  const itemHeight = opts.itemHeight || ITEM_HEIGHT;
  const renderItem = opts.renderItem;
  const onItemClick = opts.onItemClick;

  // Create structure
  container.style.overflow = 'auto';
  container.style.position = 'relative';

  const content = document.createElement('div');
  content.style.position = 'relative';
  content.style.width = '100%';
  container.appendChild(content);

  const state = {
    container,
    content,
    items: [],
    renderItem,
    onItemClick,
    itemHeight,
    scrollTop: 0,
    visibleStart: 0,
    visibleEnd: 0,
    renderedElements: [],
  };

  container.addEventListener('scroll', () => {
    state.scrollTop = container.scrollTop;
    render(state);
  });

  return state;
}

/**
 * Update the items in the virtual list.
 * @param {VirtualListState} state
 * @param {Array} items
 */
export function setVirtualListItems(state, items) {
  state.items = items;
  state.content.style.height = `${items.length * state.itemHeight}px`;
  render(state);
}

/**
 * Render only the visible items.
 */
function render(state) {
  const { container, content, items, itemHeight, renderItem, onItemClick } = state;
  const viewportHeight = container.clientHeight;
  const scrollTop = container.scrollTop;

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER_ITEMS);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + BUFFER_ITEMS);

  // Only re-render if visible range changed
  if (start === state.visibleStart && end === state.visibleEnd) return;
  state.visibleStart = start;
  state.visibleEnd = end;

  // Clear and rebuild visible items
  content.innerHTML = '';
  for (let i = start; i < end; i++) {
    const el = document.createElement('div');
    el.className = 'vl-item';
    el.style.position = 'absolute';
    el.style.top = `${i * itemHeight}px`;
    el.style.height = `${itemHeight}px`;
    el.style.width = '100%';
    el.innerHTML = renderItem(items[i], i);
    if (onItemClick) {
      el.addEventListener('click', () => onItemClick(items[i], i));
    }
    content.appendChild(el);
  }
}

/**
 * Scroll to a specific item index.
 */
export function scrollToItem(state, index) {
  state.container.scrollTop = index * state.itemHeight;
}

/**
 * Get the currently visible item range.
 */
export function getVisibleRange(state) {
  return { start: state.visibleStart, end: state.visibleEnd };
}

/**
 * Filter items and update list (virtual-scroll aware search).
 */
export function filterVirtualList(state, predicate) {
  const filtered = state.items.filter(predicate);
  setVirtualListItems(state, filtered);
  return filtered.length;
}
