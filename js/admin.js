// js/admin.js  (actualizado)
// Agregado: gráfica de actividad, buscar usuario por email, log de moderación

import { sb } from './api.js';
import { getCurrentUser, getProfile } from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons } from './icons.js';

let currentUser = null;
let currentProfile = null;
let adminView = null;
let onBackCallback = null;

// ── Init ─────────────────────────────────────────────────────
export async function initAdmin(onBack) {
  onBackCallback = onBack;
  currentUser = await getCurrentUser();
  if (!currentUser) return;
  currentProfile = await getProfile(currentUser.id);
  if (!currentProfile?.is_admin) return;

  adminView = document.getElementById('view-admin');
  document.getElementById('admin-back-btn')?.addEventListener('click', async () => {
    const { routerBack } = await import('./router.js');
    routerBack();
  });

  document.getElementById('admin-tab-users')?.addEventListener('click',     () => switchAdminTab('users'));
  document.getElementById('admin-tab-create')?.addEventListener('click',    () => switchAdminTab('create'));
  document.getElementById('admin-tab-dashboard')?.addEventListener('click', () => switchAdminTab('dashboard'));
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
  // Usar routerPush para que el botón atrás del navegador llame a closeAdmin
  const { routerPush } = await import('./router.js');
  routerPush('admin', closeAdmin);
  switchAdminTab('dashboard');
}

export function closeAdmin() {
  adminView?.classList.remove('active');
  setTimeout(() => { if (adminView) adminView.hidden = true; }, 300);
  onBackCallback?.();
}

// ── Tab switch ────────────────────────────────────────────────
function switchAdminTab(tab) {
  ['users', 'create', 'dashboard', 'log'].forEach(t => {
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`admin-tab-${t}`)?.classList.toggle('active',   t === tab);
  });
  if (tab === 'users')     loadUsers();
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'log')       loadModLog();
}

// ── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  const canvas = document.getElementById('admin-activity-chart');
  if (!canvas) return;

  // Últimos 14 días
  const days = 14;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data } = await sb
    .from('confessions')
    .select('created_at')
    .gte('created_at', since);

  // Agrupar por día
  const counts = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  data?.forEach(c => {
    const key = c.created_at.slice(0, 10);
    if (key in counts) counts[key]++;
  });

  const labels  = Object.keys(counts);
  const values  = Object.values(counts);
  const maxVal  = Math.max(...values, 1);

  // Render SVG bar chart (sin librerías externas)
  const W = canvas.offsetWidth || 320;
  const H = 120;
  const barW  = (W - 20) / labels.length;
  const barGap = barW * 0.25;

  let svgBars = '';
  labels.forEach((label, i) => {
    const barH  = Math.max(4, Math.round((values[i] / maxVal) * (H - 24)));
    const x     = 10 + i * barW + barGap / 2;
    const y     = H - 20 - barH;
    const bw    = barW - barGap;
    svgBars += `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${barH}"
      rx="3" fill="var(--accent)" opacity="0.8"/>`;
    if (i % 3 === 0) {
      const shortLabel = label.slice(5); // MM-DD
      svgBars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle"
        font-size="9" fill="var(--text-3)">${shortLabel}</text>`;
    }
  });

  canvas.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;height:${H}px;overflow:visible">${svgBars}</svg>`;

  // Totales rápidos
  const [{ count: totalConf }, { count: totalUsers }, { count: totalCm }] = await Promise.all([
    sb.from('confessions').select('id', { count: 'exact', head: true }),
    sb.from('profiles').select('id',    { count: 'exact', head: true }),
    sb.from('comments').select('id',    { count: 'exact', head: true }),
  ]);
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v ?? 0; };
  setEl('admin-stat-confessions', totalConf);
  setEl('admin-stat-users',       totalUsers);
  setEl('admin-stat-comments',    totalCm);
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
    row.appendChild(el('span', { className: 'admin-log-row__meta', textContent: `${entry.target_type} · ${formatDate(entry.created_at)}` }));
    if (entry.notes) row.appendChild(el('span', { className: 'admin-log-row__notes', textContent: entry.notes }));
    list.appendChild(row);
  });
}

// ── Buscar usuario ────────────────────────────────────────────
function initUserSearch() {
  const input = document.getElementById('admin-user-search');
  const results = document.getElementById('admin-user-search-results');
  if (!input || !results) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { while (results.firstChild) results.removeChild(results.firstChild); return; }
    timer = setTimeout(() => searchUserByEmail(q, results), 400);
  });
}

async function searchUserByEmail(query, results) {
  while (results.firstChild) results.removeChild(results.firstChild);
  results.appendChild(el('p', { className: 'admin-loading', textContent: 'Buscando…' }));

  // Buscar en profiles por nombre (full_name ILIKE)
  const { data } = await sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin, created_at')
    .ilike('full_name', `%${query}%`)
    .limit(10);

  while (results.firstChild) results.removeChild(results.firstChild);
  if (!data?.length) {
    results.appendChild(el('p', { className: 'admin-empty', textContent: 'Sin resultados.' }));
    return;
  }
  data.forEach(p => results.appendChild(buildUserSearchRow(p)));
}

