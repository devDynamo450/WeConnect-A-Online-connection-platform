import { API, authFetch, showToast, formatTime, getUser, avatarEl } from './app.js';

const user = getUser();
let currentPage = 1;
let isLoading   = false;

// ── Render a single post card ─────────────────────────────────────────────────
const renderPost = (post) => {
  const el = document.createElement('article');
  el.className = 'post-card';
  el.dataset.postId = post._id;

  const liked    = post.likes.includes(user?._id);
  const imgCount = post.images?.length || 0;

  const imagesHtml = imgCount
    ? `<div class="post-images count-${Math.min(imgCount, 3)}">
        ${post.images.slice(0, 3).map((src) =>
          `<img class="post-image" src="http://localhost:5000${src}" alt="Post image" loading="lazy" />`
        ).join('')}
       </div>`
    : '';

  el.innerHTML = `
    <div class="post-header">
      <div class="avatar avatar-md">${avatarEl(post.author.username, post.author.profilePic)}</div>
      <div class="post-author-info">
        <div class="post-author-name">${post.author.username}</div>
        <div class="post-timestamp">${formatTime(post.createdAt)}</div>
      </div>
      ${post.author._id === user?._id
        ? `<button class="btn-icon delete-post-btn" data-id="${post._id}" aria-label="Delete post" title="Delete">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
           </button>`
        : ''}
    </div>
    <div class="post-body">
      <p class="post-content">${escapeHtml(post.content)}</p>
      ${imagesHtml}
    </div>
    <div class="post-actions">
      <button class="post-action-btn like-btn ${liked ? 'liked' : ''}" data-id="${post._id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        <span class="like-count">${post.likes.length}</span>
      </button>
      <button class="post-action-btn comment-toggle-btn" data-id="${post._id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>${post.comments.length}</span>
      </button>
    </div>
    <div class="comments-section" id="comments-${post._id}">
      ${post.comments.slice(-3).map((c) => `
        <div class="comment-item">
          <div class="avatar avatar-sm">${avatarEl(c.author.username, c.author.profilePic)}</div>
          <div class="comment-bubble">
            <div class="comment-author">${c.author.username}</div>
            <div class="comment-text">${escapeHtml(c.content)}</div>
          </div>
        </div>
      `).join('')}
      <form class="comment-form" data-post-id="${post._id}">
        <input class="comment-input" type="text" placeholder="Write a comment…" maxlength="500" required />
        <button type="submit" class="comment-submit" aria-label="Send comment">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  `;

  // ── Like button ─────────────────────────────────────────────────────────────
  el.querySelector('.like-btn')?.addEventListener('click', async (e) => {
    const btn       = e.currentTarget;
    const countSpan = btn.querySelector('.like-count');
    const wasLiked  = btn.classList.contains('liked');

    btn.classList.toggle('liked', !wasLiked);
    const svg = btn.querySelector('svg');
    svg.setAttribute('fill', !wasLiked ? 'currentColor' : 'none');
    countSpan.textContent = String(Number(countSpan.textContent) + (!wasLiked ? 1 : -1));

    const res  = await authFetch(`${API}/posts/${post._id}/like`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      countSpan.textContent = String(data.likes);
      btn.classList.toggle('liked', data.liked);
      btn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
    }
  });

  // ── Comment toggle ──────────────────────────────────────────────────────────
  el.querySelector('.comment-toggle-btn')?.addEventListener('click', () => {
    document.getElementById(`comments-${post._id}`)?.classList.toggle('open');
  });

  // ── Comment submit ──────────────────────────────────────────────────────────
  el.querySelector('.comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form  = e.currentTarget;
    const input = form.querySelector('.comment-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';

    const res  = await authFetch(`${API}/posts/${post._id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    });
    const data = await res.json();
    if (res.ok) {
      const section = document.getElementById(`comments-${post._id}`);
      const newComment = data.comments[data.comments.length - 1];
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = `
        <div class="avatar avatar-sm">${avatarEl(user.username, user.profilePic)}</div>
        <div class="comment-bubble">
          <div class="comment-author">${user.username}</div>
          <div class="comment-text">${escapeHtml(newComment.content)}</div>
        </div>
      `;
      section.insertBefore(div, form);
    }
  });

  // ── Delete post ─────────────────────────────────────────────────────────────
  el.querySelector('.delete-post-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    const res = await authFetch(`${API}/posts/${post._id}`, { method: 'DELETE' });
    if (res.ok) { el.remove(); showToast('Post deleted'); }
  });

  return el;
};

// ── Load feed ─────────────────────────────────────────────────────────────────
const loadFeed = async (page = 1) => {
  if (isLoading) return;
  isLoading = true;

  const container     = document.getElementById('feed-posts');
  const loadingEl     = document.getElementById('feed-loading');
  const loadMoreCont  = document.getElementById('load-more-container');

  if (page === 1 && loadingEl) loadingEl.style.display = 'block';

  const res  = await authFetch(`${API}/posts?page=${page}&limit=10`);
  const data = await res.json();

  if (page === 1 && loadingEl) loadingEl.remove();

  if (res.ok && data.data?.length) {
    data.data.forEach((post) => container.appendChild(renderPost(post)));
    const { pages } = data.pagination;
    loadMoreCont.hidden = page >= pages;
  } else if (page === 1) {
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted)">
      <p style="font-size:2rem;margin-bottom:0.5rem">🌐</p>
      <p>No posts yet. Be the first to share something!</p>
    </div>`;
  }

  isLoading = false;
};

document.getElementById('load-more-btn')?.addEventListener('click', () => {
  currentPage++;
  loadFeed(currentPage);
});

// ── Create Post Modal ─────────────────────────────────────────────────────────
const modal        = document.getElementById('post-modal');
const openBtn      = document.getElementById('open-post-modal');
const closeBtn     = document.getElementById('close-post-modal');
const postForm     = document.getElementById('create-post-form');
const postContent  = document.getElementById('post-content');
const postImages   = document.getElementById('post-images');
const imagesPreview = document.getElementById('post-images-preview');
const postSubmit   = document.getElementById('post-submit');

const openModal  = () => { modal.hidden = false; modal.style.display = 'flex'; postContent.focus(); };
const closeModal = () => { modal.hidden = true; modal.style.display = 'none'; postForm.reset(); imagesPreview.innerHTML = ''; };

openBtn?.addEventListener('click', openModal);
closeBtn?.addEventListener('click', closeModal);
modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

postImages?.addEventListener('change', () => {
  imagesPreview.innerHTML = '';
  Array.from(postImages.files || []).forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `<img src="${url}" alt="preview" /><button type="button" class="image-preview-remove" data-idx="${i}">×</button>`;
    imagesPreview.appendChild(div);
  });
});

postForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = postContent.value.trim();
  if (!text) return;

  postSubmit.disabled = true;
  postSubmit.classList.add('loading');

  const body = new FormData();
  body.append('content', text);
  Array.from(postImages.files || []).forEach((f) => body.append('images', f));

  const res  = await fetch(`${API}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('wc_token')}` },
    body,
  });
  const data = await res.json();

  postSubmit.disabled = false;
  postSubmit.classList.remove('loading');

  if (res.ok) {
    closeModal();
    const feedPosts = document.getElementById('feed-posts');
    const noPost = feedPosts.querySelector('div[style]');
    if (noPost) noPost.remove();
    feedPosts.prepend(renderPost(data.data));
    showToast('Post published! 🎉');
  } else {
    showToast(data.message || 'Failed to create post', 'error');
  }
});

// ── User Search ───────────────────────────────────────────────────────────────
const searchInput  = document.getElementById('user-search');
const searchResults = document.getElementById('search-results');
let searchTimer;

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) { searchResults.hidden = true; return; }

  searchTimer = setTimeout(async () => {
    const res  = await authFetch(`${API}/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok || !data.data?.length) {
      searchResults.hidden = true;
      return;
    }

    searchResults.innerHTML = data.data.map((u) => `
      <li class="search-result-item" role="option" data-id="${u._id}">
        <div class="avatar avatar-sm">${avatarEl(u.username, u.profilePic)}</div>
        <div>
          <div style="font-size:0.875rem;font-weight:600">${u.username}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${u.status}</div>
        </div>
      </li>
    `).join('');
    searchResults.hidden = false;
  }, 350);
});

document.addEventListener('click', (e) => {
  if (!searchInput?.contains(e.target)) searchResults.hidden = true;
});

// ── Helper ────────────────────────────────────────────────────────────────────
const escapeHtml = (str) =>
  str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Init ──────────────────────────────────────────────────────────────────────
loadFeed(1);
