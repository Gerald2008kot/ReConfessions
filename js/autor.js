// js/autor.js — Perfil de Terceros con detección de vista de origen

import { sb }                                      from './api.js';
import { getCurrentUser, getProfile }              from './auth.js';
import { el, showToast, formatDate, getInitials }  from './utils.js';
import { Icons }                                   from './icons.js';
import { tagColor }                                from './shared.js';
import { routerPush, routerBack }                  from './router.js';
import { openReporte }                             from './reporte.js';
import { switchView, openChat as feedOpenChat,
         setChatViewBackCallback }                  from './feed.js';

let _currentUser    = null;
let _currentProfile = null;
let _mounted        = false;
let _targetUserId   = null;
let _originViewId   = null; // ID de la vista desde la que se abrió autor

// ── HTML ─────────────────────────────────────────────────────
function mountAutorHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id = 'view-autor'; view.className = 'view'; view.hidden = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="autor-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <h2 class="app-header__title" id="autor-header-title">Perfil</h2>
    <div id="autor-header-actions" style="display:flex;align-items:center;gap:8px;min-width:44px;justify-content:flex-end"></div>
  </header>
  <div id="autor-suspension-banner" class="suspension-banner" hidden>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
    </svg>
    <span id="autor-suspension-text">Cuenta suspendida</span>
  </div>
  <div style="overflow-y:auto;flex:1;scrollbar-width:none;">
    <div class="profile-hero autor-hero">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar" id="autor-avatar-wrap">
          <span id="autor-initials" class="profile-avatar__initials"></span>
          <img id="autor-avatar-img" class="profile-avatar__img" alt="Foto de perfil" hidden />
        </div>
      </div>
      <h2 id="autor-name" class="profile-name"></h2>
      <div class="autor-stats-row">
        <div class="autor-stat"><span id="autor-stat-followers" class="autor-stat__value">—</span><span class="autor-stat__label">Seguidores</span></div>
        <div class="autor-stat"><span id="autor-stat-posts"     class="autor-stat__value">—</span><span class="autor-stat__label">Posts</span></div>
        <div class="autor-stat"><span id="autor-stat-likes"     class="autor-stat__value">—</span><span class="autor-stat__label">Likes</span></div>
      </div>
      <div id="autor-follow-wrap" style="margin-top:12px" hidden>
        <button id="autor-follow-btn" class="autor-follow-btn" type="button">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
          </svg>
          <span id="autor-follow-label">Seguir</span>
        </button>
      </div>
    </div>
    <div class="chat-divider" style="padding:0 16px;margin:8px 0 4px">
      <div class="chat-divider__line"></div>
      <span class="chat-divider__label">Publicaciones</span>
      <div class="chat-divider__line"></div>
    </div>
    <div id="autor-feed" class="feed-scroll" style="flex:none;overflow-y:visible;padding-bottom:40px;gap:8px">
      <p class="feed-empty">Cargando…</p>
    </div>
  </div>`;
  document.getElementById('app-root').appendChild(view);
}

// ── Init ─────────────────────────────────────────────────────
export async function initAutor(currentUser, currentProfile) {
  _currentUser    = currentUser;
  _currentProfile = currentProfile;
  mountAutorHTML();
  document.getElementById('autor-back-btn')?.addEventListener('click', routerBack);
}

// ── Detectar qué vista está activa ahora mismo ────────────────
// Orden de prioridad: vistas específicas antes que view-feed
function _detectActiveView() {
  const candidates = [
    'view-admin',
    'view-buscar',
    'view-explorar',
    'view-hilos',
    'view-perfil',
    'view-chat',
  ];
  for (const id of candidates) {
    const v = document.getElementById(id);
    if (v && !v.hidden && v.classList.contains('active')) return id;
  }
  return 'view-feed';
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openAutor(userId) {
  if (!userId) return;
  _targetUserId = userId;

  // Capturar la vista de origen ANTES de hacer nada
  _originViewId = _detectActiveView();

  const view = document.getElementById('view-autor');
  if (!view) return;

  // Quitar active de la vista de origen (no hidden — para poder restaurarla)
  document.getElementById(_originViewId)?.classList.remove('active');

  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  routerPush('autor', _closeAutorUI);

  _resetHero();
  document.getElementById('autor-feed').innerHTML = '<p class="feed-empty">Cargando…</p>';

  await Promise.all([_loadProfile(userId), _loadConfessions(userId)]);
}

export function closeAutor() { routerBack(); }

// ── Cerrar — restaurar vista de origen ───────────────────────
function _closeAutorUI() {
  const view = document.getElementById('view-autor');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);

  if (_originViewId) {
    const origin = document.getElementById(_originViewId);
    if (origin) {
      // view-chat requiere tratamiento especial: puede estar oculto o visible
      origin.hidden = false;
      requestAnimationFrame(() => origin.classList.add('active'));
    } else {
      document.getElementById('view-feed')?.classList.add('active');
    }
  } else {
    document.getElementById('view-feed')?.classList.add('active');
  }
  _originViewId = null;
}

// ── Reset UI ─────────────────────────────────────────────────
function _resetHero() {
  document.getElementById('autor-name').textContent           = '';
  document.getElementById('autor-header-title').textContent   = 'Perfil';
  document.getElementById('autor-stat-followers').textContent = '—';
  document.getElementById('autor-stat-posts').textContent     = '—';
  document.getElementById('autor-stat-likes').textContent     = '—';
  document.getElementById('autor-avatar-img').hidden          = true;
  document.getElementById('autor-initials').hidden            = false;
  document.getElementById('autor-initials').textContent       = '';
  document.getElementById('autor-suspension-banner').hidden   = true;
  document.getElementById('autor-follow-wrap').hidden         = true;
  document.getElementById('autor-header-actions').innerHTML   = '';
}

// ── Cargar perfil vía RPC ─────────────────────────────────────
async function _loadProfile(userId) {
  const { data, error } = await sb.rpc('get_author_profile', { p_user_id: userId });
  if (error || !data?.length) { showToast('No se pudo cargar el perfil.', 'error'); return; }

  const p     = data[0];
  const alias = `Anonymous_${p.reg_number}`;

  document.getElementById('autor-name').textContent           = alias;
  document.getElementById('autor-header-title').textContent   = alias;
  document.getElementById('autor-stat-followers').textContent = _fmt(p.follower_count);
  document.getElementById('autor-stat-posts').textContent     = _fmt(p.post_count);
  document.getElementById('autor-stat-likes').textContent     = _fmt(p.total_likes);

  const img      = document.getElementById('autor-avatar-img');
  const initials = document.getElementById('autor-initials');
  if (p.avatar_url) {
    img.src = p.avatar_url; img.hidden = false; initials.hidden = true;
  } else {
    initials.textContent = `A${p.reg_number}`; initials.hidden = false; img.hidden = true;
  }

  const isSelf  = _currentUser?.id === userId;
  const isAdmin = !!_currentProfile?.is_admin;

  if (p.suspended_until && (isSelf || isAdmin)) {
    const diff = Math.max(0, new Date(p.suspended_until) - Date.now());
    document.getElementById('autor-suspension-banner').hidden = false;
    document.getElementById('autor-suspension-text').textContent = `Suspendido — expira en ${_fmtDiff(diff)}`;
  }

  if (_currentUser && !isSelf) {
    document.getElementById('autor-follow-wrap').hidden = false;
    _renderFollowBtn(p.is_following, userId);
  }

  _renderHeaderActions(userId, isAdmin);
}

// ── Botón Seguir ──────────────────────────────────────────────
function _renderFollowBtn(isFollowing, userId) {
  const btn = document.getElementById('autor-follow-btn');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  const newBtn   = document.getElementById('autor-follow-btn');
  const newLabel = document.getElementById('autor-follow-label');
  let following  = isFollowing;
  _applyFollowState(newBtn, newLabel, following);

  newBtn.addEventListener('click', async () => {
    if (!_currentUser) { showToast('Inicia sesión para seguir.', 'info'); return; }
    newBtn.disabled = true;
    try {
      const stat = document.getElementById('autor-stat-followers');
      if (following) {
        await sb.from('follows').delete().eq('follower_id', _currentUser.id).eq('following_id', userId);
        following = false;
        stat.textContent = String(Math.max(0, parseInt(stat.textContent || '0') - 1));
      } else {
        await sb.from('follows').insert({ follower_id: _currentUser.id, following_id: userId });
        following = true;
        stat.textContent = String(parseInt(stat.textContent || '0') + 1);
      }
      _applyFollowState(newBtn, newLabel, following);
    } catch (err) { showToast(err.message, 'error'); }
    finally { newBtn.disabled = false; }
  });
}

function _applyFollowState(btn, label, isFollowing) {
  if (!btn || !label) return;
  label.textContent = isFollowing ? 'Dejar de seguir' : 'Seguir';
  btn.classList.toggle('autor-follow-btn--following', isFollowing);
  const p = btn.querySelector('svg path');
  if (p) p.setAttribute('d', isFollowing
    ? 'M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z'
    : 'M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z');
}

// ── Acciones header ───────────────────────────────────────────
function _renderHeaderActions(userId, isAdmin) {
  const wrap = document.getElementById('autor-header-actions');
  wrap.innerHTML = '';
  if (_currentUser && _currentUser.id !== userId) {
    const r = el('button', { className: 'app-header__icon-btn', attrs: { type: 'button', 'aria-label': 'Reportar' } });
    r.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17.25 4.5 21V8.742m.164-4.078a2.15 2.15 0 011.743-1.342 48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185V19.5M4.664 4.664L19.5 19.5"/></svg>`;
    r.addEventListener('click', () => openReporte({ type: 'user', id: userId }));
    wrap.appendChild(r);
  }
  if (isAdmin) {
    const m = el('button', { className: 'app-header__icon-btn', attrs: { type: 'button', 'aria-label': 'Admin', id: 'autor-admin-menu-btn' } });
    m.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>`;
    m.addEventListener('click', e => { e.stopPropagation(); _toggleAdminDropdown(userId); });
    wrap.appendChild(m);
  }
}

function _toggleAdminDropdown(userId) {
  document.getElementById('autor-admin-dropdown')?.remove();
  const dd = el('div', { attrs: { id: 'autor-admin-dropdown', role: 'menu' }, className: 'autor-admin-dropdown' });
  const items = [
    { label: 'Suspender cuenta',     danger: false, d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z', fn: () => { dd.remove(); _openSuspendDialog(userId); } },
    { label: 'Levantar suspensión',  danger: false, d: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',                                                                                                                                     fn: () => { dd.remove(); _doUnsuspend(userId); } },
    { label: 'Borrar publicaciones', danger: true,  d: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0', fn: () => { dd.remove(); _doDeletePosts(userId); } },
  ];
  items.forEach(({ label, danger, d, fn }) => {
    const b = el('button', { className: `autor-admin-dropdown__item${danger ? ' autor-admin-dropdown__item--danger' : ''}`, attrs: { type: 'button' } });
    b.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>${label}`;
    b.addEventListener('click', fn);
    dd.appendChild(b);
  });
  document.getElementById('autor-admin-menu-btn')?.after(dd);
  setTimeout(() => document.addEventListener('click', () => dd.remove(), { once: true }), 10);
}

