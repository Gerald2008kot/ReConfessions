// ============================================================
// Login/Register View Renderer
// Migración de login.html a componente JS modular
// ============================================================

import { signIn, signUp, onAuthStateChange } from './auth.js';
import { el, showToast } from './utils.js';
import { Icons } from './icons.js';

let loginContainer = null;
let onSuccessCallback = null;
let unsubscribeAuth = null;

// ── API Pública ─────────────────────────────────────────────

/**
 * Renderiza la vista de login/registro en un contenedor.
 * @param {HTMLElement} container - Elemento donde montar la vista
 * @param {Function} onSuccess - Callback() cuando auth es exitosa
 */
export function renderLoginView(container, onSuccess) {
  loginContainer = container;
  onSuccessCallback = onSuccess;
  
  // Limpiar contenedor
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Construir estructura DOM
  const view = buildLoginView();
  container.appendChild(view);

  // Inicializar lógica de tabs y formulario
  initLoginLogic(view);
  
  // Escuchar cambios de auth (por si ya hay sesión activa)
  unsubscribeAuth = onAuthStateChange((event, session) => {
    if (session && onSuccessCallback) {
      onSuccessCallback();
    }
  });
}

/**
 * Limpia la vista de login y remueve listeners.
 */
export function destroyLoginView() {
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
  loginContainer = null;
  onSuccessCallback = null;
}

// ── Constructor de DOM ───────────────────────────────────────

function buildLoginView() {
  // View principal
  const view = el('div', { 
    className: 'login-view',
    attrs: { id: 'login-view' }
  });

  // Header con logo
  const header = el('header', { className: 'login-header' });
  const logo = el('div', { className: 'login-logo' });
  logo.appendChild(Icons.heart(true, 32)); // Logo heart filled
  const title = el('h1', { 
    className: 'login-title',
    textContent: 'Re-Confessions' 
  });
  const subtitle = el('p', {
    className: 'login-subtitle',
    textContent: 'Confesiones anónimas sobre amor, desamor y todo lo demás.'
  });
  header.appendChild(logo);
  header.appendChild(title);
  header.appendChild(subtitle);
  view.appendChild(header);

  // Card de autenticación
  const card = el('div', { className: 'login-card' });

  // Tabs
  const tabs = el('div', { className: 'login-tabs' });
  const tabLogin = el('button', {
    className: 'login-tab login-tab--active',
    textContent: 'Iniciar sesión',
    attrs: { type: 'button', 'data-tab': 'login', 'aria-selected': 'true' }
  });
  const tabSignup = el('button', {
    className: 'login-tab',
    textContent: 'Crear cuenta',
    attrs: { type: 'button', 'data-tab': 'signup', 'aria-selected': 'false' }
  });
  tabs.appendChild(tabLogin);
  tabs.appendChild(tabSignup);
  card.appendChild(tabs);

  // Formulario
  const form = el('form', { 
    className: 'login-form',
    attrs: { id: 'login-form', novalidate: true }
  });

  // Email
  const emailGroup = el('div', { className: 'form-group' });
  const emailLabel = el('label', {
    className: 'form-label',
    textContent: 'Correo electrónico',
    attrs: { for: 'login-email' }
  });
  const emailInput = el('input', {
    className: 'form-input',
    attrs: {
      type: 'email',
      id: 'login-email',
      name: 'email',
      placeholder: 'tu@email.com',
      autocomplete: 'email',
      required: true
    }
  });
  emailGroup.appendChild(emailLabel);
  emailGroup.appendChild(emailInput);
  form.appendChild(emailGroup);

  // Password
  const passGroup = el('div', { className: 'form-group' });
  const passLabel = el('label', {
    className: 'form-label',
    textContent: 'Contraseña',
    attrs: { for: 'login-password' }
  });
  const passInput = el('input', {
    className: 'form-input',
    attrs: {
      type: 'password',
      id: 'login-password',
      name: 'password',
      placeholder: 'Mínimo 8 caracteres',
      autocomplete: 'current-password',
      minlength: '8',
      required: true
    }
  });
  passGroup.appendChild(passLabel);
  passGroup.appendChild(passInput);
  form.appendChild(passGroup);

  // Nombre (solo signup)
  const nameGroup = el('div', { 
    className: 'form-group form-group--hidden',
    attrs: { id: 'name-group' }
  });
  const nameLabel = el('label', {
    className: 'form-label',
    textContent: 'Nombre',
    attrs: { for: 'login-name' }
  });
  const nameInput = el('input', {
    className: 'form-input',
    attrs: {
      type: 'text',
      id: 'login-name',
      name: 'fullName',
      placeholder: 'Cómo te llaman',
      autocomplete: 'name'
    }
  });
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  form.appendChild(nameGroup);

  // Error message
  const errorEl = el('div', {
    className: 'login-error',
    attrs: { id: 'login-error', 'aria-live': 'polite' }
  });
  form.appendChild(errorEl);

  // Submit button
  const submitBtn = el('button', {
    className: 'login-submit',
    textContent: 'Iniciar sesión',
    attrs: { type: 'submit', id: 'login-submit' }
  });
  form.appendChild(submitBtn);

  card.appendChild(form);
  view.appendChild(card);

  // Footer - modo invitado
  const footer = el('div', { className: 'login-footer' });
  const guestLink = el('button', {
    className: 'login-guest',
    textContent: 'Explorar como invitado →',
    attrs: { type: 'button', id: 'login-guest-btn' }
  });
  footer.appendChild(el('p', {
    className: 'login-footer-text',
    textContent: '¿No quieres registrarte?'
  }));
  footer.appendChild(guestLink);
  view.appendChild(footer);

  return view;
}

