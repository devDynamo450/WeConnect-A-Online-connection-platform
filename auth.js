/**
 * WeConnect — auth.js
 *
 * Facebook Login flow:
 *   1. Page loads → fetch /api/auth/config to get Facebook App ID
 *   2. FB SDK initialises (window.fbAsyncInit called by the SDK script)
 *   3. User clicks "Continue with Facebook" → FB.login() popup opens
 *   4. Facebook returns an access token to the browser
 *   5. We POST that token to /api/auth/facebook/token
 *   6. Backend verifies it with Graph API, creates/finds user, returns JWT
 *   7. We store JWT + user → redirect to /pages/feed.html
 *
 * Plain script (no ES modules) → works on file:// AND http://
 */

// ── API base ────────────────────────────────────────────────────────────────────
// Frontend is served on :3000 during development, backend API on :5000.
// Use an absolute API URL to avoid hitting the static frontend server.
var API = 'http://localhost:5000/api';

// ── Redirect if already logged in (both token AND user data must be valid) ─────────────────
(function guardLogin() {
  var token = localStorage.getItem('wc_token');
  if (!token) return;
  try {
    var raw = localStorage.getItem('wc_user');
    if (!raw || raw === 'null' || raw === 'undefined') {
      // Token exists but user data is missing — clear everything to break the loop
      localStorage.removeItem('wc_token');
      localStorage.removeItem('wc_user');
      return;
    }
    var user = JSON.parse(raw);
    if (user && user._id) {
      window.location.replace('/pages/feed.html');
    } else {
      localStorage.removeItem('wc_token');
      localStorage.removeItem('wc_user');
    }
  } catch (_) {
    localStorage.removeItem('wc_token');
    localStorage.removeItem('wc_user');
  }
})();

// ── Handle Instagram OAuth callback token (passed via URL after IG redirect) ───
(function handleOAuthCallbacks() {
  var params = new URLSearchParams(window.location.search);

  // Instagram success callback
  var igToken = params.get('ig_token');
  var igUser  = params.get('ig_user');
  if (igToken && igUser) {
    try {
      localStorage.setItem('wc_token', igToken);
      localStorage.setItem('wc_user', JSON.stringify(JSON.parse(decodeURIComponent(igUser))));
      window.location.replace('/pages/feed.html');
    } catch (_) { console.error('Failed to parse Instagram user data'); }
    return;
  }

  // Instagram error callback
  var igError = params.get('ig_error');
  if (igError) {
    var banner = document.getElementById('ig-status-banner');
    if (banner) {
      banner.hidden = false;
      banner.className = 'fb-status-banner fb-error';
      banner.textContent = igError === 'not_configured'
        ? '⚠️ Instagram not configured. Add INSTAGRAM_APP_ID to .env'
        : '❌ Instagram login failed: ' + igError.replace(/_/g, ' ');
    }
    window.history.replaceState({}, '', '/');
  }

  // Facebook error callback
  var fbError = params.get('fb_error');
  if (fbError) {
    var fbBanner = document.getElementById('fb-status-banner');
    if (fbBanner) {
      fbBanner.hidden = false;
      fbBanner.className = 'fb-status-banner fb-error';
      fbBanner.textContent = '❌ Facebook login failed: ' + fbError.replace(/_/g, ' ');
    }
    window.history.replaceState({}, '', '/');
  }
})();

// ────────────────────────────────────────────────────────────────────────────────
// FACEBOOK SDK SETUP
// ────────────────────────────────────────────────────────────────────────────────
var FB_APP_ID = null;       // filled from /api/auth/config
var fbSdkReady = false;     // true once FB SDK has initialised

/**
 * Called by the Facebook JS SDK once it has loaded.
 * We configure it here with the App ID we fetched from the backend.
 */
window.fbAsyncInit = function () {
  if (!FB_APP_ID) {
    // SDK loaded before config arrived — wait a bit and retry
    setTimeout(window.fbAsyncInit, 300);
    return;
  }
  FB.init({
    appId:   FB_APP_ID,
    cookie:  true,
    xfbml:   false,
    version: 'v19.0',
  });
  fbSdkReady = true;
  setFbBtnState('ready');
};