function _openSuspendDialog(userId) {
  document.getElementById('autor-suspend-dialog')?.remove();
  const overlay = el('div', { className: 'reporte-overlay', attrs: { id: 'autor-suspend-dialog', role: 'dialog', 'aria-modal': 'true' } });
  const sheet   = el('div', { className: 'reporte-sheet' });
  sheet.innerHTML = `
    <div class="reporte-header">
      <p class="reporte-title">Suspender cuenta</p>
      <button class="reporte-close" type="button" id="suspend-close-btn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    <p class="reporte-subtitle">Configura la duración y el motivo</p>
    <div style="display:flex;gap:8px;margin:12px 0">
      <input id="suspend-amount" type="number" min="1" value="1" style="width:80px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text1);font-size:0.9rem"/>
      <select id="suspend-unit" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text1);font-size:0.9rem">
        <option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days" selected>Días</option>
      </select>
    </div>
    <textarea id="suspend-reason" class="reporte-notes" placeholder="Motivo…" rows="3" maxlength="300"></textarea>
    <button id="suspend-submit-btn" class="reporte-submit" type="button">Confirmar suspensión</button>`;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('reporte-overlay--open'));
  document.getElementById('suspend-close-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('suspend-submit-btn').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('suspend-amount').value, 10);
    const unit   = document.getElementById('suspend-unit').value;
    const reason = document.getElementById('suspend-reason').value.trim();
    if (!amount || amount < 1) { showToast('Duración inválida.', 'info'); return; }
    if (!reason) { showToast('Motivo obligatorio.', 'info'); return; }
    const ms  = amount * { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[unit];
    const btn = document.getElementById('suspend-submit-btn');
    btn.disabled = true; btn.textContent = 'Suspendiendo…';
    try {
      const { error } = await sb.rpc('suspend_user', { p_user_id: userId, p_reason: reason, p_duration_ms: ms });
      if (error) throw new Error(error.message);
      overlay.remove(); showToast('Usuario suspendido.', 'success');
      await _loadProfile(userId);
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Confirmar suspensión'; }
  });
}

