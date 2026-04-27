// js/admin.js
// ============================================================
// Panel de Administración — solo accesible para is_admin=true
// Paneles: Usuarios, Crear Usuario
// ============================================================

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
  if (!currentProfile?.is_admin) return; // guard
  
  adminView = document.getElementById('view-admin');
  document.getElementById('admin-back-btn')?.addEventListener('click', closeAdmin);
  
  // Tab navigation
  document.getElementById('admin-tab-users')?.addEventListener('click',   () => switchAdminTab('users'));
  document.getElementById('admin-tab-create')?.addEventListener('click',  () => switchAdminTab('create'));
  document.getElementById('admin-tab-reports')?.addEventListener('click', () => switchAdminTab('reports'));
  
  // Wire create user form
  initCreateUserForm();
}

export async function openAdmin() {
  if (!currentProfile?.is_admin) {
    showToast('Acceso denegado.', 'error');
    return;
  }
  // Ocultar feed, mostrar admin
  document.getElementById('view-feed')?.classList.remove('active');
  document.getElementById('view-chat')?.classList.remove('active');
  adminView.hidden = false;
  requestAnimationFrame(() => adminView.classList.add('active'));
  history.pushState({ view: 'admin' }, '');
  switchAdminTab('users');
}

export function closeAdmin() {
  adminView?.classList.remove('active');
  setTimeout(() => { if (adminView) adminView.hidden = true; }, 300);
  onBackCallback?.();
}

// ── Tab switch ────────────────────────────────────────────────
function switchAdminTab(tab) {
  ['users', 'create', 'reports'].forEach(t => {
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('active', tab === t);
    document.getElementById(`admin-tab-${t}`)?.classList.toggle('active',   tab === t);
  });
  if (tab === 'users')   loadUsers();
  if (tab === 'reports') loadReports();
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
  
  // Obtener conteos por usuario
  const ids = data.map(p => p.id);
  const [{ data: confCounts }, { data: cmCounts }] = await Promise.all([
    sb.from('confessions').select('user_id').in('user_id', ids),
    sb.from('comments').select('user_id').in('user_id', ids),
  ]);
  const confMap = buildCountMap(confCounts, 'user_id');
  const cmMap = buildCountMap(cmCounts, 'user_id');
  
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  
  if (!data.length) {
    listEl.appendChild(el('p', { className: 'admin-empty', textContent: 'No hay usuarios.' }));
    return;
  }
  
  data.forEach(profile => {
    const isSelf = profile.id === currentUser.id;
    const row = el('div', { className: 'admin-user-row' });
    
    // Avatar
    const av = el('div', { className: 'admin-user-row__avatar' });
    if (profile.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.alt = 'Avatar';
      av.appendChild(img);
    } else {
      av.appendChild(el('span', { textContent: getInitials(profile.full_name) }));
    }
    row.appendChild(av);
    
    // Info
    const info = el('div', { className: 'admin-user-row__info' });
    const nameRow = el('div', { className: 'admin-user-row__name-row' });
    nameRow.appendChild(el('span', { className: 'admin-user-row__name', textContent: profile.full_name }));
    if (profile.is_admin) {
      nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }));
    }
    if (isSelf) {
      nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--you', textContent: 'Tú' }));
    }
    info.appendChild(nameRow);
    info.appendChild(el('span', {
      className: 'admin-user-row__meta',
      textContent: `${confMap[profile.id] || 0} confesiones · ${cmMap[profile.id] || 0} respuestas · ${formatDate(profile.created_at)}`,
    }));
    row.appendChild(info);
    
    // Acciones (no aplica al propio admin)
    if (!isSelf) {
      const actions = el('div', { className: 'admin-user-row__actions' });
      
      // Toggle admin
      const adminToggleBtn = el('button', {
        className: `admin-action-btn${profile.is_admin ? ' admin-action-btn--active' : ''}`,
        attrs: { type: 'button', title: profile.is_admin ? 'Quitar admin' : 'Hacer admin' },
      });
      adminToggleBtn.appendChild(el('span', { textContent: profile.is_admin ? '★' : '☆' }));
      adminToggleBtn.addEventListener('click', () => toggleAdmin(profile.id, profile.is_admin, adminToggleBtn, nameRow));
      actions.appendChild(adminToggleBtn);
      
      // Delete user
      const deleteBtn = el('button', {
        className: 'admin-action-btn admin-action-btn--danger',
        attrs: { type: 'button', title: 'Borrar usuario' },
      });
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
  const confirmMsg = newValue ?
    '¿Dar permisos de administrador a este usuario?' :
    '¿Quitar permisos de administrador a este usuario?';
  if (!confirm(confirmMsg)) return;
  
  const { error } = await sb.from('profiles').update({ is_admin: newValue }).eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  
  // Update UI
  btn.classList.toggle('admin-action-btn--active', newValue);
  btn.querySelector('span').textContent = newValue ? '★' : '☆';
  btn.title = newValue ? 'Quitar admin' : 'Hacer admin';
  
  const existingBadge = nameRow.querySelector('.admin-badge--admin');
  if (newValue && !existingBadge) {
    nameRow.insertBefore(
      el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }),
      nameRow.children[1] || null
    );
  } else if (!newValue && existingBadge) {
    existingBadge.remove();
  }
  
  showToast(newValue ? 'Usuario ahora es admin.' : 'Permisos de admin removidos.', 'success');
}

