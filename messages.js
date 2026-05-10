import { API, authFetch, getUser, getToken, formatTime, avatarEl, showToast } from './app.js';

const user = getUser();
let currentPartnerId = null;
let typingTimer;
let socket = null;

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const initSocket = () => {
  if (!getToken()) return;
  
  socket = window.io('http://localhost:5000', {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => console.log('🔌 Socket connected'));

  socket.on('receive_message', (data) => {
    if (data.senderId === currentPartnerId) {
      appendMessage({ ...data, sender: { _id: data.senderId }, content: data.message }, false);
      scrollToBottom();
      socket.emit('message_read', { senderId: data.senderId, chatId: data.chatId });
    }
    loadConversations();
  });

  socket.on('typing_start', ({ senderId }) => {
    if (senderId === currentPartnerId) {
      document.getElementById('typing-indicator').hidden = false;
      scrollToBottom();
    }
  });

  socket.on('typing_stop', ({ senderId }) => {
    if (senderId === currentPartnerId) {
      document.getElementById('typing-indicator').hidden = true;
    }
  });

  socket.on('online_users', (users) => {
    updateOnlineStatus(users);
  });
};

// ── Conversations ─────────────────────────────────────────────────────────────
const loadConversations = async () => {
  const list = document.getElementById('conversations-list');
  if (!list) return;

  const res  = await authFetch(`${API}/messages/conversations`);
  const data = await res.json();

  if (!res.ok || !data.data?.length) {
    list.innerHTML = `<li class="conv-loading">No conversations yet. Search for a friend to start chatting!</li>`;
    return;
  }

  list.innerHTML = data.data.map((conv) => {
    const lm      = conv.lastMessage;
    const partner = lm.sender._id === user._id ? lm.receiver : lm.sender;
    const preview = lm.image ? '📷 Image' : lm.content;
    const unread  = conv.unreadCount > 0
      ? `<span class="conv-unread">${conv.unreadCount}</span>` : '';

    return `
      <li class="conv-item ${currentPartnerId === partner._id ? 'active' : ''}" role="button" tabindex="0" data-partner-id="${partner._id}"
          data-partner-name="${partner.username}" data-partner-pic="${partner.profilePic || ''}">
        <div class="avatar avatar-md" style="position:relative">
          ${avatarEl(partner.username, partner.profilePic)}
          <span class="online-indicator" id="online-${partner._id}" style="display:none;position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:var(--success);border:2px solid var(--surface-2)"></span>
        </div>
        <div class="conv-info">
          <div class="conv-name">${partner.username}</div>
          <div class="conv-last-msg">${preview.length > 40 ? preview.substring(0,40)+'…' : preview}</div>
        </div>
        <div class="conv-meta">
          <span class="conv-time">${formatTime(lm.createdAt)}</span>
          ${unread}
        </div>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.conv-item').forEach((item) => {
    item.addEventListener('click', () => openChat(
      item.dataset.partnerId,
      item.dataset.partnerName,
      item.dataset.partnerPic || ''
    ));
  });
};

// ── Open Chat ─────────────────────────────────────────────────────────────────
const openChat = async (partnerId, partnerName, partnerPic) => {
  if (currentPartnerId === partnerId) return;
  currentPartnerId = partnerId;

  // 1. Instantly transition UI states
  const chatEmpty  = document.getElementById('chat-empty');
  const chatWindow = document.getElementById('chat-window');
  const msgCont    = document.getElementById('messages-container');

  if (chatEmpty) chatEmpty.hidden = true;
  if (chatWindow) chatWindow.hidden = false;

  document.getElementById('chat-partner-name').textContent = partnerName;
  document.getElementById('chat-avatar').innerHTML = avatarEl(partnerName, partnerPic);

  // 2. Highlight active
  document.querySelectorAll('.conv-item').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.conv-item[data-partner-id="${partnerId}"]`)?.classList.add('active');

  // 3. Show Loading in message area
  msgCont.innerHTML = `
    <div class="msgs-loading" id="loading-spinner">
      <div class="btn-spinner" style="display:block; margin: 0 auto 1rem;"></div>
      Loading your conversation with ${partnerName}...
    </div>
  `;

  if (window.innerWidth <= 768) {
    document.querySelector('.conversations-panel')?.classList.add('hidden');
  }

  await loadMessages(partnerId);
};

// ── Load Messages ─────────────────────────────────────────────────────────────
const loadMessages = async (partnerId) => {
  const container = document.getElementById('messages-container');
  
  const res  = await authFetch(`${API}/messages/${partnerId}?limit=50`);
  const data = await res.json();

  if (partnerId !== currentPartnerId) return; // Guard against race condition

  container.innerHTML = '';

  if (!res.ok || !data.data?.length) {
    container.innerHTML = `<div class="msgs-loading">No messages yet. Say hello to start the conversation! 👋</div>`;
  } else {
    let lastDate = '';
    data.data.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.textContent = msgDate === new Date().toDateString() ? 'Today' : msgDate;
        container.appendChild(sep);
        lastDate = msgDate;
      }
      appendMessage(msg, msg.sender._id === user._id);
    });
  }

  scrollToBottom();
  
  // Mark as read
  const chatId = [user._id, partnerId].sort().join('_');
  authFetch(`${API}/messages/${chatId}/read`, { method: 'PATCH' });
};

