import { API, authFetch, getUser, avatarEl, formatTime } from './app.js';

const user = getUser();
const list = document.getElementById('notif-list');

const loadNotifications = async () => {
  try {
    const res = await authFetch(`${API}/notifications`);
    const data = await res.json();

    if (!res.ok || !data.data?.length) {
      list.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted)">
        <p style="font-size:2rem;margin-bottom:0.5rem">🔔</p>
        <p>No notifications yet.</p>
      </div>`;
      return;
    }

    list.innerHTML = data.data.map(n => {
      const actor = n.actor || { username: 'Someone', profilePic: '' };
      return `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n._id}">
          <div class="avatar avatar-md">${avatarEl(actor.username, actor.profilePic)}</div>
          <div class="notif-content">
            <p class="notif-text"><b>${actor.username}</b> ${n.content}</p>
            <span class="notif-time">${formatTime(n.createdAt)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Mark all as read after a delay
    setTimeout(() => {
      authFetch(`${API}/notifications/read-all`, { method: 'PATCH' });
    }, 2000);

  } catch (err) {
    list.innerHTML = `<div class="msgs-loading">Failed to load notifications.</div>`;
  }
};

loadNotifications();
