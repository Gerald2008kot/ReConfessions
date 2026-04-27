// js/autor.js
// ============================================================
// Vista Pública de Autor — perfil anónimo de cualquier usuario
// Acceso: tocar foto de perfil en cualquier card del feed/chat
// ============================================================

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile }            from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons }                                 from './icons.js';
import { tagColor }                              from './shared.js';
import { routerPush, routerBack }                from './router.js';
import { buildCard as feedBuildCard }            from './feed.js';

let _currentUser    = null;
let _currentProfile = null;
let _targetUserId   = null;
let _targetProfile  = null;
let _fromView       = null; // 'feed' | 'chat' — para restaurar correctamente
let _onClose        = null;

// ── Init ──────────────────────────────────────────────────────
export async function initAutor() {
  _currentUser    = await getCurrentUser();
  if (_currentUser) _currentProfile = await getProfile(_currentUser.id);
}

// ── Abrir perfil de autor ─────────────────────────────────────
// fromView: clave del router que identifica la vista de origen
export async function openAutor(userId, fromView = 'feed', onClose = null) {
  if (!userId) return;

  _targetUserId = userId;
  _fromView     = fromView;
  _onClose      = onClose;

  // Asegurar que el módulo esté inicializado
  if (!_currentUser && !_currentProfile) await initAutor();

  // Construir o reusar el overlay
  let overlay = document.getElementById('autor-overlay');
  if (!overlay) {
    overlay = _buildOverlay();
    document.body.appendChild(overlay);
  }

  // Mostrar con animación
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('autor-overlay--open'));

  // Empujar historial
  routerPush('autor', _closeAutorUI);

  // Cargar datos
  await _loadAutorData(userId, overlay);
}

// ── Cerrar (sin tocar historial) ──────────────────────────────
function _closeAutorUI() {
  const overlay = document.getElementById('autor-overlay');
  if (!overlay) return;
  overlay.classList.remove('autor-overlay--open');
  setTimeout(() => { overlay.hidden = true; overlay.remove(); }, 280);
  _onClose?.();
}

export function closeAutor() {
  routerBack(); // dispara popstate → _closeAutorUI
}

// ── Construir estructura del overlay ─────────────────────────
function _buildOverlay() {
  const overlay = el('div', {
    className: 'autor-overlay view',
    attrs: { id: 'autor-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Perfil de autor' },
  });

  // Header
  const header = el('header', { className: 'app-header' });
  const backBtn = el('button', {
    className: 'app-header__back',
    attrs: { type: 'button', 'aria-label': 'Volver', id: 'autor-back-btn' },
  });
  backBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>`;
  backBtn.addEventListener('click', closeAutor);

  const title = el('h2', { className: 'app-header__title', textContent: 'Perfil' });

  // Dropdown (tres puntos)
  const menuWrap = el('div', { className: 'autor-menu-wrap', attrs: { style: 'position:relative;min-width:44px;display:flex;justify-content:flex-end' } });
  const menuBtn = el('button', {
    className: 'app-header__icon-btn',
    attrs: { type: 'button', id: 'autor-menu-btn', 'aria-label': 'Más opciones' },
  });
  menuBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>`;
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleDropdown(); });
  const dropdown = el('div', { className: 'autor-dropdown', attrs: { id: 'autor-dropdown', hidden: '' } });
  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(dropdown);

  header.appendChild(backBtn);
  header.appendChild(title);
  header.appendChild(menuWrap);
  overlay.appendChild(header);

  // Cuerpo scrollable
  const body = el('div', { className: 'autor-body' });
  body.appendChild(el('div', { className: 'autor-loading', attrs: { id: 'autor-loading' }, textContent: 'Cargando…' }));
  overlay.appendChild(body);

  // Cerrar dropdown al tocar fuera
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('autor-dropdown');
    const mb = document.getElementById('autor-menu-btn');
    if (dd && !dd.hidden && !dd.contains(e.target) && e.target !== mb) {
      dd.hidden = true;
    }
  });

  return overlay;
}

function _toggleDropdown() {
  const dd = document.getElementById('autor-dropdown');
  if (!dd) return;
  dd.hidden = !dd.hidden;
}

