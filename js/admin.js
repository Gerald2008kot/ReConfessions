// js/admin.js — Vista Administración

import { sb }                                        from './api.js';
import { getCurrentUser, getProfile }                from './auth.js';
import { el, formatDate, showToast, getInitials }    from './utils.js';
import { Icons }                                     from './icons.js';

let currentUser    = null;
let currentProfile = null;
let adminView      = null;
let onBackCallback = null;
let _mounted       = false;
let _openAutor     = null; // callback para abrir autor.js

// ── HTML ──────────────────────────────────────────────────────
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
    <button id="admin-tab-popular"   class="admin-tab"        type="button">Popular</button>
    <button id="admin-tab-users"     class="admin-tab"        type="button">Usuarios</button>
    <button id="admin-tab-create"    class="admin-tab"        type="button">Crear</button>
    <button id="admin-tab-log"       class="admin-tab"        type="button">Log</button>
  </div>

  <!-- Dashboard -->
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

  <!-- Popular: ranking -->
  <div id="admin-panel-popular" class="admin-panel">
    <div class="admin-popular-header">
      <div class="admin-popular-filters">
        <button class="buscar-period-btn"                  type="button" data-period="today">Hoy</button>
        <button class="buscar-period-btn"                  type="button" data-period="week">Semana</button>
        <button class="buscar-period-btn buscar-period-btn--active" type="button" data-period="all">Todo</button>
      </div>
      <div class="admin-search-wrap" style="margin-top:8px">
        <input id="admin-popular-search" type="search" placeholder="Filtrar ranking…" autocomplete="off" />
      </div>
    </div>
    <div id="admin-popular-list" style="padding:0 12px;overflow-y:auto"></div>
  </div>

  <!-- Usuarios -->
  <div id="admin-panel-users" class="admin-panel">
    <div class="admin-search-wrap">
      <input id="admin-user-search" type="search" placeholder="Buscar por nombre o Anonymous_N…" autocomplete="off" />
    </div>
    <div id="admin-user-search-results"></div>
    <div id="admin-user-list" class="admin-user-list">
      <p class="admin-loading">Cargando…</p>
    </div>
  </div>

  <!-- Crear usuario -->
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

  <!-- Log -->
  <div id="admin-panel-log" class="admin-panel">
    <div id="admin-log-list">
      <p class="admin-loading">Cargando…</p>
    </div>
  </div>`;

  document.getElementById('app-root').appendChild(view);
  adminView = view;
}

// ── Init ──────────────────────────────────────────────────────
export async function initAdmin(onBack, openAutorFn) {
  onBackCallback = onBack;
  _openAutor     = openAutorFn;
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

  document.getElementById('admin-tab-dashboard')?.addEventListener('click', () => switchAdminTab('dashboard'));
  document.getElementById('admin-tab-popular')?.addEventListener('click',   () => switchAdminTab('popular'));
  document.getElementById('admin-tab-users')?.addEventListener('click',     () => switchAdminTab('users'));
  document.getElementById('admin-tab-create')?.addEventListener('click',    () => switchAdminTab('create'));
  document.getElementById('admin-tab-log')?.addEventListener('click',       () => switchAdminTab('log'));

  // Filtros de periodo en tab popular
  adminView.querySelectorAll('.buscar-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      adminView.querySelectorAll('.buscar-period-btn').forEach(b => b.classList.remove('buscar-period-btn--active'));
      btn.classList.add('buscar-period-btn--active');
      _loadPopularRanking(btn.dataset.period);
    });
  });

  // Buscador interno de ranking
  let _popularTimer;
  document.getElementById('admin-popular-search')?.addEventListener('input', e => {
    clearTimeout(_popularTimer);
    _popularTimer = setTimeout(() => _filterPopularList(e.target.value.trim()), 300);
  });

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
  ['users', 'create', 'dashboard', 'log', 'popular'].forEach(t => {
    document.getElementById(`admin-panel-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`admin-tab-${t}`)?.classList.toggle('active',   t === tab);
  });
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'popular')   _loadPopularRanking('all');
  if (tab === 'users')     loadUsers();
  if (tab === 'log')       loadModLog();
}

// ── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  const canvas = document.getElementById('admin-activity-chart');
  if (!canvas) return;

  const days  = 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

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

  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const entries  = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    entries.push({ key: d.toISOString().slice(0, 10), label: dayNames[d.getDay()], count: 0 });
  }
  data?.forEach(c => {
    const key   = c.created_at.slice(0, 10);
    const entry = entries.find(e => e.key === key);
    if (entry) entry.count++;
  });

  const maxVal = Math.max(...entries.map(e => e.count), 1);
  canvas.innerHTML = '';
  canvas.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0';

  entries.forEach(({ label, count }) => {
    const row = el('div', { attrs: { style: 'display:flex;align-items:center;gap:8px;min-height:24px' } });
    row.appendChild(el('span', { textContent: label, attrs: { style: 'width:28px;font-size:11px;color:var(--text-3);text-align:right;flex-shrink:0' } }));
    const barWrap = el('div', { attrs: { style: 'flex:1;background:var(--surface-2,rgba(255,255,255,.06));border-radius:4px;height:18px;overflow:hidden' } });
    const pct     = maxVal > 0 ? (count / maxVal) * 100 : 0;
    const bar     = el('div', { attrs: { style: 'width:0%;height:100%;background:var(--accent);border-radius:4px;transition:width .4s ease' } });
    barWrap.appendChild(bar);
    row.appendChild(barWrap);
    row.appendChild(el('span', { textContent: String(count), attrs: { style: 'width:26px;font-size:11px;color:var(--text-2);text-align:left;flex-shrink:0' } }));
    canvas.appendChild(row);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
  });
}

// ── Popular: Ranking ──────────────────────────────────────────
let _popularCache = [];

async function _loadPopularRanking(period = 'all') {
  const list = document.getElementById('admin-popular-list');
  if (!list) return;
  list.innerHTML = '<p class="admin-loading">Cargando ranking…</p>';

  const { data: rankData, error } = await sb.rpc('get_user_rankings', { p_period: period, p_limit: 30 });
  if (error || !rankData?.length) {
    list.innerHTML = '<p class="admin-empty">Sin datos de ranking.</p>';
    _popularCache = [];
    return;
  }

  // Enriquecer con full_name desde profiles (el email no está en profiles, usamos full_name)
  const userIds = rankData.map(r => r.user_id);
  const { data: profilesExtra } = await sb
    .from('profiles')
    .select('id, full_name, is_admin, suspended_until')
    .in('id', userIds);
  const pmExtra = Object.fromEntries((profilesExtra || []).map(p => [p.id, p]));

  _popularCache = rankData.map(r => ({ ...r, ...(pmExtra[r.user_id] || {}) }));
  _renderPopularList(_popularCache);
}

function _filterPopularList(query) {
  if (!query) { _renderPopularList(_popularCache); return; }
  const q   = query.toLowerCase();
  const flt = _popularCache.filter(r =>
    `anonymous_${r.reg_number}`.includes(q) ||
    String(r.reg_number).includes(q) ||
    (r.full_name || '').toLowerCase().includes(q),
  );
  _renderPopularList(flt);
}

