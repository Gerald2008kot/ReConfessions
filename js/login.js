// js/login.js
// ============================================================
// Lógica de la página de login (extraída de login.html)
// ============================================================

import { initAuthForm, getSession } from './auth.js';

// ── Redirigir si ya hay sesión ────────────────────────────────
async function boot() {
  const session = await getSession();
  if (session) {
    window.location.replace('./index.html');
    return;
  }

  initAuthForm();

  // Botón de invitado
  document.getElementById('guest-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('rc_guest', '1');
    window.location.replace('./index.html');
  });

  // Toggle mostrar/ocultar contraseña
  const toggleBtn     = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('auth-password');
  const iconOpen      = document.getElementById('icon-eye-open');
  const iconClosed    = document.getElementById('icon-eye-closed');

  toggleBtn?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    iconOpen.style.display   = isPassword ? 'none'  : 'block';
    iconClosed.style.display = isPassword ? 'block' : 'none';
    toggleBtn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

boot();