async function _doUnsuspend(userId) {
  if (!confirm('¿Levantar la suspensión?')) return;
  const { error } = await sb.rpc('unsuspend_user', { p_user_id: userId });
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Suspensión levantada.', 'success');
  await _loadProfile(userId);
}

async function _doDeletePosts(userId) {
  if (!confirm('¿Borrar TODAS las publicaciones? Irreversible.')) return;
  const { error } = await sb.from('confessions').delete().eq('user_id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Publicaciones eliminadas.', 'success');
  document.getElementById('autor-feed').innerHTML = '<p class="feed-empty">Sin publicaciones.</p>';
}

// ── Confesiones públicas ──────────────────────────────────────
async function _loadConfessions(userId) {
  const feed    = document.getElementById('autor-feed');
  const isAdmin = !!_currentProfile?.is_admin;

  if (!isAdmin && _currentUser?.id !== userId) {
    const { data: pd } = await sb.from('profiles').select('is_private').eq('id', userId).single();
    if (pd?.is_private) { feed.innerHTML = '<p class="feed-empty">Este perfil es privado.</p>'; return; }
  }

  const { data, error } = await sb
    .from('confessions')
    .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40);

  feed.innerHTML = '';
  if (error || !data?.length) { feed.innerHTML = '<p class="feed-empty">Sin publicaciones.</p>'; return; }

  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('rc-card--visible'); observer.unobserve(e.target); });
  }, { rootMargin: '60px' });

  data.forEach((c, i) => { const card = _buildCard(c, i); feed.appendChild(card); obs.observe(card); });
}

