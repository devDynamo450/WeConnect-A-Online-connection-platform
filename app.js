// ── Shared app utilities loaded on every authenticated page ───────────────────
const API = 'http://localhost:5000/api';

export const getToken = () => localStorage.getItem('wc_token');
export const getUser  = () => {
  try {
    const raw = localStorage.getItem('wc_user');
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

export const authFetch = async (url, options = {}) => {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
};

export const showToast = (msg, type = 'success') => {
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
};

export const formatTime = (iso) => {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const avatarEl = (initial, imgSrc) => {
  if (imgSrc) return `<img src="${API.replace('/api','')}${imgSrc}" alt="avatar" loading="lazy" />`;
  return initial?.charAt(0).toUpperCase() || '?';
};

// ── Guard: redirect to login if no token ──────────────────────────────────────
const initApp = () => {
  // Prevent redirect loops: if we are already on the login page, do nothing
  if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') return;

  const token = getToken();
  const user  = getUser();

  if (!token || !user) {
    // Clear any corrupted state before redirecting
    localStorage.removeItem('wc_token');
    localStorage.removeItem('wc_user');
    window.location.replace('../index.html');
    return;
  }

  // Populate sidebar user info
  const usernameEl = document.getElementById('sidebar-username');
  const sidebarAv  = document.getElementById('sidebar-avatar');
  const postAv     = document.getElementById('post-avatar');
  const modalAv    = document.getElementById('modal-avatar');
  const modalUser  = document.getElementById('modal-username');
  const mobileAv   = document.getElementById('mobile-avatar');

  if (usernameEl) usernameEl.textContent = user.username;
  const initial = avatarEl(user.username, user.profilePic);
  [sidebarAv, postAv, modalAv, mobileAv].forEach((el) => { if (el) el.innerHTML = initial; });
  if (modalUser) modalUser.textContent = user.username;

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await authFetch(`${API}/auth/logout`, { method: 'POST' });
    localStorage.clear();
    window.location.href = '../index.html';
  });

  // Mobile sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  toggle?.addEventListener('click', () => {
    const open = sidebar?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(!!open));
  });
  document.addEventListener('click', (e) => {
    if (sidebar?.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
      sidebar.classList.remove('open');
    }
  });
};

initApp();
export { API };