// ── Lógica de Interacción ──────────────────────────────────

function initLoginLogic(view) {
  const form = view.querySelector('#login-form');
  const tabLogin = view.querySelector('[data-tab="login"]');
  const tabSignup = view.querySelector('[data-tab="signup"]');
  const nameGroup = view.querySelector('#name-group');
  const nameInput = view.querySelector('#login-name');
  const submitBtn = view.querySelector('#login-submit');
  const errorEl = view.querySelector('#login-error');
  const guestBtn = view.querySelector('#login-guest-btn');

  let mode = 'login'; // 'login' | 'signup'

  // Cambio de tabs
  const setMode = (newMode) => {
    mode = newMode;
    
    // Actualizar UI tabs
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('login-tab--active', isLogin);
    tabSignup.classList.toggle('login-tab--active', !isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabSignup.setAttribute('aria-selected', String(!isLogin));
    
    // Mostrar/ocultar campo nombre
    nameGroup.classList.toggle('form-group--hidden', isLogin);
    nameInput.required = !isLogin;
    
    // Actualizar botón
    submitBtn.textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
    
    // Limpiar error
    errorEl.textContent = '';
  };

  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // Submit del formulario
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const email = form.email.value.replace(/\s/g, '').toLowerCase();
    const password = form.password.value;
    const fullName = form.fullName?.value?.trim();

    // Validaciones cliente
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errorEl.textContent = 'Ingresa un correo electrónico válido.';
      form.email.value = email;
      form.email.focus();
      return;
    }
    if (!password || password.length < 8) {
      errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      form.password.focus();
      return;
    }
    if (mode === 'signup' && !fullName) {
      errorEl.textContent = 'Por favor ingresa tu nombre.';
      form.fullName.focus();
      return;
    }

    // Loading state
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'Iniciando sesión…' : 'Creando cuenta…';

    try {
      if (mode === 'login') {
        await signIn(email, password);
        showToast('¡Bienvenido de vuelta!', 'success');
      } else {
        await signUp(email, password, fullName);
        showToast('¡Cuenta creada! Revisa tu email para confirmar.', 'success');
        // Cambiar a login tras crear cuenta
        setMode('login');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar sesión';
        form.password.value = '';
        return;
      }
      
      // Éxito - llamar callback
      if (onSuccessCallback) {
        onSuccessCallback();
      }
      
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    }
  });

  // Modo invitado
  guestBtn.addEventListener('click', () => {
    sessionStorage.setItem('rc_guest', '1');
    showToast('Modo invitado activado. Algunas funciones estarán limitadas.', 'info');
    if (onSuccessCallback) {
      onSuccessCallback();
    }
  });
}
