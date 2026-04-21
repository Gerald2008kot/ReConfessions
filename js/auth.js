// js/auth.js
// ============================================================
// Supabase Auth — Registration, Login, Session & Profile
// ============================================================

import { sb } from './api.js';
import { getInitials, showToast, el } from './utils.js';

// ── Session helpers ────────────────────────────────────────

export async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Obtiene el perfil del usuario con los nuevos campos (reg_number, suspended_until, bio, is_private).
 */
export async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin, reg_number, bio, is_private, suspended_until, suspension_reason')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[auth] getProfile error:', error.message);
    return null;
  }
  return data;
}

// ── Auth actions ───────────────────────────────────────────

export async function signUp(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback) {
  return sb.auth.onAuthStateChange(callback);
}

// ── Header chip renderer ───────────────────────────────────

/**
 * Renderiza el chip de sesión en el header.
 * - Modo invitado: el chip NO abre el sheet de perfil; dispara directamente login.
 * - Usuario suspendido: el avatar tiene borde rojo.
 */
export function renderHeaderChip(container, profile, onSignOut) {
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!profile) {
    const isGuest = sessionStorage.getItem('rc_guest') === '1';

    if (isGuest) {
      // Chip de invitado — clic directo a login, sin abrir sheet
      const guestChip = el('div', { className: 'chip chip--user chip--guest' });

      const icon = el('button', {
        className: 'chip__profile-link',
        attrs:     { type: 'button', title: 'Iniciar sesión', 'aria-label': 'Iniciar sesión' },
      });
      icon.innerHTML = `<span class="chip__initials chip__initials--guest" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      </span>`;
      // BUG FIX: modo invitado → clic SIEMPRE va a login, no al sheet de perfil
      icon.addEventListener('click', () => {
        if (typeof window.__showLogin === 'function') window.__showLogin();
        else window.location.href = './login.html';
      });

      const badge = el('span', { className: 'chip__badge chip__badge--guest', textContent: 'Invitado' });

      guestChip.appendChild(icon);
   // guestChip.appendChild(badge);
      container.appendChild(guestChip);
    } else {
      // No autenticado sin modo invitado
      const loginLink = el('button', {
        className: 'chip chip--login',
        attrs:     { type: 'button' },
        textContent: 'Iniciar sesión',
      });
      loginLink.addEventListener('click', () => {
        if (typeof window.__showLogin === 'function') window.__showLogin();
        else window.location.href = './login.html';
      });
      container.appendChild(loginLink);
    }
    return;
  }

  // ── Usuario autenticado ────────────────────────────────────
  const isSuspended = profile.suspended_until && new Date(profile.suspended_until) > new Date();

  // Avatar o iniciales
  let avatarNode;
  if (profile.avatar_url) {
    avatarNode = el('img', {
      className: 'chip__avatar',
      attrs: {
        src:     profile.avatar_url,
        alt:     'Foto de perfil',
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

  // Botón de perfil (clic abre sheet)
  const profileBtn = el('button', {
    className: `chip__profile-link${isSuspended ? ' chip__profile-link--suspended' : ''}`,
    attrs:     { type: 'button', title: 'Mi perfil', 'aria-label': 'Abrir perfil' },
    children:  [avatarNode],
  });
  // Usuarios suspendidos pueden abrir su perfil para ver el banner
  profileBtn.addEventListener('click', () => {
    if (typeof window.__openProfileSheet === 'function') {
      window.__openProfileSheet();
    } else {
      window.location.href = 'profile.html';
    }
  });

  const chip = el('div', {
    className: `chip chip--user${profile.is_admin ? ' chip--admin' : ''}${isSuspended ? ' chip--suspended' : ''}`,
    children:  [profileBtn, adminBadge],
  });

  container.appendChild(chip);
}

// ── Auth form logic ────────────────────────────────────────

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

  let mode = 'login';

  const setMode = (m) => {
    mode = m;
    nameGroup.hidden = mode === 'login';
    submitBtn.textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    ['tab--active','active'].forEach(cls => {
      tabLogin.classList.toggle(cls,  mode === 'login');
      tabSignup.classList.toggle(cls, mode === 'signup');
    });
    errorEl.textContent = '';
  };

  tabLogin.addEventListener('click',  () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const email    = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password = passInput.value;
    const name     = nameInput?.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errorEl.textContent = 'Ingresa un correo electrónico válido.';
      emailInput.value = email;
      return;
    }
    if (!password)                     { errorEl.textContent = 'La contraseña es requerida.'; return; }
    if (mode === 'signup' && !name)    { errorEl.textContent = 'Por favor ingresa tu nombre.'; return; }
    if (password.length < 8)           { errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }

    submitBtn.disabled    = true;
    submitBtn.textContent = mode === 'login' ? 'Iniciando sesión…' : 'Creando cuenta…';

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, name);
        showToast('¡Cuenta creada! Revisa tu correo para confirmarla.', 'success');
        setMode('login');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Iniciar sesión';
        return;
      }
      window.location.reload();
    } catch (err) {
      errorEl.textContent   = err.message;
      submitBtn.disabled    = false;
      submitBtn.textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    }
  });

  setMode('login');
}
