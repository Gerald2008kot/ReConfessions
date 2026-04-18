// js/login.js
// ============================================================
// Módulo de Login — renderiza toda la UI de autenticación
// sin necesitar login.html. Solo index.html existe.
// Estilos en css/patch.css (.login-*)
// ============================================================

import { initAuthForm, getSession } from './auth.js';

// ── Renderiza el HTML de la página de login ──────────────────
function renderLoginPage() {
  document.title = 'Re-Confessions — Entrar';
  // Reemplaza todo el body (elimina el DOM del feed/SPA)
  document.body.innerHTML = `
    <div class="login-page">
      <div class="login-card">

        <div class="login-logo">
          <div class="login-logo__icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0
                   00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h1 class="login-logo__title">Re-Confessions</h1>
          <p class="login-logo__sub">Tu espacio seguro y anónimo.</p>
        </div>

        <div class="login-tabs">
          <button id="tab-login"  class="login-tab active" type="button">Iniciar Sesión</button>
          <button id="tab-signup" class="login-tab"        type="button">Registrarse</button>
        </div>

        <form id="auth-form" novalidate>
          <div class="login-fields">

            <div id="auth-name-group" hidden>
              <input type="text" id="auth-name" class="login-input"
                placeholder="Tu nombre completo (privado)"
                autocomplete="name" maxlength="80" />
            </div>

            <input type="email" id="auth-email" class="login-input"
              placeholder="Correo electrónico"
              autocomplete="email" required />

            <div class="password-field">
              <input type="password" id="auth-password" class="login-input"
                placeholder="Contraseña (mín. 8 caracteres)"
                autocomplete="current-password" minlength="8" required />
              <button type="button" class="password-toggle" id="toggle-password" aria-label="Mostrar contraseña">
                <svg id="icon-eye-open" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943
                       9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg id="icon-eye-closed" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" style="display:none">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97
                       9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878
                       9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29
                       3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268
                       2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
            </div>

          </div>

          <p id="auth-error" class="login-error" role="alert" aria-live="assertive"></p>

          <button id="auth-submit" class="login-btn-primary" type="submit">
            <span class="login-btn__label">Iniciar Sesión</span>
            <span class="login-btn__spinner" aria-hidden="true" hidden>
              <svg class="login-spinner-svg" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>
                <path d="M12 2a10 10 0 0110 10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </span>
          </button>
        </form>

        <div class="login-divider"><span>o</span></div>

        <button id="guest-btn" class="login-btn-guest" type="button">
          👁 Explorar como invitado
        </button>

        <p class="login-footnote">
          Los invitados pueden leer pero no publicar.<br>
          Tu nombre <em>nunca</em> se muestra públicamente.
        </p>

      </div>
    </div>
  `;
}

// ── Spinner helpers ──────────────────────────────────────────
function showSpinner(submitBtn, mode) {
  const label   = submitBtn.querySelector('.login-btn__label');
  const spinner = submitBtn.querySelector('.login-btn__spinner');
  if (label)   label.hidden   = true;
  if (spinner) spinner.hidden = false;
  submitBtn.disabled = true;
  submitBtn.setAttribute('aria-busy', 'true');
}

function hideSpinner(submitBtn, labelText) {
  const label   = submitBtn.querySelector('.login-btn__label');
  const spinner = submitBtn.querySelector('.login-btn__spinner');
  if (label)   { label.hidden = false; label.textContent = labelText; }
  if (spinner) spinner.hidden = true;
  submitBtn.disabled = false;
  submitBtn.removeAttribute('aria-busy');
}

// ── Patch initAuthForm para agregar spinner ──────────────────
// Sobrescribimos el listener del form para interceptar submit
// y mostrar/ocultar el spinner, sin duplicar la lógica de auth.js.
function patchSubmitWithSpinner() {
  const form      = document.getElementById('auth-form');
  const submitBtn = document.getElementById('auth-submit');
  const tabLogin  = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  if (!form || !submitBtn) return;

  // Detectar modo según pestaña activa
  const getMode = () => tabSignup?.classList.contains('active') ? 'signup' : 'login';

  // Observar cambios de modo para actualizar el label del botón
  const labelMap = { login: 'Iniciar Sesión', signup: 'Registrarse' };

  [tabLogin, tabSignup].forEach(tab => {
    tab?.addEventListener('click', () => {
      const mode = getMode();
      const label = submitBtn.querySelector('.login-btn__label');
      if (label) label.textContent = labelMap[mode];
    });
  });

  // Envolver submit para spinner
  form.addEventListener('submit', () => {
    const errorEl = document.getElementById('auth-error');
    // Solo mostrar spinner si no hay errores de validación básica
    if (!errorEl?.textContent) {
      showSpinner(submitBtn, getMode());
    }
  }, { capture: true }); // capture:true para ejecutar ANTES que initAuthForm

  // auth.js llama submitBtn.disabled = false cuando hay error o éxito,
  // así que observamos esa re-habilitación para restaurar el label.
  const observer = new MutationObserver(() => {
    if (!submitBtn.disabled) {
      const mode = getMode();
      hideSpinner(submitBtn, labelMap[mode]);
    }
  });
  observer.observe(submitBtn, { attributes: true, attributeFilter: ['disabled'] });
}

// ── Toggle mostrar/ocultar contraseña ────────────────────────
function initPasswordToggle() {
  const toggleBtn     = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('auth-password');
  const iconOpen      = document.getElementById('icon-eye-open');
  const iconClosed    = document.getElementById('icon-eye-closed');

  toggleBtn?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type            = isPassword ? 'text'  : 'password';
    iconOpen.style.display        = isPassword ? 'none'  : 'block';
    iconClosed.style.display      = isPassword ? 'block' : 'none';
    toggleBtn.setAttribute('aria-label',
      isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  // Si ya hay sesión activa → ir directo al feed
  const session = await getSession();
  if (session) {
    window.location.replace('./');
    return;
  }

  renderLoginPage();

  // Primero registrar el spinner (capture: true) antes de initAuthForm
  patchSubmitWithSpinner();

  // Lógica de auth (tabs, form submit, validaciones)
  initAuthForm();

  // Toggle de contraseña
  initPasswordToggle();

  // Botón de invitado
  document.getElementById('guest-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('rc_guest', '1');
    window.location.replace('./');
  });
}

boot();
