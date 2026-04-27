// js/hilos.js
// ============================================================
// Vista de Hilos Guardados
// ============================================================

import { sb } from './api.js';
import { getCurrentUser } from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons } from './icons.js';
import { tagColor } from './shared.js';
import { routerPush, routerBack } from './router.js';

let _user = null;
let _onBack = null;
let _openChat = null;

// ── Init ──────────────────────────────────────────────────────
export async function initHilos(user, onBack, openChatCallback) {
  _user = user;
  _onBack = onBack;
  _openChat = openChatCallback;

  document.getElementById('hilos-back-btn')?.addEventListener('click', routerBack);
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openHilos() {
  routerPush('hilos', _closeHilosUI);
  document.getElementById('view-feed')?.classList.remove('active');
  const view = document.getElementById('view-hilos');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  await loadSavedThreads();
}

// Cierra la UI sin tocar el historial (lo llama el router)
function _closeHilosUI() {
  const view = document.getElementById('view-hilos');
  view.classList.remove('active');
  setTimeout(() => { view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// Alias público para cerrar desde código externo (sin pushear historial)
export function closeHilos() {
  _closeHilosUI();
}

// ── Cargar hilos guardados ─────────────────────────────────────
async function loadSavedThreads() {
  const list = document.getElementById('hilos-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  list.appendChild(el('p', { className: 'feed-empty', textContent: 'Cargando…' }));

  const { data: saved, error } = await sb
    .from('saved_threads')
    .select('id, confession_id, created_at')
    .eq('user_id', _user.id)
    .order('created_at', { ascending: false });

  while (list.firstChild) list.removeChild(list.firstChild);

  if (error || !saved?.length) {
    list.appendChild(el('p', {
      className: 'feed-empty',
      textContent: error ? 'Error al cargar.' : 'No tienes hilos guardados aún.',
    }));
    return;
  }

  const confessionIds = saved.map(s => s.confession_id);

  const [{ data: confessions }, { data: cmCounts }] = await Promise.all([
    sb.from('confessions')
      .select('id, user_id, content, image_url, hashtag, created_at')
      .in('id', confessionIds),
    sb.from('comments')
      .select('confession_id')
      .in('confession_id', confessionIds),
  ]);

  const userIds = [...new Set((confessions || []).map(c => c.user_id))];
  const { data: profiles } = userIds.length
    ? await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const cmMap = {};
  cmCounts?.forEach(r => { cmMap[r.confession_id] = (cmMap[r.confession_id] || 0) + 1; });

  const confMap = Object.fromEntries((confessions || []).map(c => [c.id, c]));

  for (const save of saved) {
    const confession = confMap[save.confession_id];
    if (!confession) continue;
    const commentCount = cmMap[save.confession_id] || 0;
    const authorProfile = profileMap[confession.user_id] || null;
    list.appendChild(buildThreadRow(save, confession, commentCount, authorProfile));
  }
}

// ── Card de hilo guardado ─────────────────────────────────────
function buildThreadRow(save, confession, commentCount, authorProfile) {
  const card = el('article', { className: 'rc-card hilos-card' });

  const top = el('div', { className: 'rc-card__top' });

  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    avatarEl.appendChild(img);
  } else {
    avatarEl.appendChild(Icons.user(14));
  }
  top.appendChild(avatarEl);

  const tag = confession.hashtag || '#Confesión';
  const { bg, fg } = tagColor(tag);
  top.appendChild(el('span', {
    className: 'rc-card__tag',
    textContent: tag,
    attrs: { style: `background:${bg};color:${fg}` },
  }));

  top.appendChild(el('span', {
    className: 'rc-card__time',
    textContent: formatDate(confession.created_at),
  }));

  const removeBtn = el('button', {
    className: 'rc-card__del',
    attrs: { type: 'button', 'aria-label': 'Quitar de guardados' },
  });
  removeBtn.appendChild(Icons.trash(15));
  removeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    await removeSaved(save.id, card);
  });
  top.appendChild(removeBtn);
  card.appendChild(top);

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img = document.createElement('img');
    img.src = confession.image_url; img.alt = 'Imagen adjunta'; img.loading = 'lazy';
    img.addEventListener('click', e => { e.stopPropagation(); openImageModal(confession.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  const footer = el('div', { className: 'rc-card__footer' });
  const badge = el('button', { className: 'rc-card__action', attrs: { type: 'button' } });
  badge.appendChild(Icons.chat(17));
  badge.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  footer.appendChild(badge);
  card.appendChild(footer);

  card.addEventListener('click', () => {
    _closeHilosUI();
    _openChat?.(confession);
  });

  return card;
}

// ── Quitar guardado ────────────────────────────────────────────
async function removeSaved(saveId, cardEl) {
  const { error } = await sb.from('saved_threads').delete().eq('id', saveId);
  if (error) { showToast(error.message, 'error'); return; }
  cardEl.remove();
  const list = document.getElementById('hilos-list');
  if (!list.querySelector('.hilos-card')) {
    list.appendChild(el('p', { className: 'feed-empty', textContent: 'No tienes hilos guardados aún.' }));
  }
  showToast('Hilo eliminado de guardados.', 'success');
  updateHilosCount();
}

// ── Guardar / desguardar hilo (llamado desde chat.js) ─────────
export async function toggleSaveThread(confessionId, btn) {
  if (!_user) { showToast('Inicia sesión para guardar hilos.', 'info'); return; }

  const isSaved = btn.classList.contains('chat-save--saved');

  if (isSaved) {
    const { error } = await sb
      .from('saved_threads')
      .delete()
      .match({ user_id: _user.id, confession_id: confessionId });
    if (error) { showToast(error.message, 'error'); return; }
    btn.classList.remove('chat-save--saved');
    btn.setAttribute('aria-label', 'Guardar hilo');
    btn.title = 'Guardar hilo';
    showToast('Hilo eliminado de guardados.', 'success');
  } else {
    const { error } = await sb
      .from('saved_threads')
      .insert({ user_id: _user.id, confession_id: confessionId });
    if (error && !error.message.includes('duplicate')) {
      showToast(error.message, 'error');
      return;
    }
    btn.classList.add('chat-save--saved');
    btn.setAttribute('aria-label', 'Guardado');
    btn.title = 'Guardado — toca para quitar';
    showToast('Hilo guardado.', 'success');
  }
  updateHilosCount();
}

// ── Badge del header ───────────────────────────────────────────
export async function updateHilosCount() {
  if (!_user) return;
  const { count } = await sb
    .from('saved_threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', _user.id);

  const badge = document.getElementById('hilos-badge');
  if (badge) {
    badge.textContent = count > 0 ? String(count) : '';
    badge.hidden = (count === 0);
  }
}

// ── Image modal ───────────────────────────────────────────────
function openImageModal(url) {
  document.getElementById('img-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'img-modal'; overlay.className = 'img-modal';

  const img = document.createElement('img');
  img.src = url; img.className = 'img-modal__img'; img.alt = 'Imagen';

  const btn = document.createElement('button');
  btn.className = 'img-modal__close'; btn.type = 'button';
  btn.appendChild(Icons.close(20));

  const close = () => {
    overlay.remove();
  };

  btn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });

  overlay.appendChild(btn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}
