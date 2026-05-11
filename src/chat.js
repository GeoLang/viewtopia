/**
 * Chat panel — connects to GeoLang (Letta-powered) agent.
 *
 * Handles:
 * - Streaming SSE responses (text, progress, viewer commands, UI specs)
 * - Follow-up suggestions
 * - Typing indicators
 * - Session persistence (localStorage)
 */
import { getGeoLangBase, hasGeoLang } from './backends.js';
import { executeCommand } from './viewer-commands.js';
import { renderUISpec } from './ui-spec-renderer.js';
import { getCurrentSessionId } from './sessions.js';

const SESSION_KEY_PREFIX = 'viewtopia_chat_';
let currentSessionId = null;
let messageHistory = []; // [{role, text, spec}]

function getSessionKey() {
  // Prefer the live session ID from sessions.js
  const sid = getCurrentSessionId() || currentSessionId;
  return sid ? SESSION_KEY_PREFIX + sid : 'viewtopia_chat';
}

function saveSession() {
  try {
    const json = JSON.stringify(messageHistory);
    localStorage.setItem(getSessionKey(), json);
    localStorage.setItem('viewtopia_chat_last', json);
  } catch { /* ignore quota errors */ }
}

function restoreSession() {
  let saved = null;
  for (const k of [getSessionKey(), 'viewtopia_chat_last', 'viewtopia_chat']) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }
    if (saved?.length) break;
  }
  if (!saved?.length) return;

  const welcome = document.getElementById('welcome-msg');
  if (welcome) welcome.style.display = 'none';

  messageHistory = saved;
  let lastSpec = null;
  for (const m of saved) {
    addMessage(m.text, m.role, [], true, m.spec || null);
    if (m.spec) lastSpec = m.spec;
  }
  // Re-render only the most recent spec on restore
  if (lastSpec) {
    try { renderUISpec(lastSpec); } catch { /* best-effort */ }
  }
}

export function initChat() {
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const typingEl = document.getElementById('typing-indicator');
  const typingStatus = document.getElementById('typing-status');

  if (!messagesEl || !inputEl) return;

  // Restore previous chat history
  restoreSession();

  // Listen for session changes from sessions.js
  window.addEventListener('session-changed', (e) => {
    messageHistory = [];
    messagesEl.innerHTML = '';
    const welcome = document.getElementById('welcome-msg');
    if (welcome) {
      messagesEl.appendChild(welcome);
      welcome.style.display = '';
    }
    restoreSession();
  });

  window.addEventListener('clear-session', () => {
    messageHistory = [];
    try { localStorage.removeItem(getSessionKey()); } catch { /* ignore */ }
  });

  // Example query buttons
  document.querySelectorAll('.example-query').forEach((btn) => {
    btn.addEventListener('click', () => {
      inputEl.value = btn.textContent;
      sendMessage();
    });
  });

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    inputEl.value = '';
    sendBtn.disabled = true;

    if (!hasGeoLang()) {
      addMessage('GeoLang agent is not connected. Start the GeoLang server and refresh.', 'agent');
      sendBtn.disabled = false;
      return;
    }

    // Show typing indicator
    typingEl.style.display = '';
    typingStatus.textContent = '';

    try {
      const base = getGeoLangBase();
      const response = await fetch(`${base}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error(`Agent error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastText = '';
      let lastSpec = null;
      let followups = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              typingStatus.textContent = event.text;
            } else if (event.type === 'text') {
              lastText = event.text;
            } else if (event.type === 'ui_spec' && event.spec) {
              lastSpec = event.spec;
              renderUISpec(event.spec);
            } else if (event.type === 'viewer_cmd') {
              executeCommand(event.cmd);
            } else if (event.type === 'followups') {
              followups = event.items || [];
            } else if (event.type === 'done') {
              if (lastText) addMessage(lastText, 'agent', followups, false, lastSpec);
            } else if (event.type === 'error') {
              addMessage(`Error: ${event.text}`, 'agent');
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // If we got text but no explicit 'done' event
      if (lastText && !document.querySelector('.message.agent:last-child')) {
        addMessage(lastText, 'agent', followups, false, lastSpec);
      }
    } catch (e) {
      addMessage(`Error: ${e.message}`, 'agent');
    } finally {
      typingEl.style.display = 'none';
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = '44px';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });
}

function addMessage(text, role, followups = [], isRestore = false, spec = null) {
  const messagesEl = document.getElementById('messages');

  // Hide welcome message on first real message
  const welcome = document.getElementById('welcome-msg');
  if (welcome) welcome.style.display = 'none';

  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  if (role === 'agent') {
    const sender = document.createElement('div');
    sender.className = 'sender';
    sender.innerHTML = '<span>Agent</span>';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = '📋';
        }, 1500);
      });
    });
    sender.appendChild(copyBtn);
    msg.appendChild(sender);
  }

  const body = document.createElement('div');
  body.textContent = text;
  msg.appendChild(body);

  // Follow-up suggestion buttons (skip on restore)
  if (followups.length > 0 && !isRestore) {
    const row = document.createElement('div');
    row.className = 'followup-row';
    for (const f of followups) {
      const btn = document.createElement('button');
      btn.className = 'followup-btn';
      btn.textContent = f;
      btn.addEventListener('click', () => {
        const inputEl = document.getElementById('chat-input');
        inputEl.value = f;
        inputEl.dispatchEvent(new Event('input'));
        document.getElementById('chat-send').click();
      });
      row.appendChild(btn);
    }
    msg.appendChild(row);
  }

  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Attach click-to-replay for messages that have a UI spec
  if (spec) {
    msg.classList.add('has-spec');
    msg.addEventListener('click', (e) => {
      if (e.target.closest('.copy-btn') || e.target.closest('.followup-btn')) return;
      document.querySelectorAll('.message.active-spec').forEach(m => m.classList.remove('active-spec'));
      msg.classList.add('active-spec');
      renderUISpec(spec);
    });
  }

  // Persist to localStorage (skip during restore to avoid re-saving)
  if (!isRestore) {
    messageHistory.push({ role, text, spec: spec || null });
    saveSession();
  }
}

export function addSystemMessage(text) {
  const messagesEl = document.getElementById('messages');
  const msg = document.createElement('div');
  msg.className = 'message system';
  msg.textContent = text;
  messagesEl.appendChild(msg);
}