// ── Fetch public config from backend (contains Facebook App ID) ────────────────
fetch(API + '/auth/config')
  .then(function (r) { return r.json(); })
  .then(function (cfg) {
    if (cfg.facebookConfigured && cfg.facebookAppId) {
      FB_APP_ID = cfg.facebookAppId;
      // If SDK already loaded but fbAsyncInit was deferred, kick it off now
      if (typeof FB !== 'undefined' && !fbSdkReady) {
        window.fbAsyncInit();
      }
    } else {
      // Not configured — show setup banner, keep button visible but disabled
      setFbBtnState('not-configured');
    }
  })
  .catch(function () {
    setFbBtnState('not-configured');
  });

// ── Button states ─────────────────────────────────────────────────────────────
function setFbBtnState(state) {
  var btn     = document.getElementById('fb-login-btn');
  var txtEl   = document.getElementById('fb-btn-text');
  var banner  = document.getElementById('fb-status-banner');
  if (!btn) return;

  if (state === 'ready') {
    btn.disabled = false;
    btn.style.opacity = '1';
    if (txtEl) txtEl.textContent = 'Continue with Facebook';

  } else if (state === 'loading') {
    btn.disabled = true;
    btn.style.opacity = '0.75';
    if (txtEl) txtEl.textContent = 'Connecting to Facebook…';

  } else if (state === 'not-configured') {
    btn.disabled = true;
    btn.style.opacity = '0.55';
    if (txtEl) txtEl.textContent = 'Facebook Login (setup required)';
    if (banner) {
      banner.hidden = false;
      banner.className = 'fb-status-banner fb-warn';
      banner.innerHTML =
        '⚙️ <strong>Facebook App not configured yet.</strong> ' +
        'Add your <code>FACEBOOK_APP_ID</code> in <code>backend/.env</code> ' +
        'then restart the server. ' +
        '<a href="https://developers.facebook.com" target="_blank" rel="noopener">Create one →</a>';
    }
  }
}

// ── Facebook Login button click ────────────────────────────────────────────────
document.getElementById('fb-login-btn').addEventListener('click', function () {
  if (!fbSdkReady || !FB_APP_ID) {
    showToast('Facebook Login is not configured yet. Please use email/password.', 'error');
    return;
  }

  setFbBtnState('loading');

  // Open the Facebook login popup
  FB.login(function (response) {
    if (response.authResponse && response.authResponse.accessToken) {
      handleFbToken(response.authResponse.accessToken);
    } else {
      // User cancelled or denied permission
      setFbBtnState('ready');
      if (response.status === 'not_authorized') {
        showToast('Facebook login was cancelled.', 'error');
      } else {
        showToast('Facebook login failed. Please try again.', 'error');
      }
    }
  }, {
    scope: 'public_profile,email',  // request name + email
  });
});

/**
 * Exchange the Facebook access token for a WeConnect JWT.
 * Calls POST /api/auth/facebook/token
 */
function handleFbToken(fbAccessToken) {
  fetch(API + '/auth/facebook/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ accessToken: fbAccessToken }),
  })
  .then(function (res) {
    return res.json().then(function (d) { return { ok: res.ok, d: d }; });
  })
  .then(function (result) {
    if (result.ok) {
      localStorage.setItem('wc_token', result.d.token);
      localStorage.setItem('wc_user',  JSON.stringify(result.d.user));
      showToast(result.d.message || 'Logged in with Facebook! 🎉');
      setTimeout(function () {
        window.location.replace('/pages/feed.html');
      }, 700);
    } else {
      setFbBtnState('ready');
      showToast(result.d.message || 'Facebook login failed.', 'error');
    }
  })
  .catch(function (err) {
    setFbBtnState('ready');
    showToast('Network error. Is the server running?', 'error');
    console.error('FB token exchange error:', err);
  });
}