// ── Cargar y renderizar datos del autor ───────────────────────
async function _loadAutorData(userId, overlay) {
  const body = overlay.querySelector('.autor-body');
  const loading = document.getElementById('autor-loading');

  try {
    // Perfil básico
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('id, full_name, avatar_url, is_admin, created_at, bio, anonymous_number, suspended_until')
      .eq('id', userId)
      .single();

    if (pErr || !profile) { showToast('Perfil no encontrado.', 'error'); closeAutor(); return; }

    _targetProfile = profile;

    // Estadísticas paralelas
    const [
      { count: totalPubs },
      { data: myIds },
      { count: followers },
    ] = await Promise.all([
      sb.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      sb.from('confessions').select('id').eq('user_id', userId),
      sb.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    ]);

    let totalLikes = 0;
    if (myIds?.length) {
      const { count: lk } = await sb.from('likes')
        .select('id', { count: 'exact', head: true })
        .in('confession_id', myIds.map(r => r.id));
      totalLikes = lk ?? 0;
    }

    // ¿El usuario actual ya sigue?
    let isFollowing = false;
    let isSelf      = false;
    if (_currentUser) {
      isSelf = _currentUser.id === userId;
      if (!isSelf) {
        const { data: fRow } = await sb
          .from('follows')
          .select('id')
          .match({ follower_id: _currentUser.id, following_id: userId })
          .maybeSingle();
        isFollowing = !!fRow;
      }
    }

    // Limpiar loading
    while (body.firstChild) body.removeChild(body.firstChild);

    // ── Banner de suspensión ──────────────────────────────────
    if (profile.suspended_until && new Date(profile.suspended_until) > new Date()) {
      const diff  = Math.ceil((new Date(profile.suspended_until) - Date.now()) / 86400000);
      const banner = el('div', { className: 'autor-suspension-banner' });
      banner.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z"/></svg>
      <span>Este usuario está suspendido — quedan <strong>${diff} día${diff !== 1 ? 's' : ''}</strong>.</span>`;
      body.appendChild(banner);
    }

    // ── Hero ──────────────────────────────────────────────────
    const hero = el('div', { className: 'autor-hero' });

    // Avatar
    const avatarWrap = el('div', { className: 'autor-avatar-wrap' });
    const avatar     = el('div', { className: 'autor-avatar' });
    if (profile.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
      avatar.appendChild(img);
    } else {
      avatar.appendChild(el('span', { className: 'autor-avatar__initials', textContent: getInitials(profile.full_name) }));
    }
    avatarWrap.appendChild(avatar);
    hero.appendChild(avatarWrap);

    // Nombre anónimo
    const anonNum  = profile.anonymous_number ?? '?';
    const anonName = el('h2', { className: 'autor-name', textContent: `Anónimo_${anonNum}` });
    hero.appendChild(anonName);

    if (profile.is_admin) {
      hero.appendChild(el('span', { className: 'profile-admin-badge', textContent: 'Admin' }));
    }

    // Estadísticas
    const stats = el('div', { className: 'autor-stats' });
    const mkStat = (val, label) => {
      const s = el('div', { className: 'autor-stat' });
      s.appendChild(el('span', { className: 'autor-stat__value', textContent: String(val ?? 0) }));
      s.appendChild(el('span', { className: 'autor-stat__label', textContent: label }));
      return s;
    };
    stats.appendChild(mkStat(followers ?? 0, 'Seguidores'));
    stats.appendChild(mkStat(totalLikes,     'Likes'));
    stats.appendChild(mkStat(totalPubs ?? 0, 'Publicaciones'));
    hero.appendChild(stats);

    // Botón seguir (no para uno mismo ni invitados)
    if (_currentUser && !isSelf) {
      const followBtn = el('button', {
        className: `autor-follow-btn${isFollowing ? ' autor-follow-btn--following' : ''}`,
        attrs: { type: 'button', id: 'autor-follow-btn' },
        textContent: isFollowing ? 'Siguiendo' : 'Seguir',
      });
      followBtn.addEventListener('click', () => _toggleFollow(userId, followBtn, stats));
      hero.appendChild(followBtn);
    } else if (!_currentUser) {
      const followBtn = el('button', {
        className: 'autor-follow-btn',
        attrs: { type: 'button' },
        textContent: 'Seguir',
      });
      followBtn.addEventListener('click', () => {
        showToast('Inicia sesión para seguir usuarios.', 'info');
      });
      hero.appendChild(followBtn);
    }

    // Biografía
    if (profile.bio) {
      const bioEl = el('p', { className: 'autor-bio', textContent: profile.bio });
      hero.appendChild(bioEl);
    }

    body.appendChild(hero);

    // ── Divisor ───────────────────────────────────────────────
    const divider = el('div', { className: 'chat-divider', attrs: { style: 'padding:0 16px;margin:8px 0' } });
    divider.innerHTML = `<div class="chat-divider__line"></div><span class="chat-divider__label">Publicaciones</span><div class="chat-divider__line"></div>`;
    body.appendChild(divider);

    // ── Feed del autor ────────────────────────────────────────
    const feedWrap = el('div', { className: 'autor-feed', attrs: { id: 'autor-feed' } });
    body.appendChild(feedWrap);
    await _loadAutorFeed(userId, feedWrap);

    // ── Dropdown del menú ──────────────────────────────────────
    _renderDropdown(userId, profile);

  } catch (err) {
    console.error('[autor]', err);
    showToast('Error cargando perfil.', 'error');
    closeAutor();
  }
}

// ── Renderizar opciones del dropdown ─────────────────────────
function _renderDropdown(userId, profile) {
  const dd = document.getElementById('autor-dropdown');
  if (!dd) return;
  while (dd.firstChild) dd.removeChild(dd.firstChild);

  const isAdmin = !!_currentProfile?.is_admin;
  const isSelf  = _currentUser?.id === userId;

  // Siempre: Reportar perfil (si no es uno mismo)
  if (!isSelf) {
    const reportBtn = _mkDropdownItem('Reportar perfil', 'var(--danger, #ef4444)', () => {
      dd.hidden = true;
      _reportProfile(userId);
    });
    dd.appendChild(reportBtn);
  }

  if (isAdmin && !isSelf) {
    dd.appendChild(_mkDropdownDivider());

    const isSuspended = profile.suspended_until && new Date(profile.suspended_until) > new Date();

    if (!isSuspended) {
      // Suspender opciones
      [1, 3, 7, 30].forEach(days => {
        const btn = _mkDropdownItem(`Suspender ${days} día${days > 1 ? 's' : ''}`, 'var(--warning, #f59e0b)', () => {
          dd.hidden = true;
          _suspendUser(userId, days);
        });
        dd.appendChild(btn);
      });
    } else {
      const unsuspBtn = _mkDropdownItem('Desuspender', 'var(--success, #22c55e)', () => {
        dd.hidden = true;
        _unsuspendUser(userId);
      });
      dd.appendChild(unsuspBtn);
    }
  }

  if (dd.children.length === 0) {
    dd.appendChild(el('p', { className: 'autor-dropdown__empty', textContent: 'Sin opciones' }));
  }
}

function _mkDropdownItem(text, color, onClick) {
  const btn = el('button', {
    className: 'autor-dropdown__item',
    textContent: text,
    attrs: { type: 'button', style: color ? `color:${color}` : '' },
  });
  btn.addEventListener('click', onClick);
  return btn;
}

function _mkDropdownDivider() {
  return el('div', { className: 'autor-dropdown__divider' });
}

// ── Cargar publicaciones del autor ────────────────────────────
async function _loadAutorFeed(userId, container) {
  container.appendChild(el('p', { className: 'feed-empty', textContent: 'Cargando publicaciones…' }));

  const { data, error } = await sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  while (container.firstChild) container.removeChild(container.firstChild);

  if (error || !data?.length) {
    container.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin publicaciones todavía.' }));
    return;
  }

  const ids = data.map(c => c.id);
  const [{ data: lk }, { data: cm }] = await Promise.all([
    sb.from('likes').select('confession_id').in('confession_id', ids),
    sb.from('comments').select('confession_id').in('confession_id', ids),
  ]);

  const likeMap    = _countMap(lk,  'confession_id');
  const commentMap = _countMap(cm,  'confession_id');

  let userLikedSet = new Set();
  if (_currentUser) {
    const { data: liked } = await sb.from('likes').select('confession_id')
      .eq('user_id', _currentUser.id).in('confession_id', ids);
    userLikedSet = new Set(liked?.map(r => r.confession_id) || []);
  }

  const profile = _targetProfile;

  data.forEach(c => {
    feedBuildCard(
      c, container, false, false,
      likeMap[c.id]    || 0,
      commentMap[c.id] || 0,
      userLikedSet.has(c.id),
      profile,
      null, null,
    );
  });
}

function _countMap(rows, key) {
  const m = {};
  rows?.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; });
  return m;
}

// ── Seguir / Dejar de seguir ──────────────────────────────────
async function _toggleFollow(targetId, btn, statsEl) {
  if (!_currentUser) return;
  const isFollowing = btn.classList.contains('autor-follow-btn--following');

  try {
    if (isFollowing) {
      await sb.from('follows').delete().match({ follower_id: _currentUser.id, following_id: targetId });
      btn.textContent = 'Seguir';
      btn.classList.remove('autor-follow-btn--following');
    } else {
      await sb.from('follows').insert({ follower_id: _currentUser.id, following_id: targetId });
      btn.textContent = 'Siguiendo';
      btn.classList.add('autor-follow-btn--following');
    }

    // Actualizar contador de seguidores en stats
    const followersStat = statsEl?.querySelector('.autor-stat__value');
    if (followersStat) {
      const n = parseInt(followersStat.textContent) || 0;
      followersStat.textContent = String(isFollowing ? Math.max(0, n - 1) : n + 1);
    }
  } catch (err) {
    showToast('Error al actualizar seguimiento.', 'error');
  }
}

// ── Reportar perfil ───────────────────────────────────────────
async function _reportProfile(userId) {
  if (!_currentUser) { showToast('Inicia sesión para reportar.', 'info'); return; }

  const reason = prompt('¿Por qué quieres reportar este perfil?\n(Escribe brevemente el motivo)');
  if (!reason?.trim()) return;

  try {
    await sb.from('reports').insert({
      reporter_id:   _currentUser.id,
      reported_type: 'profile',
      reported_id:   userId,
      reason:        reason.trim(),
    });
    showToast('Reporte enviado. El equipo lo revisará.', 'success');
  } catch {
    showToast('Error al enviar reporte.', 'error');
  }
}

// ── Suspender usuario ─────────────────────────────────────────
async function _suspendUser(userId, days) {
  if (!confirm(`¿Suspender a este usuario por ${days} día${days > 1 ? 's' : ''}?`)) return;
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const { error } = await sb.from('profiles').update({ suspended_until: until }).eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast(`Usuario suspendido por ${days} día${days > 1 ? 's' : ''}.`, 'success');
  // Recargar vista
  const overlay = document.getElementById('autor-overlay');
  if (overlay) await _loadAutorData(userId, overlay);
}

// ── Desuspender usuario ───────────────────────────────────────
async function _unsuspendUser(userId) {
  if (!confirm('¿Quitar la suspensión a este usuario?')) return;
  const { error } = await sb.from('profiles').update({ suspended_until: null }).eq('id', userId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Suspensión removida.', 'success');
  const overlay = document.getElementById('autor-overlay');
  if (overlay) await _loadAutorData(userId, overlay);
}

// ── Helper: abrir autor al tocar avatar de una card ───────────
// Llama esto desde feed.js y chat.js al construir avatares
export function bindAvatarToAutor(avatarEl, userId, fromView = 'feed') {
  if (!userId) return;
  avatarEl.style.cursor = 'pointer';
  avatarEl.setAttribute('role', 'button');
  avatarEl.setAttribute('tabindex', '0');
  avatarEl.setAttribute('aria-label', 'Ver perfil del autor');
  avatarEl.addEventListener('click', (e) => {
    e.stopPropagation();
    openAutor(userId, fromView);
  });
  avatarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAutor(userId, fromView); }
  });
}
