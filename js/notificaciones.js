// js/notificaciones.js
// Vista Notificaciones — respuestas a confesiones, menciones

import { el, formatDate, showToast } from './utils.js';
import { Icons } from './icons.js';
import { fetchNotifications, markAllRead } from './notifications.js';
import { routerPush } from './router.js';

let _onBack = null;

export function initNotificaciones(onBack) {
  _onBack = onBack;
  document.getElementById('notif-back-btn')?.addEventListener('click', closeNotificaciones);
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
  routerPush('notificaciones', _closeUI);

  await loadNotificaciones();
}

export function closeNotificaciones() { _closeUI(); }

function _closeUI() {
  const view = document.getElementById('view-notificaciones');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

async function loadNotificaciones() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  while (list.firstChild) list.removeChild(list.firstChild);
  list.appendChild(el('p', { className: 'feed-empty', textContent: 'Cargando…' }));

  const items = await fetchNotifications(40);

  while (list.firstChild) list.removeChild(list.firstChild);

  if (!items.length) {
    list.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin notificaciones.' }));
    return;
  }

  items.forEach(n => list.appendChild(buildNotifItem(n)));
}

function buildNotifItem(n) {
  const item = el('div', {
    className: `notif-item${n.read ? '' : ' notif-item--unread'}`,
    attrs: { 'data-id': n.id },
  });

  const icon = el('div', { className: 'notif-item__icon' });
  icon.appendChild(n.type === 'like' ? Icons.heart(true, 16) : Icons.chat(16));
  item.appendChild(icon);

  const body = el('div', { className: 'notif-item__body' });
  body.appendChild(el('p', { className: 'notif-item__msg', textContent: n.message }));
  body.appendChild(el('span', { className: 'notif-item__time', textContent: formatDate(n.created_at) }));
  item.appendChild(body);

  if (!n.read) {
    const dot = el('span', { className: 'notif-item__dot', attrs: { 'aria-hidden': 'true' } });
    item.appendChild(dot);
  }

  return item;
}