function _renderPopularList(rows) {
  const list = document.getElementById('admin-popular-list');
  if (!list) return;
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<p class="admin-empty">Sin resultados.</p>'; return; }

  rows.forEach((row, i) => {
    const isSuspended = row.suspended_until && new Date(row.suspended_until) > new Date();
    const card = el('div', {
      className: `admin-popular-row${isSuspended ? ' admin-user-row--suspended' : ''}`,
      attrs: { style: `animation-delay:${i * 30}ms` },
    });

    // Posición
    const pos = el('span', { className: 'buscar-ranking-pos' });
    if (i < 3) {
      const colors = ['#FFD700','#C0C0C0','#CD7F32'];
      pos.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${colors[i]}" aria-hidden="true"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
    } else {
      pos.textContent = `#${i + 1}`;
      pos.style.cssText = 'font-size:0.72rem;font-weight:700;opacity:0.5;min-width:24px;text-align:center';
    }
    card.appendChild(pos);

    // Avatar
    const av = el('div', { className: 'rc-card__avatar', attrs: { style: 'cursor:pointer;flex-shrink:0' } });
    if (row.avatar_url) {
      const img = document.createElement('img'); img.src = row.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
      av.appendChild(img);
    } else { av.appendChild(Icons.user(14)); }
    if (_openAutor) av.addEventListener('click', () => _openAutor(row.user_id));
    card.appendChild(av);

    // Info — seudónimo + nombre real como subtítulo
    const info  = el('div', { attrs: { style: 'flex:1;min-width:0' } });
    const nameRow = el('div', { attrs: { style: 'display:flex;align-items:center;gap:4px;flex-wrap:wrap' } });
    const alias = el('span', {
      textContent: `Anonymous_${row.reg_number}`,
      attrs: { style: 'font-weight:700;font-size:0.83rem;cursor:pointer' },
    });
    if (_openAutor) alias.addEventListener('click', () => _openAutor(row.user_id));
    nameRow.appendChild(alias);

    if (row.is_admin) nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin', attrs: { style: 'font-size:0.6rem' } }));
    if (isSuspended)  nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--suspended', textContent: 'Susp.', attrs: { style: 'font-size:0.6rem' } }));
    info.appendChild(nameRow);

    // Nombre real como subtítulo tenue
    if (row.full_name) {
      info.appendChild(el('p', {
        textContent: row.full_name,
        attrs: { style: 'font-size:0.72rem;opacity:0.42;margin:1px 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
      }));
    }

    info.appendChild(el('p', {
      attrs: { style: 'font-size:0.7rem;opacity:0.5;margin:0;display:flex;gap:8px;flex-wrap:wrap' },
      textContent: `${_fmt(row.follower_count)} seg · ${_fmt(row.post_count)} posts · ${_fmt(row.total_likes)} likes`,
    }));
    card.appendChild(info);

    list.appendChild(card);
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

  // Soportar búsqueda por Anonymous_N o número
  const isRegSearch = /^anonymous_?(\d+)$/i.test(query) || /^\d+$/.test(query);
  let q = sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin, created_at, reg_number, suspended_until, suspension_reason')
    .limit(10);

  if (isRegSearch) {
    const num = parseInt(query.replace(/\D/g, ''), 10);
    q = q.eq('reg_number', num);
  } else {
    // Buscar tanto por nombre real como por seudónimo parcial
    q = q.ilike('full_name', `%${query}%`);
  }

  const { data } = await q;
  while (results.firstChild) results.removeChild(results.firstChild);
  if (!data?.length) { results.appendChild(el('p', { className: 'admin-empty', textContent: 'Sin resultados.' })); return; }
  data.forEach(p => results.appendChild(buildUserRow(p, true)));
}

// ── Panel Usuarios ────────────────────────────────────────────
async function loadUsers() {
  const listEl = document.getElementById('admin-user-list');
  if (!listEl) return;
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  listEl.appendChild(el('p', { className: 'admin-loading', textContent: 'Cargando usuarios…' }));

  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, avatar_url, is_admin, created_at, reg_number, suspended_until, suspension_reason')
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
  const isSelf       = profile.id === currentUser?.id;
  const isSuspended  = profile.suspended_until && new Date(profile.suspended_until) > new Date();

  const row = el('div', {
    className: `admin-user-row${isSearch ? ' admin-user-row--search' : ''}${isSuspended ? ' admin-user-row--suspended' : ''}`,
    attrs: { style: `animation-delay:${index * 40}ms` },
  });

  // Avatar — click abre autor.js
  const av = el('div', { className: 'admin-user-row__avatar', style: 'cursor:pointer' });
  if (profile.avatar_url) {
    const img = document.createElement('img'); img.src = profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(el('span', { textContent: getInitials(profile.full_name) })); }
  if (_openAutor) av.addEventListener('click', () => _openAutor(profile.id));
  row.appendChild(av);

  const info    = el('div', { className: 'admin-user-row__info' });
  const nameRow = el('div', { className: 'admin-user-row__name-row' });

  // Alias Anonymous_N en lugar del nombre real
  const alias = profile.reg_number ? `Anonymous_${profile.reg_number}` : profile.full_name;
  nameRow.appendChild(el('span', { className: 'admin-user-row__name', textContent: alias }));
  if (profile.is_admin) nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }));
  if (isSelf)           nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--you',   textContent: 'Tú'    }));

  // Badge de suspensión
  if (isSuspended) {
    const suspBadge = el('span', { className: 'admin-badge admin-badge--suspended', textContent: 'Suspendido' });
    suspBadge.title = `Hasta: ${new Date(profile.suspended_until).toLocaleString()}`;
    nameRow.appendChild(suspBadge);
  }
  info.appendChild(nameRow);

  if (!isSearch) {
    let meta = `${confMap[profile.id]||0} conf · ${cmMap[profile.id]||0} resp · ${formatDate(profile.created_at)}`;
    if (isSuspended) {
      const diff = Math.max(0, new Date(profile.suspended_until) - Date.now());
      meta += ` · Suspensión expira en ${_fmtDiff(diff)}`;
    }
    info.appendChild(el('span', { className: 'admin-user-row__meta', textContent: meta }));
  } else {
    info.appendChild(el('span', { className: 'admin-user-row__meta', textContent: formatDate(profile.created_at) }));
  }
  row.appendChild(info);

  // Acciones (no para uno mismo)
  if (!isSelf) {
    const actions = el('div', { className: 'admin-user-row__actions' });
    const state   = { isAdmin: profile.is_admin, suspended: isSuspended };

    // Toggle admin
    const adminToggleBtn = el('button', {
      className: `admin-action-btn${state.isAdmin ? ' admin-action-btn--active' : ''}`,
      attrs: { type: 'button', title: state.isAdmin ? 'Quitar admin' : 'Hacer admin' },
    });
    adminToggleBtn.innerHTML = state.isAdmin
      ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>`;
    adminToggleBtn.addEventListener('click', async () => {
      const newVal = !state.isAdmin;
      if (!confirm(newVal ? '¿Dar permisos de administrador?' : '¿Quitar permisos de administrador?')) return;
      const { error } = await sb.from('profiles').update({ is_admin: newVal }).eq('id', profile.id);
      if (error) { showToast(error.message, 'error'); return; }
      state.isAdmin = newVal;
      adminToggleBtn.classList.toggle('admin-action-btn--active', newVal);
      adminToggleBtn.title = newVal ? 'Quitar admin' : 'Hacer admin';
      const badge = nameRow.querySelector('.admin-badge--admin');
      if (newVal && !badge) {
        nameRow.insertBefore(el('span', { className: 'admin-badge admin-badge--admin', textContent: 'Admin' }), nameRow.children[1] || null);
      } else if (!newVal && badge) { badge.remove(); }
      await logAction('toggle_admin', 'user', profile.id, newVal ? 'Promocionado a admin' : 'Quitado admin');
      showToast(newVal ? 'Usuario ahora es admin.' : 'Permisos de admin removidos.', 'success');
    });
    actions.appendChild(adminToggleBtn);

    // Suspender / Desuspender
    const suspBtn = el('button', {
      className: `admin-action-btn${state.suspended ? ' admin-action-btn--unsuspend' : ' admin-action-btn--suspend'}`,
      attrs: { type: 'button', title: state.suspended ? 'Levantar suspensión' : 'Suspender' },
    });
    suspBtn.innerHTML = state.suspended
      ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`;

    suspBtn.addEventListener('click', async () => {
      if (state.suspended) {
        if (!confirm('¿Levantar la suspensión?')) return;
        const { error } = await sb.rpc('unsuspend_user', { p_user_id: profile.id });
        if (error) { showToast(error.message, 'error'); return; }
        state.suspended = false;
        row.classList.remove('admin-user-row--suspended');
        const badge = nameRow.querySelector('.admin-badge--suspended');
        if (badge) badge.remove();
        showToast('Suspensión levantada.', 'success');
        _updateSuspBtn(suspBtn, false);
        await logAction('unsuspend_user', 'user', profile.id, 'Suspensión levantada manualmente');
      } else {
        _openSuspendDialog(profile.id, profile.full_name, (newSuspended) => {
          if (!newSuspended) return;
          state.suspended = true;
          row.classList.add('admin-user-row--suspended');
          nameRow.appendChild(el('span', { className: 'admin-badge admin-badge--suspended', textContent: 'Suspendido' }));
          _updateSuspBtn(suspBtn, true);
        });
      }
    });
    actions.appendChild(suspBtn);

    // Ver publicaciones (todas, incluso ocultas)
    const viewPostsBtn = el('button', {
      className: 'admin-action-btn',
      attrs: { type: 'button', title: 'Ver publicaciones' },
    });
    viewPostsBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
    viewPostsBtn.addEventListener('click', () => {
      if (_openAutor) _openAutor(profile.id);
    });
    actions.appendChild(viewPostsBtn);

    // Eliminar usuario
    const deleteBtn = el('button', { className: 'admin-action-btn admin-action-btn--danger', attrs: { type: 'button', title: 'Borrar usuario' } });
    deleteBtn.appendChild(Icons.trash(15));
    deleteBtn.addEventListener('click', () => deleteUser(profile.id, profile.full_name, row));
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
  }

  // Historial de sanciones (desplegable)
  const historyToggle = el('button', {
    className: 'admin-suspension-history-btn',
    attrs: { type: 'button', style: 'margin-left:8px;font-size:0.7rem;opacity:0.6;background:none;border:none;cursor:pointer;color:inherit' },
    textContent: 'Ver sanciones',
  });
  historyToggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    const existing = row.querySelector('.admin-suspension-history');
    if (existing) { existing.remove(); return; }
    await _showSuspensionHistory(profile.id, row);
  });
  if (!isSelf) info.appendChild(historyToggle);

  return row;
}

