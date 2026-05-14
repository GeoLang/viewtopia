/**
 * Classification & RBAC — security classification markings and access control.
 *
 * Implements classification levels, compartments, and access checks
 * for entities, links, attachments, and analysis results.
 */

/**
 * @typedef {Object} ClassificationLevel
 * @property {string} id
 * @property {string} label
 * @property {number} rank - Higher = more restricted
 * @property {string} color
 * @property {string} banner - Text shown in classification banner
 */

/**
 * @typedef {Object} UserClearance
 * @property {string} userId
 * @property {string} displayName
 * @property {string} level - Classification level ID
 * @property {string[]} compartments - Compartment access list
 * @property {string} role - 'viewer'|'analyst'|'admin'
 */

/** @type {ClassificationLevel[]} */
const CLASSIFICATION_LEVELS = [
  { id: 'unclassified', label: 'UNCLASSIFIED', rank: 0, color: '#10b981', banner: 'UNCLASSIFIED' },
  { id: 'cui', label: 'CUI', rank: 1, color: '#06b6d4', banner: 'CUI // CONTROLLED UNCLASSIFIED INFORMATION' },
  { id: 'confidential', label: 'CONFIDENTIAL', rank: 2, color: '#3b82f6', banner: 'CONFIDENTIAL' },
  { id: 'secret', label: 'SECRET', rank: 3, color: '#f59e0b', banner: 'SECRET' },
  { id: 'top_secret', label: 'TOP SECRET', rank: 4, color: '#ef4444', banner: 'TOP SECRET' },
  { id: 'ts_sci', label: 'TS/SCI', rank: 5, color: '#dc2626', banner: 'TOP SECRET // SCI' },
];

/** @type {string[]} */
const COMPARTMENTS = ['SIGINT', 'HUMINT', 'IMINT', 'MASINT', 'OSINT', 'FININT', 'GEOINT', 'CYBER'];

/** @type {UserClearance|null} */
let currentUser = null;

/**
 * Set the current user's clearance.
 */
export function setUserClearance(clearance) {
  currentUser = clearance;
  updateClassificationBanner();
}

/**
 * Get current user clearance.
 */
export function getUserClearance() {
  return currentUser;
}

/**
 * Get all classification levels.
 */
export function getClassificationLevels() {
  return CLASSIFICATION_LEVELS;
}

/**
 * Get all compartments.
 */
export function getCompartments() {
  return COMPARTMENTS;
}

/**
 * Get classification level by ID.
 */
export function getLevel(id) {
  return CLASSIFICATION_LEVELS.find(l => l.id === id);
}

/**
 * Check if user has access to a classified item.
 *
 * @param {string} itemLevel - Classification level of the item
 * @param {string[]} [itemCompartments] - Required compartments
 * @returns {{ allowed: boolean, reason: string }}
 */
export function checkAccess(itemLevel, itemCompartments) {
  if (!currentUser) {
    return { allowed: false, reason: 'No user clearance set' };
  }

  const userLevel = CLASSIFICATION_LEVELS.find(l => l.id === currentUser.level);
  const itemLevelDef = CLASSIFICATION_LEVELS.find(l => l.id === itemLevel);

  if (!userLevel || !itemLevelDef) {
    return { allowed: false, reason: 'Unknown classification level' };
  }

  // Check level
  if (userLevel.rank < itemLevelDef.rank) {
    return { allowed: false, reason: `Requires ${itemLevelDef.label} clearance (you have ${userLevel.label})` };
  }

  // Check compartments
  if (itemCompartments && itemCompartments.length > 0) {
    const missing = itemCompartments.filter(c => !currentUser.compartments.includes(c));
    if (missing.length > 0) {
      return { allowed: false, reason: `Missing compartment access: ${missing.join(', ')}` };
    }
  }

  return { allowed: true, reason: '' };
}

/**
 * Check role-based permission.
 */
export function checkPermission(requiredRole) {
  if (!currentUser) return false;
  const roles = { viewer: 0, analyst: 1, admin: 2 };
  return (roles[currentUser.role] || 0) >= (roles[requiredRole] || 0);
}

/**
 * Classify an entity/link/attachment.
 */
