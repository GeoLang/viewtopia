/**
 * Document & Media Attachments — link files, images, and intercepts to entities.
 *
 * Uses IndexedDB to store binary attachments locally.
 * Each attachment is linked to one or more entity IDs.
 */

/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} name - Original filename
 * @property {string} mimeType
 * @property {number} size - Bytes
 * @property {number} timestamp - When attached
 * @property {string[]} entityIds - Linked entity IDs
 * @property {string} [notes]
 * @property {string} [classification] - Security classification
 * @property {string} source - Where the attachment came from
 * @property {Blob} [blob] - The actual file data (stored in IndexedDB)
 */

let attachments = new Map();
let attachIdCounter = 0;

/**
 * Add an attachment linked to entities.
 */
export function addAttachment(file, entityIds, opts = {}) {
  const id = `att-${++attachIdCounter}-${Date.now()}`;
  const attachment = {
    id,
    name: file.name || 'unnamed',
    mimeType: file.type || 'application/octet-stream',
    size: file.size || 0,
    timestamp: Date.now(),
    entityIds: [...entityIds],
    notes: opts.notes || '',
    classification: opts.classification || 'unclassified',
    source: opts.source || 'manual',
    blob: file,
  };
  attachments.set(id, attachment);
  return attachment;
}

/**
 * Get all attachments for an entity.
 */
export function getEntityAttachments(entityId) {
  return [...attachments.values()].filter(a => a.entityIds.includes(entityId));
}

/**
 * Get attachment by ID.
 */
export function getAttachment(id) {
  return attachments.get(id);
}

/**
 * Remove an attachment.
 */
export function removeAttachment(id) {
  attachments.delete(id);
}

/**
 * Link an existing attachment to an additional entity.
 */
export function linkAttachment(attachmentId, entityId) {
  const att = attachments.get(attachmentId);
  if (att && !att.entityIds.includes(entityId)) {
    att.entityIds.push(entityId);
  }
}

/**
 * Unlink an attachment from an entity.
 */
export function unlinkAttachment(attachmentId, entityId) {
  const att = attachments.get(attachmentId);
  if (att) {
    att.entityIds = att.entityIds.filter(id => id !== entityId);
  }
}

/**
 * Get all attachments.
 */
export function getAllAttachments() {
  return [...attachments.values()];
}

/**
 * Search attachments by name.
 */
export function searchAttachments(query) {
  const q = query.toLowerCase();
  return [...attachments.values()].filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.notes.toLowerCase().includes(q) ||
    a.source.toLowerCase().includes(q)
  );
}

/**
 * Get attachment counts per entity.
 */
export function getAttachmentCounts(entityIds) {
  const counts = new Map();
  for (const id of entityIds) counts.set(id, 0);
  for (const att of attachments.values()) {
    for (const eid of att.entityIds) {
      if (counts.has(eid)) counts.set(eid, counts.get(eid) + 1);
    }
  }
  return counts;
}

/**
 * Save attachments to IndexedDB.
 */
export async function saveAttachments() {
  try {
    const { openDB } = await import('idb');
    const db = await openDB('viewtopia-attachments', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('attachments')) {
          db.createObjectStore('attachments', { keyPath: 'id' });
        }
      },
    });
    const tx = db.transaction('attachments', 'readwrite');
    // Clear and re-write
    await tx.store.clear();
    for (const att of attachments.values()) {
      // Convert blob to ArrayBuffer for storage
      const buffer = att.blob ? await att.blob.arrayBuffer() : null;
      await tx.store.put({
        ...att,
        blob: undefined,
        blobData: buffer,
        blobType: att.mimeType,
      });
    }
    await tx.done;
  } catch {
    // IndexedDB not available
  }
}

/**
 * Load attachments from IndexedDB.
 */
export async function loadAttachments() {
  try {
    const { openDB } = await import('idb');
    const db = await openDB('viewtopia-attachments', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('attachments')) {
          db.createObjectStore('attachments', { keyPath: 'id' });
        }
      },
    });
    const all = await db.getAll('attachments');
    attachments.clear();
    for (const stored of all) {
      const blob = stored.blobData ? new Blob([stored.blobData], { type: stored.blobType }) : null;
      attachments.set(stored.id, {
        id: stored.id,
        name: stored.name,
        mimeType: stored.mimeType,
        size: stored.size,
        timestamp: stored.timestamp,
        entityIds: stored.entityIds,
        notes: stored.notes,
        classification: stored.classification,
        source: stored.source,
        blob,
      });
    }
  } catch {
    // IndexedDB not available
  }
}

/**
 * Clear all attachments.
 */
export function clearAttachments() {
  attachments.clear();
}

/**
 * Show attachment panel for an entity.
 */
export function showAttachmentPanel(entityId, entityName, onUpdate) {
  let panel = document.getElementById('attachment-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'attachment-panel';
  panel.className = 'attachment-panel';

  const atts = getEntityAttachments(entityId);

  panel.innerHTML = `
    <div class="atp-header">
      <h3>Attachments — ${entityName}</h3>
      <button class="atp-close">&times;</button>
    </div>
    <div class="atp-upload">
      <button class="st-btn atp-add">+ Add File</button>
      <input type="file" class="atp-file-input" multiple style="display:none">
      <span class="atp-count">${atts.length} file(s)</span>
    </div>
    <div class="atp-list"></div>
  `;

  panel.querySelector('.atp-close').addEventListener('click', () => panel.remove());

  const fileInput = panel.querySelector('.atp-file-input');
  panel.querySelector('.atp-add').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    for (const file of fileInput.files) {
      addAttachment(file, [entityId], { source: 'manual upload' });
    }
    fileInput.value = '';
    renderAttachmentList(panel, entityId);
    onUpdate?.();
  });

  renderAttachmentList(panel, entityId);
  document.body.appendChild(panel);
}

function renderAttachmentList(panel, entityId) {
  const list = panel.querySelector('.atp-list');
  const atts = getEntityAttachments(entityId);
  panel.querySelector('.atp-count').textContent = `${atts.length} file(s)`;

  const icons = {
    'image': '🖼️', 'video': '🎥', 'audio': '🎵',
    'application/pdf': '📄', 'text': '📝',
  };

  list.innerHTML = atts.map(att => {
    const icon = Object.entries(icons).find(([k]) => att.mimeType.startsWith(k))?.[1] || '📎';
    const size = att.size < 1024 ? `${att.size}B` :
      att.size < 1048576 ? `${(att.size / 1024).toFixed(1)}KB` :
      `${(att.size / 1048576).toFixed(1)}MB`;
    return `
      <div class="atp-item" data-att-id="${att.id}">
        <span class="atp-icon">${icon}</span>
        <div class="atp-info">
          <span class="atp-name">${att.name}</span>
          <span class="atp-meta">${size} · ${att.classification} · ${new Date(att.timestamp).toLocaleDateString()}</span>
          ${att.notes ? `<span class="atp-notes">${att.notes}</span>` : ''}
        </div>
        <div class="atp-actions">
          ${att.blob ? '<button class="st-btn atp-download" title="Download">⬇</button>' : ''}
          <button class="st-btn atp-remove" title="Remove">🗑️</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="atp-empty">No attachments</div>';

  // Wire download/remove buttons
  list.querySelectorAll('.atp-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.atp-item').dataset.attId;
      const att = getAttachment(id);
      if (att?.blob) {
        const url = URL.createObjectURL(att.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  });

  list.querySelectorAll('.atp-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.atp-item').dataset.attId;
      removeAttachment(id);
      renderAttachmentList(panel, entityId);
    });
  });
}