// ── INSTAGRAM Login button click ────────────────────────────────────────────────
// Instagram uses server-side OAuth (redirect flow) – no JS SDK
(function initInstagramBtn() {
  var btn   = document.getElementById('ig-login-btn');
  var txtEl = document.getElementById('ig-btn-text');
  if (!btn) return;

  // Check config from backend
  fetch(API + '/auth/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (cfg.instagramConfigured) {
        btn.disabled  = false;
        btn.style.opacity = '1';
        if (txtEl) txtEl.textContent = 'Continue with Instagram';
      } else {
        btn.disabled  = true;
        btn.style.opacity = '0.55';
        if (txtEl) txtEl.textContent = 'Instagram Login (setup required)';
        var banner = document.getElementById('ig-status-banner');
        if (banner) {
          banner.hidden = false;
          banner.className = 'fb-status-banner fb-warn';
          banner.innerHTML =
            '⚙️ <strong>Instagram App not configured.</strong> ' +
            'Add <code>INSTAGRAM_APP_ID</code> & <code>INSTAGRAM_APP_SECRET</code> ' +
            'in <code>backend/.env</code>. ' +
            '<a href="https://developers.facebook.com" target="_blank" rel="noopener">Setup →</a>';
        }
      }
    })
    .catch(function () {
      btn.disabled = true;
      btn.style.opacity = '0.55';
    });

  btn.addEventListener('click', function () {
    if (btn.disabled) {
      showToast('Instagram Login is not configured yet.', 'error');
      return;
    }
    // Server-side OAuth redirect (Instagram doesn\'t have a JS SDK)
    window.location.href = '/api/auth/instagram';
  });
})();

// ── Tab switching ─────────────────────────────────────────────────────────────
var tabLogin    = document.getElementById('tab-login');
var tabRegister = document.getElementById('tab-register');
var panelLogin  = document.getElementById('panel-login');
var panelReg    = document.getElementById('panel-register');
var indicator   = document.querySelector('.tab-indicator');

function switchTab(tab) {
  if (tab === 'login') {
    tabLogin.classList.add('active');       tabLogin.setAttribute('aria-selected', 'true');
    tabRegister.classList.remove('active'); tabRegister.setAttribute('aria-selected', 'false');
    panelLogin.hidden = false;
    panelReg.hidden   = true;
    if (indicator) indicator.style.transform = 'translateX(0)';
  } else {
    tabRegister.classList.add('active');  tabRegister.setAttribute('aria-selected', 'true');
    tabLogin.classList.remove('active'); tabLogin.setAttribute('aria-selected', 'false');
    panelLogin.hidden = true;
    panelReg.hidden   = false;
    if (indicator) indicator.style.transform = 'translateX(100%)';
  }
}

tabLogin    && tabLogin.addEventListener('click',    function () { switchTab('login'); });
tabRegister && tabRegister.addEventListener('click', function () { switchTab('register'); });

// ── Password visibility toggle ────────────────────────────────────────────────
document.querySelectorAll('.password-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var inp = document.getElementById(btn.dataset.target);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
});

// ── Password strength ─────────────────────────────────────────────────────────
var regPwd  = document.getElementById('reg-password');
var fillEl  = document.getElementById('strength-fill');
var labelEl = document.getElementById('strength-label');