function buildUserSearchRow(profile) {
  const row = el('div', { className: 'admin-user-row admin-user-row--search' });
  const av = el('div', { className: 'admin-user-row__avatar' });
  if (profile.avatar_url) {
    const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = 'Avatar';
    av.appendChild(img);
  } else { av.appendChild(el('span', { textContent: getInitials(profile.full_name) })); }
  row.appendChild(av);
  const info = el('div', { className: 'admin-user-row__info' });
  info.appendChild(el('span', { className: 'admin-user-row__name', textContent: profile.full_name }));
  info.appendChild(el('span', { className: 'admin-user-row__meta', textContent: formatDate(profile.created_at) }));
  row.appendChild(info);
  if (profile.is_admin) row.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }));
  return row;
}

// ── Panel Usuarios ────────────────────────────────────────────
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

  data.forEach(profile => {
    const isSelf = profile.id === currentUser.id;
    const row = el('div', { className: 'admin-user-row' });

    const av = el('div', { className: 'admin-user-row__avatar' });
    if (profile.avatar_url) {
      const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = 'Avatar'; av.appendChild(img);
    } else { av.appendChild(el('span', { textContent: getInitials(profile.full_name) })); }
    row.appendChild(av);

    const info = el('div', { className: 'admin-user-row__info' });
    const nameRow = el('div', { className: 'admin-user-row__name-row' });
    nameRow.appendChild(el('span', { className: 'admin-user-row__name', textContent: profile.full_name }));
    if (profile.is_admin) nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }));
    if (isSelf)           nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--you',   textContent: 'Tú'    }));
    info.appendChild(nameRow);
    info.appendChild(el('span', { className: 'admin-user-row__meta',
      textContent: `${confMap[profile.id]||0} conf · ${cmMap[profile.id]||0} resp · ${formatDate(profile.created_at)}` }));
    row.appendChild(info);

    if (!isSelf) {
      const actions = el('div', { className: 'admin-user-row__actions' });
      const adminToggleBtn = el('button', {
        className: `admin-action-btn${profile.is_admin ? ' admin-action-btn--active' : ''}`,
        attrs: { type: 'button', title: profile.is_admin ? 'Quitar admin' : 'Hacer admin' },
      });
      adminToggleBtn.appendChild(el('span', { textContent: profile.is_admin ? '★' : '☆' }));
      adminToggleBtn.addEventListener('click', () => toggleAdmin(profile.id, profile.is_admin, adminToggleBtn, nameRow));
      actions.appendChild(adminToggleBtn);

      const deleteBtn = el('button', { className: 'admin-action-btn admin-action-btn--danger', attrs: { type: 'button', title: 'Borrar usuario' } });
      deleteBtn.appendChild(Icons.trash(15));
      deleteBtn.addEventListener('click', () => deleteUser(profile.id, profile.full_name, row));
      actions.appendChild(deleteBtn);
      row.appendChild(actions);
    }
    listEl.appendChild(row);
  });
}

// ── Toggle admin ──────────────────────────────────────────────
async function toggleAdmin(userId, isCurrentlyAdmin, btn, nameRow) {
  const newValue = !isCurrentlyAdmin;
  if (!confirm(newValue ? '¿Dar permisos de administrador?' : '¿Quitar permisos de administrador?')) return;
  const { error } = await sb.from('profiles').update({ is_admin: newValue }).eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  btn.classList.toggle('admin-action-btn--active', newValue);
  btn.querySelector('span').textContent = newValue ? '★' : '☆';
  btn.title = newValue ? 'Quitar admin' : 'Hacer admin';
  const existingBadge = nameRow.querySelector('.admin-badge--admin');
  if (newValue && !existingBadge) {
    nameRow.insertBefore(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }), nameRow.children[1] || null);
  } else if (!newValue && existingBadge) { existingBadge.remove(); }
  await logAction('toggle_admin', 'user', userId, newValue ? 'Promocionado a admin' : 'Quitado admin');
  showToast(newValue ? 'Usuario ahora es admin.' : 'Permisos de admin removidos.', 'success');
}

// ── Delete user ───────────────────────────────────────────────
async function deleteUser(userId, name, rowEl) {
  if (!confirm(`¿Borrar al usuario "${name}"?\n\nAcción irreversible.`)) return;
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  await logAction('delete_user', 'user', userId, `Eliminado: ${name}`);
  rowEl.remove();
  showToast(`"${name}" eliminado. Completa en Supabase → Authentication.`, 'info');
}

// ── Log helper ────────────────────────────────────────────────
async function logAction(action, targetType, targetId, notes = null) {
  await sb.from('moderation_log').insert({
    action, target_type: targetType, target_id: targetId,
    admin_id: currentUser.id, notes,
  }).catch(() => {});
}

// ── Panel Crear Usuario ───────────────────────────────────────
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
    const email    = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password = passInput.value;
    const name     = nameInput.value.trim();
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

// ── Utils ─────────────────────────────────────────────────────
function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}
