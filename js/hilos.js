// js/hilos.js
// ============================================================
// Vista de Hilos Guardados
// ============================================================

import { sb } from './api.js';
import { getCurrentUser } from './auth.js';
import { el, formatDate, showToast } from './utils.js';
import { Icons } from './icons.js';
import { tagColor } from './shared.js';

let _user = null;
let _onBack = null;
let _openChat = null; // callback para abrir el chat de una confesión

// ── Init ──────────────────────────────────────────────────────
export async function initHilos(user, onBack, openChatCallback) {
  _user = user;
  _onBack = onBack;
  _openChat = openChatCallback;
  
  document.getElementById('hilos-back-btn')?.addEventListener('click', closeHilos);
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openHilos() {
  history.pushState({ view: 'hilos' }, '');
  document.getElementById('view-feed')?.classList.remove('active');
  const view = document.getElementById('view-hilos');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  await loadSavedThreads();
}

export function closeHilos() {
  const view = document.getElementById('view-hilos');
  view.classList.remove('active');
  setTimeout(() => { view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
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
  
  // Cargar confesiones + conteo de comentarios nuevos en paralelo
  const [{ data: confessions }, { data: cmCounts }] = await Promise.all([
    sb.from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at')
    .in('id', confessionIds),
    sb.from('comments')
    .select('confession_id')
    .in('confession_id', confessionIds),
  ]);
  
  const cmMap = {};
  cmCounts?.forEach(r => { cmMap[r.confession_id] = (cmMap[r.confession_id] || 0) + 1; });
  
  const confMap = Object.fromEntries((confessions || []).map(c => [c.id, c]));
  
  for (const save of saved) {
    const confession = confMap[save.confession_id];
    if (!confession) continue; // confesión borrada
    const commentCount = cmMap[save.confession_id] || 0;
    list.appendChild(buildThreadRow(save, confession, commentCount));
  }
}

// ── Fila de hilo guardado ──────────────────────────────────────
function buildThreadRow(save, confession, commentCount) {
  const row = el('div', { className: 'hilos-row' });
  
  // Hashtag pill
  const { bg, fg } = tagColor(confession.hashtag || '#Confesión');
  const pill = el('span', {
    className: 'rc-card__tag hilos-row__tag',
    textContent: confession.hashtag || '#Confesión',
    attrs: { style: `background:${bg};color:${fg}` },
  });
  row.appendChild(pill);
  
  // Texto de la confesión
  const text = el('p', {
    className: 'hilos-row__text',
    textContent: confession.content,
  });
  row.appendChild(text);
  
  // Footer: fecha + badge comentarios + quitar
  const footer = el('div', { className: 'hilos-row__footer' });
  
  footer.appendChild(el('span', {
    className: 'hilos-row__time',
    textContent: formatDate(confession.created_at),
  }));
  
  // Badge de comentarios
  const badge = el('div', { className: 'hilos-row__badge' });
  badge.appendChild(Icons.chat(14));
  badge.appendChild(el('span', { textContent: String(commentCount) }));
  footer.appendChild(badge);
  
  // Botón quitar de guardados
  const removeBtn = el('button', {
    className: 'hilos-row__remove',
    attrs: { type: 'button', 'aria-label': 'Quitar de guardados' },
  });
  removeBtn.appendChild(Icons.trash(14));
  removeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    await removeSaved(save.id, row);
  });
  footer.appendChild(removeBtn);
  row.appendChild(footer);
  
  // Click abre el hilo
  row.addEventListener('click', () => {
    closeHilos();
    _openChat?.(confession);
  });
  
  return row;
}

// ── Quitar guardado ────────────────────────────────────────────
async function removeSaved(saveId, rowEl) {
  const { error } = await sb.from('saved_threads').delete().eq('id', saveId);
  if (error) { showToast(error.message, 'error'); return; }
  rowEl.remove();
  const list = document.getElementById('hilos-list');
  if (!list.querySelector('.hilos-row')) {
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
    // Quitar de guardados
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
    // Guardar
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

// ── Actualizar badge de notificaciones en el header ───────────
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