function checkStrength(pw) {
  var score = 0;
  if (pw.length >= 8)            score++;
  if (/[A-Z]/.test(pw))         score++;
  if (/[0-9]/.test(pw))         score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

regPwd && regPwd.addEventListener('input', function () {
  var score  = checkStrength(regPwd.value);
  var pct    = (score / 4) * 100;
  var colors = ['#ef4444','#f97316','#eab308','#22c55e'];
  var labels = ['Weak','Fair','Good','Strong'];
  if (fillEl)  { fillEl.style.width = pct + '%'; fillEl.style.background = colors[score - 1] || '#ef4444'; }
  if (labelEl) { labelEl.textContent = regPwd.value ? (labels[score - 1] || 'Weak') : ''; }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast';
  t.style.borderColor = type === 'error' ? '#ef4444' : '#22c55e';
  t.innerHTML = '<span>' + (type === 'error' ? '❌' : '✅') + '</span><span>' + msg + '</span>';
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 3500);
}

function setError(id, msg) {
  var el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors(prefix) {
  ['username','email','password'].forEach(function (f) {
    setError(prefix + '-' + f + '-error', '');
  });
  var ge = document.getElementById(prefix + '-global-error');
  if (ge) { ge.hidden = true; ge.textContent = ''; }
}

function setGlobal(prefix, msg) {
  var el = document.getElementById(prefix + '-global-error');
  if (el) { el.textContent = msg; el.hidden = false; }
}

function setBusy(btnId, busy) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = busy;
  var txt = btn.querySelector('.btn-text');
  var sp  = btn.querySelector('.btn-spinner');
  if (txt) txt.style.opacity = busy ? '0' : '1';
  if (sp)  sp.style.display  = busy ? 'inline-block' : 'none';
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
var loginForm = document.getElementById('login-form');
loginForm && loginForm.addEventListener('submit', function (e) {
  e.preventDefault();
  clearErrors('login');

  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  var ok = true;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setError('login-email-error', 'Enter a valid email'); ok = false; }
  if (!password) { setError('login-password-error', 'Password is required'); ok = false; }
  if (!ok) return;

  setBusy('login-submit', true);

  fetch(API + '/auth/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: email, password: password }),
  })
  .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
  .then(function (result) {
    setBusy('login-submit', false);
    if (result.ok) {
      localStorage.setItem('wc_token', result.d.token);
      localStorage.setItem('wc_user',  JSON.stringify(result.d.user));
      showToast('Welcome back, ' + result.d.user.username + '! 👋');
      setTimeout(function () { window.location.replace('/pages/feed.html'); }, 600);
    } else {
      if (result.d.errors) {
        result.d.errors.forEach(function (err) { setError('login-' + err.field + '-error', err.message); });
      } else {
        setGlobal('login', result.d.message || 'Login failed. Please try again.');
      }
    }
  })
  .catch(function (err) {
    setBusy('login-submit', false);
    setGlobal('login', 'Cannot reach server. Is it running on localhost:5000?');
    console.error(err);
  });
});

// ── REGISTER ──────────────────────────────────────────────────────────────────
var registerForm = document.getElementById('register-form');
registerForm && registerForm.addEventListener('submit', function (e) {
  e.preventDefault();
  clearErrors('reg');

  var username = document.getElementById('reg-username').value.trim();
  var email    = document.getElementById('reg-email').value.trim();
  var password = document.getElementById('reg-password').value;
  var ok = true;

  if (!username || username.length < 3) { setError('reg-username-error', 'Username must be at least 3 characters'); ok = false; }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setError('reg-email-error', 'Enter a valid email'); ok = false; }
  if (!password || password.length < 6) { setError('reg-password-error', 'Password must be at least 6 characters'); ok = false; }
  if (!ok) return;

  setBusy('register-submit', true);

  fetch(API + '/auth/register', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: username, email: email, password: password }),
  })
  .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
  .then(function (result) {
    setBusy('register-submit', false);
    if (result.ok) {
      localStorage.setItem('wc_token', result.d.token);
      localStorage.setItem('wc_user',  JSON.stringify(result.d.user));
      showToast('Account created! Welcome to WeConnect 🎉');
      setTimeout(function () { window.location.replace('/pages/feed.html'); }, 700);
    } else {
      if (result.d.errors) {
        result.d.errors.forEach(function (err) { setError('reg-' + err.field + '-error', err.message); });
      } else {
        setGlobal('reg', result.d.message || 'Registration failed. Please try again.');
      }
    }
  })
  .catch(function (err) {
    setBusy('register-submit', false);
    setGlobal('reg', 'Cannot reach server. Is it running on localhost:5000?');
    console.error(err);
  });
});

// ── Initial FB button state (disabled until config loads) ─────────────────────
(function () {
  var btn   = document.getElementById('fb-login-btn');
  var txtEl = document.getElementById('fb-btn-text');
  if (btn)   btn.disabled = true;
  if (txtEl) txtEl.textContent = 'Loading Facebook…';
})();
