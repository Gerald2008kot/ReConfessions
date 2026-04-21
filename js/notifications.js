// js/notifications.js
// ============================================================
// Fusión de notifications.js (lógica) + notificaciones.js (vista)
// Maneja: badge del header, suscripción realtime, vista de lista,
// y alerta automática cuando expira una suspensión.
// ============================================================

import { sb }                  from './api.js';
import { getCurrentUser }      from './auth.js';
import { el, formatDate, showToast } from './utils.js';
import { Icons }               from './icons.js';
import { routerPush, routerBack } from './router.js';

// ── Estado ────────────────────────────────────────────────────
let _channel      = null;
let _badgeEl      = null;
let _unreadCount  = 0;
let _onBack       = null;
let _mounted      = false;
let _suspCheckInt = null; // intervalo para detectar fin de suspensión

// ════════════════════════════════════════════════════════════
// SECCIÓN 1 — Lógica de realtime y badge
// ════════════════════════════════════════════════════════════

/**
 * Inicia la suscripción realtime de notificaciones.
 * @param {HTMLElement|null} badgeEl
 * @param {(n: object) => void} [onNew]
 */
export async function initNotifications(badgeEl, onNew) {
  _badgeEl = badgeEl;
  const user = await getCurrentUser();
  if (!user) return;

  // Conteo inicial de no leídas
  const { count } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);
  _unreadCount = count ?? 0;
  _updateBadge();

  stopNotifications();
  _channel = sb.channel(`notifs-${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, ({ new: row }) => {
      _unreadCount++;
      _updateBadge();
      onNew?.(row);
      // Mostrar toast para notificaciones de suspensión / desuspensión
      if (row.type === 'suspension' || row.type === 'unsuspension') {
        showToast(row.message, row.type === 'unsuspension' ? 'success' : 'error');
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, ({ new: row }) => {
      if (row.read && _unreadCount > 0) { _unreadCount--; _updateBadge(); }
    })
    .subscribe();

  // Vigilar expiración de suspensión
  _startSuspensionWatch(user.id);
}

export function stopNotifications() {
  if (_channel) { sb.removeChannel(_channel); _channel = null; }
  _stopSuspensionWatch();
}

export async function markAllRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await sb.from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
  _unreadCount = 0;
  _updateBadge();
}

export async function fetchNotifications(limit = 30) {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await sb
    .from('notifications')
    .select('id, type, message, confession_id, read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

function _updateBadge() {
  if (!_badgeEl) return;
  _badgeEl.textContent = _unreadCount > 99 ? '99+' : String(_unreadCount);
  _badgeEl.hidden = _unreadCount === 0;
}

// ── Vigilar expiración de suspensión ─────────────────────────
function _startSuspensionWatch(userId) {
  _stopSuspensionWatch();
  _suspCheckInt = setInterval(async () => {
    const { data } = await sb
      .from('profiles')
      .select('suspended_until')
      .eq('id', userId)
      .single();
    if (!data?.suspended_until) return;
    const until = new Date(data.suspended_until);
    if (until <= new Date()) {
      _stopSuspensionWatch();
      // La función de BD enviará la notificación automáticamente,
      // pero lanzamos también un toast local inmediato.
      showToast('Tu cuenta ya está activa. ¡La suspensión ha expirado!', 'success');
      // Refrescar chip de sesión si está disponible
      window.__refreshChip?.();
    }
  }, 60_000); // Comprobar cada minuto
}

function _stopSuspensionWatch() {
  if (_suspCheckInt) { clearInterval(_suspCheckInt); _suspCheckInt = null; }
}

// ════════════════════════════════════════════════════════════
// SECCIÓN 2 — Vista de Notificaciones
// ════════════════════════════════════════════════════════════

function mountNotificacionesHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id        = 'view-notificaciones';
  view.className = 'view';
  view.hidden    = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="notif-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <h2 class="app-header__title">Notificaciones</h2>
    <button id="notif-mark-read-btn" type="button" class="app-header__icon-btn" aria-label="Marcar todo como leído" title="Marcar todo leído">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    </button>
  </header>
  <div id="notif-list" style="overflow-y:auto;flex:1;padding-bottom:24px">
    <p class="feed-empty">Cargando…</p>
  </div>`;
  document.getElementById('app-root').appendChild(view);
}

export function initNotificaciones(onBack) {
  _onBack = onBack;
  mountNotificacionesHTML();
  document.getElementById('notif-back-btn')?.addEventListener('click', routerBack);
  document.getElementById('notif-mark-read-btn')?.addEventListener('click', async () => {
    await markAllRead();
    document.querySelectorAll('.notif-item--unread').forEach(el => el.classList.remove('notif-item--unread'));
    showToast('Todo marcado como leído.', 'success');
  });
}

export async function openNotificaciones() {
  const view = document.getElementById('view-notificaciones');
  if (!view) return;
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  routerPush('notificaciones', _closeNotifUI);
  await _loadNotificaciones();
}

export function closeNotificaciones() { routerBack(); }

function _closeNotifUI() {
  const view = document.getElementById('view-notificaciones');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

async function _loadNotificaciones() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = '<p class="feed-empty">Cargando…</p>';
  const items = await fetchNotifications(40);
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="feed-empty">Sin notificaciones.</p>';
    return;
  }
  items.forEach(n => list.appendChild(_buildNotifItem(n)));
}

function _buildNotifItem(n) {
  const item = el('div', {
    className: `notif-item${n.read ? '' : ' notif-item--unread'}`,
    attrs: { 'data-id': n.id },
  });

  const icon = el('div', { className: 'notif-item__icon' });

  // Icono según tipo
  if (n.type === 'like') {
    icon.appendChild(Icons.heart(true, 16));
  } else if (n.type === 'suspension') {
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f55" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
    </svg>`;
  } else if (n.type === 'unsuspension') {
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4c8" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`;
  } else {
    icon.appendChild(Icons.chat(16));
  }
  item.appendChild(icon);

  const body = el('div', { className: 'notif-item__body' });
  body.appendChild(el('p', { className: 'notif-item__msg', textContent: n.message }));
  body.appendChild(el('span', { className: 'notif-item__time', textContent: formatDate(n.created_at) }));
  item.appendChild(body);

  if (!n.read) {
    item.appendChild(el('span', { className: 'notif-item__dot', attrs: { 'aria-hidden': 'true' } }));
  }
  return item;
}