// ── Delete user ───────────────────────────────────────────────
async function deleteUser(userId, name, rowEl) {
  if (!confirm(`¿Borrar al usuario "${name}"?\n\nEsto eliminará su cuenta, confesiones y comentarios. Esta acción es irreversible.`)) return;
  
  // Borrar el perfil — CASCADE borra confesiones y comentarios
  // También necesitamos borrar el usuario de auth (requiere service_role, no disponible client-side)
  // Borramos el perfil y desactivamos — el admin debe completar en el Dashboard de Supabase
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  
  rowEl.remove();
  showToast(`Usuario "${name}" eliminado. Ve al Dashboard de Supabase → Authentication para eliminar también la cuenta de auth.`, 'info');
}

// ── Panel Crear Usuario ───────────────────────────────────────
function initCreateUserForm() {
  const form = document.getElementById('admin-create-form');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('admin-create-email');
    const passInput = document.getElementById('admin-create-password');
    const nameInput = document.getElementById('admin-create-name');
    const isAdminCb = document.getElementById('admin-create-is-admin');
    const errorEl = document.getElementById('admin-create-error');
    const submitBtn = form.querySelector('[type="submit"]');
    
    errorEl.textContent = '';
    
    const email = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password = passInput.value;
    const name = nameInput.value.trim();
    const makeAdmin = isAdminCb?.checked || false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { errorEl.textContent = 'Correo inválido.'; return; }
    if (password.length < 8) { errorEl.textContent = 'Contraseña mínimo 8 caracteres.'; return; }
    if (!name) { errorEl.textContent = 'El nombre es requerido.'; return; }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando…';
    
    try {
      // Crear usuario via Supabase Auth (signUp)
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) throw new Error(error.message);
      
      // Si debe ser admin, actualizar perfil (el trigger ya lo creó)
      if (makeAdmin && data.user?.id) {
        // Esperar brevemente al trigger
        await new Promise(r => setTimeout(r, 1200));
        await sb.from('profiles').update({ is_admin: true }).eq('id', data.user.id);
      }
      
      emailInput.value = '';
      passInput.value = '';
      nameInput.value = '';
      if (isAdminCb) isAdminCb.checked = false;
      
      showToast(`Usuario "${name}" creado. Debe confirmar su correo.`, 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear Usuario';
    }
  });
}

// ── Utils ─────────────────────────────────────────────────────
function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}

// ── Panel Reportes ────────────────────────────────────────────
async function loadReports() {
  const listEl = document.getElementById('admin-report-list');
  if (!listEl) return;

  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  listEl.appendChild(el('p', { className: 'admin-loading', textContent: 'Cargando reportes…' }));

  const { data, error } = await sb
    .from('reports')
    .select('id, reported_type, reported_id, reason, status, created_at, reporter_id, profiles!reporter_id(full_name, anonymous_number)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { showToast('Error cargando reportes.', 'error'); return; }

  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  if (!data?.length) {
    listEl.appendChild(el('p', { className: 'admin-empty', textContent: 'No hay reportes.' }));
    return;
  }

  data.forEach(report => {
    const row = el('div', { className: `admin-report-row${report.status === 'resolved' ? ' admin-report-row--resolved' : ''}` });

    const info = el('div', { className: 'admin-report-row__info' });
    const anonNum = report.profiles?.anonymous_number ?? '?';
    info.appendChild(el('span', { className: 'admin-report-row__type', textContent: report.reported_type === 'profile' ? 'Perfil' : 'Contenido' }));
    info.appendChild(el('p', { className: 'admin-report-row__reason', textContent: report.reason }));
    info.appendChild(el('span', {
      className: 'admin-user-row__meta',
      textContent: `Por Anónimo_${anonNum} · ${formatDate(report.created_at)}`,
    }));
    row.appendChild(info);

    const actions = el('div', { className: 'admin-user-row__actions' });

    if (report.status !== 'resolved') {
      const resolveBtn = el('button', {
        className: 'admin-action-btn',
        attrs: { type: 'button', title: 'Marcar como resuelto' },
        textContent: '✓',
      });
      resolveBtn.addEventListener('click', async () => {
        const { error: e } = await sb.from('reports').update({ status: 'resolved' }).eq('id', report.id);
        if (e) { showToast(e.message, 'error'); return; }
        row.classList.add('admin-report-row--resolved');
        resolveBtn.disabled = true;
        showToast('Reporte marcado como resuelto.', 'success');
      });
      actions.appendChild(resolveBtn);
    } else {
      actions.appendChild(el('span', { className: 'admin-badge admin-badge--you', textContent: 'Resuelto' }));
    }

    // Ver perfil reportado (si es tipo profile)
    if (report.reported_type === 'profile') {
      const viewBtn = el('button', {
        className: 'admin-action-btn',
        attrs: { type: 'button', title: 'Ver perfil reportado' },
      });
      viewBtn.appendChild(Icons.user ? Icons.user(14) : el('span', { textContent: '👁' }));
      viewBtn.addEventListener('click', async () => {
        const { openAutor } = await import('./autor.js');
        openAutor(report.reported_id, 'admin');
      });
      actions.appendChild(viewBtn);
    }

    row.appendChild(actions);
    listEl.appendChild(row);
  });
}