function _updateSuspBtn(btn, suspended) {
  btn.className = `admin-action-btn${suspended ? ' admin-action-btn--unsuspend' : ' admin-action-btn--suspend'}`;
  btn.title     = suspended ? 'Levantar suspensión' : 'Suspender';
  btn.innerHTML = suspended
    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`;
}

async function _showSuspensionHistory(userId, parentRow) {
  const container = el('div', { className: 'admin-suspension-history' });
  container.innerHTML = '<p style="font-size:0.72rem;opacity:0.5;padding:6px 0">Cargando historial…</p>';
  parentRow.appendChild(container);

  const { data } = await sb
    .from('suspension_log')
    .select('reason, duration_ms, suspended_at, expires_at, lifted_at')
    .eq('user_id', userId)
    .order('suspended_at', { ascending: false })
    .limit(10);

  container.innerHTML = '';
  if (!data?.length) {
    container.innerHTML = '<p style="font-size:0.72rem;opacity:0.5;padding:6px 0">Sin sanciones previas.</p>';
    return;
  }
  data.forEach(s => {
    const item = el('div', { attrs: { style: 'font-size:0.72rem;border-top:1px solid var(--border);padding:5px 0;opacity:0.75' } });
    const active = !s.lifted_at && new Date(s.expires_at) > new Date();
    item.innerHTML = `
      <strong>${s.reason}</strong>
      <span style="opacity:0.6;margin-left:6px">${formatDate(s.suspended_at)}</span>
      ${active ? '<span style="color:#f55;margin-left:6px">● Activa</span>' : ''}
      <br><span style="opacity:0.5">Duración: ${_fmtMs(s.duration_ms)} · Expira: ${formatDate(s.expires_at)}</span>`;
    container.appendChild(item);
  });
}

// ── Diálogo suspender desde admin.js ─────────────────────────
function _openSuspendDialog(userId, userName, onDone) {
  document.getElementById('admin-suspend-dialog')?.remove();

  const overlay = el('div', {
    className: 'reporte-overlay',
    attrs: { id: 'admin-suspend-dialog', role: 'dialog', 'aria-modal': 'true' },
  });
  const sheet = el('div', { className: 'reporte-sheet' });
  sheet.innerHTML = `
    <div class="reporte-header">
      <p class="reporte-title">Suspender: ${userName}</p>
      <button class="reporte-close" type="button" id="admin-susp-close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <p class="reporte-subtitle">Configura la duración y el motivo</p>
    <div style="display:flex;gap:8px;margin:12px 0">
      <input id="admin-susp-amount" type="number" min="1" value="1" style="width:80px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text1);font-size:0.9rem"/>
      <select id="admin-susp-unit" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text1);font-size:0.9rem">
        <option value="minutes">Minutos</option>
        <option value="hours">Horas</option>
        <option value="days" selected>Días</option>
      </select>
    </div>
    <textarea id="admin-susp-reason" class="reporte-notes" placeholder="Motivo de la suspensión…" rows="3" maxlength="300"></textarea>
    <button id="admin-susp-submit" class="reporte-submit" type="button">Confirmar suspensión</button>`;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('reporte-overlay--open'));

  document.getElementById('admin-susp-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('admin-susp-submit').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('admin-susp-amount').value, 10);
    const unit   = document.getElementById('admin-susp-unit').value;
    const reason = document.getElementById('admin-susp-reason').value.trim();
    if (!amount || amount < 1) { showToast('Introduce una duración válida.', 'info'); return; }
    if (!reason)               { showToast('El motivo es obligatorio.', 'info'); return; }
    const multipliers = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
    const durationMs  = amount * multipliers[unit];
    const btn = document.getElementById('admin-susp-submit');
    btn.disabled = true; btn.textContent = 'Suspendiendo…';
    try {
      const { error } = await sb.rpc('suspend_user', { p_user_id: userId, p_reason: reason, p_duration_ms: durationMs });
      if (error) throw new Error(error.message);
      await logAction('suspend_user', 'user', userId, reason);
      overlay.remove();
      showToast('Usuario suspendido.', 'success');
      onDone?.(true);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Confirmar suspensión';
    }
  });
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
    const email    = emailInput.value.replace(/\s/g, '').toLowerCase();
    const password = passInput.value;
    const name     = nameInput.value.trim();
    const makeAdmin = isAdminCb?.checked || false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = 'Correo inválido.'; return; }
    if (password.length < 8)                        { errorEl.textContent = 'Contraseña mínimo 8 caracteres.'; return; }
    if (!name)                                       { errorEl.textContent = 'El nombre es requerido.'; return; }
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

function _fmt(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
  return String(num);
}

function _fmtDiff(ms) {
  if (ms <= 0) return 'expirada';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function _fmtMs(ms) {
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
