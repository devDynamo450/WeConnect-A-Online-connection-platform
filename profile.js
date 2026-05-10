import { API, authFetch, getUser, avatarEl, showToast } from './app.js';

const user = getUser();

const initProfile = async () => {
  if (!user || !user._id) return;
  
  try {
    // 1. Fetch full user details from server
    const res = await authFetch(`${API}/users/${user._id}`);
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.message || 'Failed to fetch profile');
    
    const fullUser = data.data;
    
    // 2. Populate Header
    document.getElementById('profile-name').textContent = fullUser.username;
    document.getElementById('profile-bio').textContent  = fullUser.bio || 'No bio yet.';
    document.getElementById('profile-avatar').innerHTML = avatarEl(fullUser.username, fullUser.profilePic);
    
    // 3. Populate Stats
    document.getElementById('stat-friends').textContent = fullUser.friends?.length || 0;
    // (Posts count would normally come from another API, using placeholder for now)
    
    // 4. Populate Details Tab
    document.getElementById('detail-email').textContent  = fullUser.email;
    document.getElementById('detail-status').textContent = fullUser.status || 'Online';
    document.getElementById('detail-since').textContent  = new Date(fullUser.createdAt).toLocaleDateString(undefined, { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });

    // 5. Setup Edit Form
    const editForm = document.getElementById('edit-profile-form');
    const showEditBtn = document.getElementById('show-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit');
    
    showEditBtn?.addEventListener('click', () => {
      document.getElementById('edit-username').value = fullUser.username;
      document.getElementById('edit-bio').value = fullUser.bio || '';
      editForm.style.display = 'flex';
      showEditBtn.disabled = true;
    });

    cancelEditBtn?.addEventListener('click', () => {
      editForm.style.display = 'none';
      showEditBtn.disabled = false;
    });

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('edit-username').value.trim();
      const bio = document.getElementById('edit-bio').value.trim();
      
      const updateRes = await authFetch(`${API}/users/profile`, {
        method: 'PUT',
        body: JSON.stringify({ username, bio })
      });
      
      const updateData = await updateRes.json();
      if (updateRes.ok) {
        showToast('Profile updated! 🎉');
        // Update local storage
        const localUser = getUser();
        localUser.username = username;
        localUser.bio = bio;
        localStorage.setItem('wc_user', JSON.stringify(localUser));
        
        // Refresh UI
        document.getElementById('profile-name').textContent = username;
        document.getElementById('profile-bio').textContent  = bio;
        editForm.style.display = 'none';
        showEditBtn.disabled = false;
      } else {
        showToast(updateData.message || 'Update failed', 'error');
      }
    });

    // 6. Setup Tabs
    const tabs = document.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const target = tab.dataset.tab;
        ['details', 'posts', 'friends'].forEach(s => {
          document.getElementById(`${s}-section`).hidden = (s !== target);
        });
      });
    });

  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
};

initProfile();
