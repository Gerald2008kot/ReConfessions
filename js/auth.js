// js/auth.js
// ============================================================
// Supabase Auth — Registration, Login, Session & Profile
// ============================================================

import { sb } from './api.js';
import { getInitials, showToast, el } from './utils.js';

// ── Session helpers ────────────────────────────────────────

/** Returns the current Supabase session (or null). */
export async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

/** Returns the current user object (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Fetches the profile row for a given user ID.
 * @param {string} userId
 * @returns {Object|null}
 */
export async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[auth] getProfile error:', error.message);
    return null;
  }
  return data;
}

// ── Auth actions ───────────────────────────────────────────

/**
 * Creates a new account.
 * The trigger in Supabase creates the profile row automatically.
 * @param {string} email
 * @param {string} password
 * @param {string} fullName
 */
export async function signUp(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Signs in with email + password.
 * @param {string} email
 * @param {string} password
 */
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

/** Signs out the current user. */
export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw new Error(error.message);
}

// ── Session state observer ─────────────────────────────────

/**
 * Subscribes to auth state changes and calls the callback.
 * @param {Function} callback  (event, session) => void
 */
export function onAuthStateChange(callback) {
  return sb.auth.onAuthStateChange(callback);
}

// ── Header chip renderer ───────────────────────────────────

/**
 * Renders the user chip in the site header.
 * Shows avatar if available, else initials circle.
 * @param {HTMLElement} container  - The header chip slot element
 * @param {Object|null} profile    - Profile from getProfile()
 * @param {Function}    onSignOut  - Callback for sign-out click
 */
export function renderHeaderChip(container, profile, onSignOut) {
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!profile) {
    // ¿Es modo invitado o simplemente no autenticado?
    const isGuest = sessionStorage.getItem('rc_guest') === '1';

    if (isGuest) {
      // Chip de invitado con botón para ir a login
      const guestChip = el('div', { className: 'chip chip--user' });

      const icon = el('span', {
        className:   'chip__initials',
        textContent: '👁',
        attrs:       { title: 'Guest mode', 'aria-label': 'Guest' },
      });
      icon.style.background = 'rgba(255,255,255,0.06)';
      icon.style.fontSize   = '1rem';

      const badge = el('span', {
        className:   'chip__badge chip__badge--guest',
        textContent: 'Guest',
      });

      const loginBtn = el('a', {
        className:   'chip__signout',
        textContent: '→',
        attrs:       { href: '#', title: 'Sign in', 'aria-label': 'Sign in' },
      });
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.__showLogin === 'function') window.__showLogin();
      });

      guestChip.appendChild(icon);
      guestChip.appendChild(badge);
      guestChip.appendChild(loginBtn);
      container.appendChild(guestChip);
    } else {
      // No autenticado, sin modo invitado → enlace a login
      const loginLink = el('a', {
        className:   'chip chip--login',
        textContent: 'Sign in',
        attrs:       { href: '#' },
      });
      loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.__showLogin === 'function') window.__showLogin();
      });
      container.appendChild(loginLink);
    }
    return;
  }

  // Avatar or initials
  let avatarNode;
  if (profile.avatar_url) {
    avatarNode = el('img', {
      className: 'chip__avatar',
      attrs: {
        src:   profile.avatar_url,
        alt:   'Profile picture',
        loading: 'lazy',
      },
    });
  } else {
    avatarNode = el('span', {
      className:   'chip__initials',
      textContent: getInitials(profile.full_name),
    });
  }

  // Admin badge
  const adminBadge = profile.is_admin
    ? el('span', { className: 'chip__badge chip__badge--admin', textContent: 'Admin' })
    : null;

  // Sign-out button
  const signOutBtn = el('button', {
    className:   'chip__signout',
    textContent: '⏻',
    attrs:       { type: 'button', title: 'Sign out', 'aria-label': 'Sign out' },
  });
  signOutBtn.addEventListener('click', async () => {
    try {
      await signOut();
      onSignOut?.();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Clic en el avatar abre el bottom sheet de perfil (o llama onSignOut si no hay sheet)
  const profileBtn = el('button', {
    className: 'chip__profile-link',
    attrs:     { type: 'button', title: 'Mi perfil', 'aria-label': 'Abrir perfil' },
    children:  [avatarNode],
  });
  profileBtn.addEventListener('click', () => {
    // Si existe la función global del sheet (index.html), la usamos
    if (typeof window.__openProfileSheet === 'function') {
      window.__openProfileSheet();
    } else {
      window.location.href = 'profile.html';
    }
  });

  const chip = el('div', {
    className: `chip chip--user${profile.is_admin ? ' chip--admin' : ''}`,
    children:  [profileBtn, adminBadge],
  });

  container.appendChild(chip);
}

// ── Auth form logic (used in login.html) ──────────────────

/**
 * Wires up the login/signup form.
 * Expects: #auth-form, #tab-login, #tab-signup, #auth-email,
 *          #auth-password, #auth-name, #auth-name-group,
 *          #auth-submit, #auth-error
 */
export function initAuthForm() {
  const form       = document.getElementById('auth-form');
  const tabLogin   = document.getElementById('tab-login');
  const tabSignup  = document.getElementById('tab-signup');
  const emailInput = document.getElementById('auth-email');
  const passInput  = document.getElementById('auth-password');
  const nameInput  = document.getElementById('auth-name');
  const nameGroup  = document.getElementById('auth-name-group');
  const submitBtn  = document.getElementById('auth-submit');
  const errorEl    = document.getElementById('auth-error');

  if (!form) return;

  let mode = 'login'; // 'login' | 'signup'

  const setMode = (m) => {
    mode = m;
    nameGroup.hidden = mode === 'login';
    submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    // Support both old and new tab class styles
    ['tab--active','active'].forEach(cls => {
      tabLogin.classList.toggle(cls,  mode === 'login');
      tabSignup.classList.toggle(cls, mode === 'signup');
    });
    // Clear error safely via textContent
    errorEl.textContent = '';
  };

  // Soportar tanto las clases antiguas (.tab--active) como las nuevas (.active)
  const setTabActive = (btn, active) => {
    btn.classList.toggle('tab--active', active);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  };

  tabLogin.addEventListener('click',  () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    // Sanitize — remove all whitespace including invisible Unicode chars
    const email    = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password = passInput.value;
    const name     = nameInput?.value.trim();

    // Basic email format check before hitting Supabase
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errorEl.textContent = 'Ingresa un correo electrónico válido.';
      emailInput.value = email; // show cleaned value
      return;
    }
    if (!password) {
      errorEl.textContent = 'La contraseña es requerida.';
      return;
    }
    if (mode === 'signup' && !name) {
      errorEl.textContent = 'Por favor ingresa tu nombre.';
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, name);
        showToast('Account created! Check your email to confirm.', 'success');
        setMode('login');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        return;
      }
      window.location.reload();
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  });

  // Init state
  setMode('login');
}