// ── Append a message bubble ───────────────────────────────────────────────────
const appendMessage = (msg, isSent) => {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  div.className = `message-bubble ${isSent ? 'sent' : 'received'}`;

  const content = msg.content || msg.message || '';
  const imgHtml = msg.image
    ? `<img class="message-img" src="http://localhost:5000${msg.image}" alt="image" loading="lazy" />`
    : '';
  const seenHtml = isSent && msg.seen ? `<div class="message-seen">✓✓ Seen</div>` : '';

  div.innerHTML = `
    ${!isSent ? `<div class="avatar avatar-sm">${avatarEl(msg.sender?.username || '?', msg.sender?.profilePic)}</div>` : ''}
    <div class="message-content">
      ${imgHtml}
      ${content ? `<div class="message-text">${escapeHtml(content)}</div>` : ''}
      <span class="message-time">${formatTime(msg.createdAt || new Date().toISOString())}</span>
      ${seenHtml}
    </div>
  `;

  container.appendChild(div);
};

const scrollToBottom = () => {
  const c = document.getElementById('messages-container');
  if (c) c.scrollTop = c.scrollHeight;
};

// ── Event Listeners ───────────────────────────────────────────────────────────
const msgForm    = document.getElementById('message-form');
const msgInput   = document.getElementById('message-input');
const sendBtn    = document.getElementById('send-btn');
const msgImageIn = document.getElementById('msg-image');
const imgPreview = document.getElementById('msg-image-preview');

msgImageIn?.addEventListener('change', () => {
  if (msgImageIn.files?.[0]) {
    const url = URL.createObjectURL(msgImageIn.files[0]);
    imgPreview.hidden = false;
    imgPreview.innerHTML = `
      <img class="msg-preview-img" src="${url}" alt="preview" />
      <button type="button" class="msg-preview-remove" id="remove-img">✕</button>
    `;
    document.getElementById('remove-img')?.addEventListener('click', () => {
      msgImageIn.value = '';
      imgPreview.hidden = true;
      imgPreview.innerHTML = '';
    });
  }
});

msgInput?.addEventListener('input', () => {
  if (!currentPartnerId || !socket) return;
  socket.emit('typing_start', { receiverId: currentPartnerId });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing_stop', { receiverId: currentPartnerId });
  }, 1500);
});

msgForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPartnerId) return;

  const text = msgInput.value.trim();
  const hasImage = !!msgImageIn.files?.[0];
  if (!text && !hasImage) return;

  sendBtn.disabled = true;

  if (text && !hasImage) {
    const chatId = [user._id, currentPartnerId].sort().join('_');
    socket?.emit('send_message', { receiverId: currentPartnerId, message: text, chatId });
    appendMessage({ content: text, sender: { _id: user._id }, createdAt: new Date().toISOString() }, true);
    msgInput.value = '';
    scrollToBottom();
    socket?.emit('typing_stop', { receiverId: currentPartnerId });
    sendBtn.disabled = false;
    return;
  }

  const body = new FormData();
  body.append('receiverId', currentPartnerId);
  body.append('content', text || ' ');
  if (hasImage) body.append('image', msgImageIn.files[0]);

  const res  = await fetch(`${API}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body,
  });
  const data = await res.json();
  sendBtn.disabled = false;

  if (res.ok) {
    msgInput.value = '';
    imgPreview.hidden = true; imgPreview.innerHTML = '';
    msgImageIn.value = '';
    appendMessage(data.data, true);
    scrollToBottom();
  } else {
    showToast(data.message || 'Failed to send message', 'error');
  }
});

document.getElementById('back-to-convs')?.addEventListener('click', () => {
  document.querySelector('.conversations-panel')?.classList.remove('hidden');
  document.getElementById('chat-window').hidden = true;
  document.getElementById('chat-empty').hidden = false;
  currentPartnerId = null;
});

const updateOnlineStatus = (onlineIds) => {
  document.querySelectorAll('.online-indicator').forEach((el) => {
    const uid = el.id.replace('online-', '');
    el.style.display = onlineIds.includes(uid) ? 'block' : 'none';
  });

  if (currentPartnerId) {
    const statusEl = document.getElementById('chat-partner-status');
    if (statusEl) {
      const isOnline = onlineIds.includes(currentPartnerId);
      statusEl.textContent = isOnline ? 'Online' : 'Offline';
      statusEl.className = `chat-partner-status${isOnline ? ' online' : ''}`;
    }
  }
};

const escapeHtml = (s) =>
  s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Init ──────────────────────────────────────────────────────────────────────
initSocket();
loadConversations();
setInterval(loadConversations, 10000); // Polling as fallback