function _buildCard(c, index) {
  const card = el('article', { className: 'rc-card rc-card--compact', attrs: { tabindex: '0', style: `animation-delay:${index * 40}ms` } });
  const top  = el('div', { className: 'rc-card__top' });
  const tag  = c.hashtag || '#Confesión';
  const tc   = tagColor(tag);
  top.appendChild(el('span', { className: 'rc-card__tag', textContent: tag, attrs: { style: `background:${tc.bg};color:${tc.fg}` } }));
  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(c.created_at) }));
  if (_currentUser) {
    const rb = el('button', { className: 'rc-card__report-btn', attrs: { type: 'button', 'aria-label': 'Reportar' } });
    rb.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17.25 4.5 21V8.742m.164-4.078a2.15 2.15 0 011.743-1.342 48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185V19.5M4.664 4.664L19.5 19.5"/></svg>`;
    rb.addEventListener('click', e => { e.stopPropagation(); openReporte({ type: 'confession', id: c.id }); });
    top.appendChild(rb);
  }
  card.appendChild(top);
  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: c.content }));
  if (c.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb rc-card__thumb--sm' });
    const img = document.createElement('img'); img.src = c.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    thumb.appendChild(img); body.appendChild(thumb);
  }
  card.appendChild(body);
  const open = () => _openChatFromAutor(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

function _openChatFromAutor(confession) {
  const autorView = document.getElementById('view-autor');
  autorView?.classList.remove('active');
  setTimeout(() => { if (autorView) autorView.hidden = true; }, 300);
  setChatViewBackCallback(() => {
    const v = document.getElementById('view-autor');
    if (v) { v.hidden = false; requestAnimationFrame(() => v.classList.add('active')); }
  });
  switchView('chat');
  feedOpenChat(confession);
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
  if (d > 0) return `${d}d ${h % 24}h`; if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`; return `${s}s`;
}
