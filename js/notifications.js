// js/notifications.js
// Suscripción realtime a tabla `notifications`, badge en header

import { sb } from './api.js';
import { getCurrentUser } from './auth.js';

let _channel = null;
let _badgeEl = null;
let _unreadCount = 0;

/**
 * Inicia la suscripción realtime de notificaciones del usuario actual.
 * @param {HTMLElement|null} badgeEl  — elemento que muestra el badge de conteo
 * @param {(n: object) => void} [onNew]  — callback opcional por cada notificación nueva
 */
export async function initNotifications(badgeEl, onNew) {
  _badgeEl = badgeEl;
  const user = await getCurrentUser();
  if (!user) return;

  // Cargar no leídas iniciales
  const { count } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);
  _unreadCount = count ?? 0;
  _updateBadge();

  // Suscripción realtime
  stopNotifications();
  _channel = sb.channel(`notifs-${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, ({ new: row }) => {
      _unreadCount++;
      _updateBadge();
      onNew?.(row);
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, ({ new: row }) => {
      // Si se marcó como leída externamente
      if (row.read && _unreadCount > 0) { _unreadCount--; _updateBadge(); }
    })
    .subscribe();
}

/** Detiene el canal y limpia. */
export function stopNotifications() {
  if (_channel) { sb.removeChannel(_channel); _channel = null; }
}

/** Marca todas las notificaciones del usuario como leídas. */
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

/**
 * Obtiene las últimas notificaciones del usuario.
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
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
