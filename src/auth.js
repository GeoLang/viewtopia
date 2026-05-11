/**
 * User Authentication UI — JWT login with TileTopia backend.
 */

let authState = { loggedIn: false, user: null, token: null };

export function initAuth() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (authState.loggedIn) {
      showUserMenu(btn);
    } else {
      showLoginPanel();
    }
  });

  // Restore session from localStorage
  const saved = localStorage.getItem('viewtopia_auth');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.token && data.user) {
        authState = { loggedIn: true, user: data.user, token: data.token };
        updateAuthButton();
      }
    } catch { /* ignore */ }
  }
}

function updateAuthButton() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  if (authState.loggedIn) {
    btn.textContent = `👤 ${authState.user.name || authState.user.email || 'User'}`;
    btn.classList.add('active');
  } else {
    btn.textContent = '🔑 Login';
    btn.classList.remove('active');
  }
}

function showLoginPanel() {
  let panel = document.getElementById('auth-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'auth-panel';
  panel.className = 'floating-panel';
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;width:360px;';
  panel.innerHTML = `
    <div class="panel-header"><span>🔑 Login</span><button class="panel-close" id="auth-close">✕</button></div>
    <div class="panel-body">
      <label>Email or username
        <input type="text" id="auth-email" autocomplete="username">
      </label>
      <label>Password
        <input type="password" id="auth-password" autocomplete="current-password">
      </label>
      <div id="auth-error" style="color:#f85149;font-size:12px;margin:4px 0;display:none;"></div>
      <button class="map-action-btn" id="auth-submit" style="width:100%;margin-top:8px;">Login</button>
      <div style="text-align:center;margin-top:12px;font-size:12px;">
        <a href="#" id="auth-register" style="color:#58a6ff;">Create account</a>
        <span style="color:#666;margin:0 8px;">|</span>
        <a href="#" id="auth-forgot" style="color:#58a6ff;">Forgot password</a>
      </div>
      <div style="margin-top:16px;border-top:1px solid #333;padding-top:12px;text-align:center;">
        <button class="map-action-btn" id="auth-api-key" style="width:100%;">🔗 Use API Key</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('auth-close').onclick = () => panel.remove();

  document.getElementById('auth-submit').onclick = () => doLogin();
  document.getElementById('auth-password').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };

  document.getElementById('auth-register').onclick = (e) => { e.preventDefault(); showRegisterForm(); };
  document.getElementById('auth-forgot').onclick = (e) => { e.preventDefault(); alert('Password reset: check with your TileTopia admin.'); };
  document.getElementById('auth-api-key').onclick = () => showApiKeyForm();
}

async function doLogin() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const errorEl = document.getElementById('auth-error');

  if (!email || !password) {
    if (errorEl) { errorEl.textContent = 'Please enter email and password'; errorEl.style.display = 'block'; }
    return;
  }

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json();
      authState = { loggedIn: true, user: data.user || { email }, token: data.token };
      localStorage.setItem('viewtopia_auth', JSON.stringify({ user: authState.user, token: authState.token }));
      updateAuthButton();
      document.getElementById('auth-panel')?.remove();
    } else {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      if (errorEl) { errorEl.textContent = err.message || 'Invalid credentials'; errorEl.style.display = 'block'; }
    }
  } catch (e) {
    if (errorEl) { errorEl.textContent = `Connection error: ${e.message}`; errorEl.style.display = 'block'; }
  }
}

function showRegisterForm() {
  const body = document.querySelector('#auth-panel .panel-body');
  if (!body) return;

  body.innerHTML = `
    <label>Name <input type="text" id="reg-name"></label>
    <label>Email <input type="email" id="reg-email" autocomplete="email"></label>
    <label>Password <input type="password" id="reg-password" autocomplete="new-password"></label>
    <label>Confirm password <input type="password" id="reg-confirm" autocomplete="new-password"></label>
    <div id="auth-error" style="color:#f85149;font-size:12px;margin:4px 0;display:none;"></div>
    <button class="map-action-btn" id="reg-submit" style="width:100%;margin-top:8px;">Create Account</button>
    <a href="#" id="reg-back" style="display:block;text-align:center;margin-top:8px;color:#58a6ff;font-size:12px;">← Back to login</a>
  `;

  document.getElementById('reg-submit').onclick = async () => {
    const name = document.getElementById('reg-name')?.value?.trim();
    const email = document.getElementById('reg-email')?.value?.trim();
    const password = document.getElementById('reg-password')?.value;
    const confirm = document.getElementById('reg-confirm')?.value;
    const errorEl = document.getElementById('auth-error');

    if (password !== confirm) {
      if (errorEl) { errorEl.textContent = 'Passwords do not match'; errorEl.style.display = 'block'; }
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        alert('Account created! You can now log in.');
        showLoginPanel();
      } else {
        const err = await res.json().catch(() => ({ message: 'Registration failed' }));
        if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
      }
    } catch (e) {
      if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
    }
  };

  document.getElementById('reg-back').onclick = (e) => { e.preventDefault(); showLoginPanel(); };
}

function showApiKeyForm() {
  const body = document.querySelector('#auth-panel .panel-body');
  if (!body) return;

  body.innerHTML = `
    <label>API Key
      <input type="text" id="api-key-input" placeholder="tt_xxxxx…" autocomplete="off">
    </label>
    <button class="map-action-btn" id="api-key-submit" style="width:100%;margin-top:8px;">Authenticate</button>
    <a href="#" id="api-key-back" style="display:block;text-align:center;margin-top:8px;color:#58a6ff;font-size:12px;">← Back to login</a>
  `;

  document.getElementById('api-key-submit').onclick = () => {
    const key = document.getElementById('api-key-input')?.value?.trim();
    if (!key) return;
    authState = { loggedIn: true, user: { name: 'API Key User' }, token: key };
    localStorage.setItem('viewtopia_auth', JSON.stringify({ user: authState.user, token: authState.token }));
    updateAuthButton();
    document.getElementById('auth-panel')?.remove();
  };

  document.getElementById('api-key-back').onclick = (e) => { e.preventDefault(); showLoginPanel(); };
}

function showUserMenu(anchor) {
  let menu = document.getElementById('user-menu');
  if (menu) { menu.remove(); return; }

  menu = document.createElement('div');
  menu.id = 'user-menu';
  menu.style.cssText = 'position:absolute;right:8px;top:40px;background:#1e1e2e;border:1px solid #333;border-radius:8px;padding:8px;z-index:9999;min-width:180px;';
  menu.innerHTML = `
    <div style="padding:8px;border-bottom:1px solid #333;margin-bottom:4px;">
      <div style="font-weight:600;color:#e6e6e6;">${authState.user?.name || 'User'}</div>
      <div style="font-size:11px;color:#888;">${authState.user?.email || ''}</div>
    </div>
    <button class="map-action-btn" id="user-settings" style="width:100%;text-align:left;">⚙ Settings</button>
    <button class="map-action-btn" id="user-logout" style="width:100%;text-align:left;color:#f85149;">↪ Logout</button>
  `;

  document.body.appendChild(menu);

  document.getElementById('user-logout').onclick = () => {
    authState = { loggedIn: false, user: null, token: null };
    localStorage.removeItem('viewtopia_auth');
    updateAuthButton();
    menu.remove();
  };

  document.getElementById('user-settings').onclick = () => {
    alert('Settings page coming soon');
    menu.remove();
  };

  // Close on outside click
  setTimeout(() => {
    const close = (e) => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}

/** Get the current auth token for API requests. */
export function getAuthToken() {
  return authState.token;
}

/** Check if user is authenticated. */
export function isAuthenticated() {
  return authState.loggedIn;
}
