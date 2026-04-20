// js/notificaciones.js — Vista Notificaciones (inyecta HTML bajo demanda)

import { el, formatDate, showToast } from './utils.js';
import { Icons } from './icons.js';
import { fetchNotifications, markAllRead } from './notifications.js';
import { routerPush, routerBack } from './router.js';

let _onBack  = null;
let _mounted = false;

function mountNotificacionesHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id = 'view-notificaciones';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="notif-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
    <h2 class="app-header__title">Notificaciones</h2>
    <button id="notif-mark-read-btn" type="button" style="padding:8px 10px;font-size:0.75rem">Marcar todo leído</button>
  </header>
  <div id="notif-list" style="overflow-y:auto;flex:1;">
    <p class="feed-empty">Cargando…</p>
  </div>`;
  document.getElementById('app-root').appendChild(view);
}

export function initNotificaciones(onBack) {
  _onBack = onBack;
  mountNotificacionesHTML();
  // El botón atrás usa routerBack (que dispara popstate → _closeUI vía routerPush)
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
  // Registrar en el router: al hacer back, _closeUI restaura el feed
  routerPush('notificaciones', _closeUI);
  await loadNotificaciones();
}

export function closeNotificaciones() { routerBack(); }

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
    item.appendChild(el('span', { className: 'notif-item__dot', attrs: { 'aria-hidden': 'true' } }));
  }
  return item;
}
