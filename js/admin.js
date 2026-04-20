// js/admin.js — Vista Administración (inyecta HTML bajo demanda)

import { sb } from './api.js';
import { getCurrentUser, getProfile } from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons } from './icons.js';

let currentUser    = null;
let currentProfile = null;
let adminView      = null;
let onBackCallback = null;
let _mounted       = false;

function mountAdminHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id = 'view-admin';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="admin-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <h2 class="app-header__title">Administración</h2>
    <div style="min-width:38px"></div>
  </header>
  <div class="admin-tabs">
    <button id="admin-tab-dashboard" class="admin-tab active" type="button">Dashboard</button>
    <button id="admin-tab-users"     class="admin-tab"        type="button">Usuarios</button>
    <button id="admin-tab-create"    class="admin-tab"        type="button">Crear</button>
    <button id="admin-tab-log"       class="admin-tab"        type="button">Log</button>
  </div>
  <div id="admin-panel-dashboard" class="admin-panel active">
    <div class="admin-dashboard-stats">
      <div class="admin-stat-box">
        <div id="admin-stat-confessions" class="admin-stat-box__value">—</div>
        <div class="admin-stat-box__label">Confesiones</div>
      </div>
      <div class="admin-stat-box">
        <div id="admin-stat-users" class="admin-stat-box__value">—</div>
        <div class="admin-stat-box__label">Usuarios</div>
      </div>
      <div class="admin-stat-box">
        <div id="admin-stat-comments" class="admin-stat-box__value">—</div>
        <div class="admin-stat-box__label">Comentarios</div>
      </div>
    </div>
    <div class="admin-chart-wrap">
      <p class="admin-chart-title">Actividad — últimos 7 días</p>
      <div id="admin-activity-chart"></div>
    </div>
  </div>
  <div id="admin-panel-users" class="admin-panel">
    <div class="admin-search-wrap">
      <input id="admin-user-search" type="search" placeholder="Buscar por nombre…" autocomplete="off" />
    </div>
    <div id="admin-user-search-results"></div>
    <div id="admin-user-list" class="admin-user-list">
      <p class="admin-loading">Cargando…</p>
    </div>
  </div>
  <div id="admin-panel-create" class="admin-panel">
    <form id="admin-create-form" class="admin-create-form" novalidate>
      <div class="admin-field">
        <label for="admin-create-name">Nombre completo</label>
        <input type="text" id="admin-create-name" class="admin-input" placeholder="Nombre del usuario" maxlength="80" />
      </div>
      <div class="admin-field">
        <label for="admin-create-email">Correo electrónico</label>
        <input type="email" id="admin-create-email" class="admin-input" placeholder="correo@ejemplo.com" />
      </div>
      <div class="admin-field">
        <label for="admin-create-password">Contraseña temporal</label>
        <input type="password" id="admin-create-password" class="admin-input" placeholder="Mínimo 8 caracteres" />
      </div>
      <div class="admin-checkbox-row">
        <input type="checkbox" id="admin-create-is-admin" />
        <label for="admin-create-is-admin">Dar permisos de administrador</label>
      </div>
      <p id="admin-create-error" class="admin-error" role="alert"></p>
      <button type="submit" class="admin-submit-btn">Crear Usuario</button>
    </form>
  </div>
  <div id="admin-panel-log" class="admin-panel">
    <div id="admin-log-list">
      <p class="admin-loading">Cargando…</p>
    </div>
  </div>`;
  document.getElementById('app-root').appendChild(view);
  adminView = view;
}

export async function initAdmin(onBack) {
  onBackCallback = onBack;
  currentUser    = await getCurrentUser();
  if (!currentUser) return;
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile?.is_admin) return;

  mountAdminHTML();
  adminView = document.getElementById('view-admin');

  document.getElementById('admin-back-btn')?.addEventListener('click', async () => {
    const { routerBack } = await import('./router.js');
    routerBack();
  });

  // Cambiar de tab NO pushea historial — es navegación interna
  document.getElementById('admin-tab-dashboard')?.addEventListener('click', () => switchAdminTab('dashboard'));
  document.getElementById('admin-tab-users')?.addEventListener('click',     () => switchAdminTab('users'));
  document.getElementById('admin-tab-create')?.addEventListener('click',    () => switchAdminTab('create'));
  document.getElementById('admin-tab-log')?.addEventListener('click',       () => switchAdminTab('log'));

  initCreateUserForm();
  initUserSearch();
}

export async function openAdmin() {
  if (!currentProfile?.is_admin) { showToast('Acceso denegado.', 'error'); return; }
  document.getElementById('view-feed')?.classList.remove('active');
  document.getElementById('view-chat')?.classList.remove('active');
  adminView.hidden = false;
  requestAnimationFrame(() => adminView.classList.add('active'));
  const { routerPush } = await import('./router.js');
  routerPush('admin', closeAdmin);
  switchAdminTab('dashboard');
}

export function closeAdmin() {
  adminView?.classList.remove('active');
  setTimeout(() => { if (adminView) adminView.hidden = true; }, 300);
  onBackCallback?.();
}

function switchAdminTab(tab) {
  ['users', 'create', 'dashboard', 'log'].forEach(t => {
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`admin-tab-${t}`)?.classList.toggle('active',   t === tab);
  });
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'users')     loadUsers();
  if (tab === 'log')       loadModLog();
}

// ── Dashboard — gráfica horizontal de arriba a abajo ──────────
async function loadDashboard() {
  const canvas = document.getElementById('admin-activity-chart');
  if (!canvas) return;

  const days  = 7;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [{ data }, { count: totalConf }, { count: totalUsers }, { count: totalCm }] = await Promise.all([
    sb.from('confessions').select('created_at').gte('created_at', since),
    sb.from('confessions').select('id', { count: 'exact', head: true }),
    sb.from('profiles').select('id',    { count: 'exact', head: true }),
    sb.from('comments').select('id',    { count: 'exact', head: true }),
  ]);

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v ?? 0; };
  setEl('admin-stat-confessions', totalConf);
  setEl('admin-stat-users',       totalUsers);
  setEl('admin-stat-comments',    totalCm);

  // Agrupar por día (más reciente primero)
  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const entries = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400_000);
    entries.push({ key: d.toISOString().slice(0, 10), label: dayNames[d.getDay()], count: 0 });
  }
  data?.forEach(c => {
    const key = c.created_at.slice(0, 10);
    const entry = entries.find(e => e.key === key);
    if (entry) entry.count++;
  });

  const maxVal = Math.max(...entries.map(e => e.count), 1);

  // Render: una fila por día, barra horizontal de izquierda a derecha
  canvas.innerHTML = '';
  canvas.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0';

  entries.forEach(({ label, count }) => {
    const row = el('div', { attrs: { style: 'display:flex;align-items:center;gap:8px;min-height:24px' } });

    // Etiqueta día
    row.appendChild(el('span', {
      textContent: label,
      attrs: { style: 'width:28px;font-size:11px;color:var(--text-3);text-align:right;flex-shrink:0' },
    }));

    // Barra
    const barWrap = el('div', { attrs: { style: 'flex:1;background:var(--surface-2,rgba(255,255,255,.06));border-radius:4px;height:18px;overflow:hidden' } });
    const pct     = maxVal > 0 ? (count / maxVal) * 100 : 0;
    const bar     = el('div', { attrs: { style: `width:0%;height:100%;background:var(--accent);border-radius:4px;transition:width .4s ease` } });
    barWrap.appendChild(bar);
    row.appendChild(barWrap);

    // Valor
    row.appendChild(el('span', {
      textContent: String(count),
      attrs: { style: 'width:26px;font-size:11px;color:var(--text-2);text-align:left;flex-shrink:0' },
    }));

    canvas.appendChild(row);

    // Animar tras primer paint
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
  });
}

// ── Log de moderación ─────────────────────────────────────────
async function loadModLog() {
  const list = document.getElementById('admin-log-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  list.appendChild(el('p', { className: 'admin-loading', textContent: 'Cargando log…' }));

  const { data, error } = await sb
    .from('moderation_log')
    .select('id, action, target_type, target_id, admin_id, created_at, notes')
    .order('created_at', { ascending: false })
    .limit(50);

  while (list.firstChild) list.removeChild(list.firstChild);

  if (error || !data?.length) {
    list.appendChild(el('p', { className: 'admin-empty', textContent: error ? 'Error al cargar.' : 'Sin acciones registradas.' }));
    return;
  }

  data.forEach(entry => {
    const row = el('div', { className: 'admin-log-row' });
    row.appendChild(el('span', { className: 'admin-log-row__action', textContent: entry.action }));
    row.appendChild(el('span', { className: 'admin-log-row__meta',   textContent: `${entry.target_type} · ${formatDate(entry.created_at)}` }));
    if (entry.notes) row.appendChild(el('span', { className: 'admin-log-row__notes', textContent: entry.notes }));
    list.appendChild(row);
  });
}

// ── Buscar usuario ────────────────────────────────────────────
function initUserSearch() {
  const input   = document.getElementById('admin-user-search');
  const results = document.getElementById('admin-user-search-results');
  if (!input || !results) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { while (results.firstChild) results.removeChild(results.firstChild); return; }
    timer = setTimeout(() => searchUserByName(q, results), 400);
  });
}

async function searchUserByName(query, results) {
  while (results.firstChild) results.removeChild(results.firstChild);
  results.appendChild(el('p', { className: 'admin-loading', textContent: 'Buscando…' }));
  const { data } = await sb.from('profiles')
    .select('id, full_name, avatar_url, is_admin, created_at')
    .ilike('full_name', `%${query}%`).limit(10);
  while (results.firstChild) results.removeChild(results.firstChild);
  if (!data?.length) { results.appendChild(el('p', { className: 'admin-empty', textContent: 'Sin resultados.' })); return; }
  data.forEach(p => results.appendChild(buildUserRow(p, true)));
}

// ── Panel Usuarios con stagger + lazy load ────────────────────
async function loadUsers() {
  const listEl = document.getElementById('admin-user-list');
  if (!listEl) return;
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  listEl.appendChild(el('p', { className: 'admin-loading', textContent: 'Cargando usuarios…' }));

  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin, created_at')
    .order('created_at', { ascending: false });

  if (error) { showToast('Error cargando usuarios.', 'error'); return; }

  const ids = data.map(p => p.id);
  const [{ data: confCounts }, { data: cmCounts }] = await Promise.all([
    sb.from('confessions').select('user_id').in('user_id', ids),
    sb.from('comments').select('user_id').in('user_id', ids),
  ]);
  const confMap = buildCountMap(confCounts, 'user_id');
  const cmMap   = buildCountMap(cmCounts,   'user_id');

  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  if (!data.length) { listEl.appendChild(el('p', { className: 'admin-empty', textContent: 'No hay usuarios.' })); return; }

  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('rc-card--visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '40px' });

  data.forEach((profile, i) => {
    const row = buildUserRow(profile, false, confMap, cmMap, i);
    listEl.appendChild(row);
    obs.observe(row);
  });
}

function buildUserRow(profile, isSearch = false, confMap = {}, cmMap = {}, index = 0) {
  const isSelf = profile.id === currentUser?.id;
  const row    = el('div', {
    className: `admin-user-row${isSearch ? ' admin-user-row--search' : ''}`,
    attrs: { style: `animation-delay:${index * 40}ms` },
  });

  const av = el('div', { className: 'admin-user-row__avatar' });
  if (profile.avatar_url) {
    const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(el('span', { textContent: getInitials(profile.full_name) })); }
  row.appendChild(av);

  const info    = el('div', { className: 'admin-user-row__info' });
  const nameRow = el('div', { className: 'admin-user-row__name-row' });
  nameRow.appendChild(el('span', { className: 'admin-user-row__name', textContent: profile.full_name }));
  if (profile.is_admin) nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }));
  if (isSelf)           nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--you',   textContent: 'Tú'    }));
  info.appendChild(nameRow);
  if (!isSearch) {
    info.appendChild(el('span', { className: 'admin-user-row__meta',
      textContent: `${confMap[profile.id]||0} conf · ${cmMap[profile.id]||0} resp · ${formatDate(profile.created_at)}` }));
  } else {
    info.appendChild(el('span', { className: 'admin-user-row__meta', textContent: formatDate(profile.created_at) }));
  }
  row.appendChild(info);

  if (!isSelf && !isSearch) {
    const actions = el('div', { className: 'admin-user-row__actions' });

    // Guardar estado mutable en objeto local para que el closure lo vea actualizado
    const state = { isAdmin: profile.is_admin };

    const adminToggleBtn = el('button', {
      className: `admin-action-btn${state.isAdmin ? ' admin-action-btn--active' : ''}`,
      attrs: { type: 'button', title: state.isAdmin ? 'Quitar admin' : 'Hacer admin' },
    });
    adminToggleBtn.appendChild(el('span', { textContent: state.isAdmin ? '★' : '☆' }));
    adminToggleBtn.addEventListener('click', async () => {
      const newVal = !state.isAdmin;
      if (!confirm(newVal ? '¿Dar permisos de administrador?' : '¿Quitar permisos de administrador?')) return;
      const { error } = await sb.from('profiles').update({ is_admin: newVal }).eq('id', profile.id);
      if (error) { showToast(error.message, 'error'); return; }
      state.isAdmin = newVal;
      adminToggleBtn.classList.toggle('admin-action-btn--active', newVal);
      adminToggleBtn.querySelector('span').textContent = newVal ? '★' : '☆';
      adminToggleBtn.title = newVal ? 'Quitar admin' : 'Hacer admin';
      const badge = nameRow.querySelector('.admin-badge--admin');
      if (newVal && !badge) {
        nameRow.insertBefore(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }), nameRow.children[1] || null);
      } else if (!newVal && badge) { badge.remove(); }
      await logAction('toggle_admin', 'user', profile.id, newVal ? 'Promocionado a admin' : 'Quitado admin');
      showToast(newVal ? 'Usuario ahora es admin.' : 'Permisos de admin removidos.', 'success');
    });
    actions.appendChild(adminToggleBtn);

    const deleteBtn = el('button', { className: 'admin-action-btn admin-action-btn--danger', attrs: { type: 'button', title: 'Borrar usuario' } });
    deleteBtn.appendChild(Icons.trash(15));
    deleteBtn.addEventListener('click', () => deleteUser(profile.id, profile.full_name, row));
    actions.appendChild(deleteBtn);
    row.appendChild(actions);
  }
  return row;
}

async function deleteUser(userId, name, rowEl) {
  if (!confirm(`¿Borrar al usuario "${name}"?\n\nAcción irreversible.`)) return;
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  await logAction('delete_user', 'user', userId, `Eliminado: ${name}`);
  rowEl.remove();
  showToast(`"${name}" eliminado.`, 'info');
}

async function logAction(action, targetType, targetId, notes = null) {
  await sb.from('moderation_log').insert({
    action, target_type: targetType, target_id: targetId, admin_id: currentUser.id, notes,
  }).catch(() => {});
}

function initCreateUserForm() {
  const form = document.getElementById('admin-create-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('admin-create-email');
    const passInput  = document.getElementById('admin-create-password');
    const nameInput  = document.getElementById('admin-create-name');
    const isAdminCb  = document.getElementById('admin-create-is-admin');
    const errorEl    = document.getElementById('admin-create-error');
    const submitBtn  = form.querySelector('[type="submit"]');
    errorEl.textContent = '';
    const email     = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password  = passInput.value;
    const name      = nameInput.value.trim();
    const makeAdmin = isAdminCb?.checked || false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = 'Correo inválido.'; return; }
    if (password.length < 8)                         { errorEl.textContent = 'Contraseña mínimo 8 caracteres.'; return; }
    if (!name)                                        { errorEl.textContent = 'El nombre es requerido.'; return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Creando…';
    try {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) throw new Error(error.message);
      if (makeAdmin && data.user?.id) {
        await new Promise(r => setTimeout(r, 1200));
        await sb.from('profiles').update({ is_admin: true }).eq('id', data.user.id);
      }
      await logAction('create_user', 'user', data.user?.id, `Creado: ${name}`);
      emailInput.value = ''; passInput.value = ''; nameInput.value = '';
      if (isAdminCb) isAdminCb.checked = false;
      showToast(`"${name}" creado. Debe confirmar su correo.`, 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Crear Usuario';
    }
  });
}

function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}