export function classifyItem(item, level, compartments) {
  item.classification = level;
  item.compartments = compartments || [];
  return item;
}

/**
 * Format classification marking string (e.g., "SECRET // SIGINT / HUMINT").
 */
export function formatMarking(level, compartments) {
  const levelDef = CLASSIFICATION_LEVELS.find(l => l.id === level);
  let marking = levelDef?.label || level.toUpperCase();
  if (compartments && compartments.length > 0) {
    marking += ' // ' + compartments.join(' / ');
  }
  return marking;
}

/**
 * Filter a collection based on user access.
 */
export function filterByAccess(items) {
  return items.filter(item => {
    const result = checkAccess(item.classification || 'unclassified', item.compartments);
    return result.allowed;
  });
}

/**
 * Update the classification banner in the UI.
 */
function updateClassificationBanner() {
  let banner = document.getElementById('classification-banner');

  if (!currentUser) {
    if (banner) banner.remove();
    return;
  }

  const level = CLASSIFICATION_LEVELS.find(l => l.id === currentUser.level) || CLASSIFICATION_LEVELS[0];

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'classification-banner';
    banner.className = 'classification-banner';
    document.body.prepend(banner);
  }

  banner.style.backgroundColor = level.color;
  banner.style.color = level.rank >= 3 ? '#fff' : '#000';
  banner.textContent = level.banner;

  // Also add bottom banner
  let bottomBanner = document.getElementById('classification-banner-bottom');
  if (!bottomBanner) {
    bottomBanner = document.createElement('div');
    bottomBanner.id = 'classification-banner-bottom';
    bottomBanner.className = 'classification-banner classification-banner-bottom';
    document.body.appendChild(bottomBanner);
  }
  bottomBanner.style.backgroundColor = level.color;
  bottomBanner.style.color = level.rank >= 3 ? '#fff' : '#000';
  bottomBanner.textContent = level.banner;
}

/**
 * Show classification dialog for an item.
 */
export function showClassificationDialog(currentLevel, currentCompartments, onSave) {
  let dialog = document.getElementById('classification-dialog');
  if (dialog) dialog.remove();

  dialog = document.createElement('div');
  dialog.id = 'classification-dialog';
  dialog.className = 'classification-dialog';

  dialog.innerHTML = `
    <div class="cd-header">
      <h3>Set Classification</h3>
      <button class="cd-close">&times;</button>
    </div>
    <div class="cd-body">
      <label>Classification Level
        <select class="cd-level">
          ${CLASSIFICATION_LEVELS.map(l =>
            `<option value="${l.id}" ${l.id === currentLevel ? 'selected' : ''}>${l.label}</option>`
          ).join('')}
        </select>
      </label>
      <label>Compartments
        <div class="cd-compartments">
          ${COMPARTMENTS.map(c =>
            `<label class="cd-comp-item">
              <input type="checkbox" value="${c}" ${(currentCompartments || []).includes(c) ? 'checked' : ''}>
              ${c}
            </label>`
          ).join('')}
        </div>
      </label>
      <div class="cd-preview"></div>
      <div class="cd-actions">
        <button class="st-btn cd-cancel">Cancel</button>
        <button class="st-btn cd-save">Apply</button>
      </div>
    </div>
  `;

  const updatePreview = () => {
    const level = dialog.querySelector('.cd-level').value;
    const comps = [...dialog.querySelectorAll('.cd-compartments input:checked')].map(i => i.value);
    dialog.querySelector('.cd-preview').textContent = formatMarking(level, comps);
  };

  dialog.querySelector('.cd-level').addEventListener('change', updatePreview);
  dialog.querySelectorAll('.cd-compartments input').forEach(i => i.addEventListener('change', updatePreview));
  updatePreview();

  dialog.querySelector('.cd-close').addEventListener('click', () => dialog.remove());
  dialog.querySelector('.cd-cancel').addEventListener('click', () => dialog.remove());
  dialog.querySelector('.cd-save').addEventListener('click', () => {
    const level = dialog.querySelector('.cd-level').value;
    const comps = [...dialog.querySelectorAll('.cd-compartments input:checked')].map(i => i.value);
    onSave?.(level, comps);
    dialog.remove();
  });

  document.body.appendChild(dialog);
}
