/**
 * Theme toggle — switch between dark and light themes.
 * Persists preference in localStorage.
 */

const STORAGE_KEY = 'viewtopia-theme';

export function initThemeToggle() {
  // Add theme toggle button to header
  const header = document.getElementById('header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.id = 'theme-toggle';
  btn.className = 'header-btn';
  btn.title = 'Toggle theme';

  // Insert before the status span
  const status = document.getElementById('status');
  if (status) header.insertBefore(btn, status);
  else header.appendChild(btn);

  // Restore saved theme
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light') {
    document.body.classList.add('light-theme');
    btn.textContent = '🌙';
  } else {
    btn.textContent = '☀';
  }

  btn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    btn.textContent = isLight ? '🌙' : '☀';
    localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
  });
}
