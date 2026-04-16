// js/hilos.js
import { sb }                         from './api.js';
import { el, formatDate, showToast }  from './utils.js';
import { Icons }                      from './icons.js';
import { tagColor }                   from './shared.js';
import { activeView }                 from './feed.js';

let _user     = null;
let _onBack   = null;
let _openChat = null;

// ── Init ──────────────────────────────────────────────────────
export async function initHilos(user, onBack, openChatCallback) {
  _user     = user;
  _onBack   = onBack;
  _openChat = openChatCallback;
  document.getElementById('hilos-back-btn')?.addEventListener('click', () => closeHilos(true));
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openHilos() {
  // Marcar vista activa globalmente — feed.js exporta activeView pero es let,
  // lo actualizamos a través de switchView para consistencia
  const { switchView } = await import('./feed.js');
  switchView('hilos');

  document.getElementById('view-feed')?.classList.remove('active');
  const view = document.getElementById('view-hilos');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  await loadSavedThreads();
}

// pushHistory=true cuando el usuario presiona el botón de la UI
// pushHistory=false cuando viene del popstate (ya retrocedió)
export function closeHilos(pushHistory = false) {
  const view = document.getElementById('view-hilos');
  view.classList.remove('active');
  setTimeout(() => { view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');

  // Actualizar activeView
  import('./feed.js').then(({ switchView }) => switchView('feed', false));

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
      className:   'feed-empty',
      textContent: error ? 'Error al cargar.' : 'No tienes hilos guardados aún.',
    }));
    return;
  }

  const confessionIds = saved.map(s => s.confession_id);

  const [{ data: confessions }, { data: cmCounts }, { data: authorProfiles }] = await Promise.all([
    sb.from('confessions')
      .select('id, user_id, content, image_url, hashtag, created_at')
      .in('id', confessionIds),
    sb.from('comments')
      .select('confession_id')
      .in('confession_id', confessionIds),
    sb.from('profiles').select('id, avatar_url'),
  ]);

  const cmMap      = {};
  cmCounts?.forEach(r => { cmMap[r.confession_id] = (cmMap[r.confession_id] || 0) + 1; });
  const confMap    = Object.fromEntries((confessions || []).map(c => [c.id, c]));
  const profileMap = Object.fromEntries((authorProfiles || []).map(p => [p.id, p]));

  for (const save of saved) {
    const confession = confMap[save.confession_id];
    if (!confession) continue;
    const commentCount  = cmMap[save.confession_id] || 0;
    const authorProfile = profileMap[confession.user_id] || null;
    list.appendChild(buildThreadCard(save, confession, commentCount, authorProfile));
  }
}

// ── Tarjeta de hilo guardado (estilo rc-card rico) ─────────────
function buildThreadCard(save, confession, commentCount, authorProfile) {
  const card = el('article', { className: 'hilos-card' });

  // ── Header: avatar + hashtag + tiempo + quitar ──────────────
  const header = el('div', { className: 'hilos-card__header' });

  // Avatar anónimo del autor
  const av = el('div', { className: 'hilos-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else {
    av.appendChild(Icons.user(13));
  }
  header.appendChild(av);

  // Hashtag pill
  const { bg, fg } = tagColor(confession.hashtag || '#Confesión');
  const pill = el('span', {
    className:   'rc-card__tag',
    textContent: confession.hashtag || '#Confesión',
    attrs:       { style: `background:${bg};color:${fg}` },
  });
  header.appendChild(pill);

  header.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));

  // Botón quitar
  const removeBtn = el('button', {
    className: 'hilos-card__remove',
    attrs:     { type: 'button', 'aria-label': 'Quitar de guardados' },
  });
  removeBtn.appendChild(Icons.trash(14));
  removeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    await removeSaved(save.id, card);
  });
  header.appendChild(removeBtn);
  card.appendChild(header);

  // ── Body: texto + thumbnail si hay imagen ───────────────────
  const body = el('div', { className: 'hilos-card__body' });

  const text = el('p', {
    className:   'hilos-card__text',
    textContent: confession.content,
  });
  body.appendChild(text);

  if (confession.image_url) {
    const thumb = el('div', { className: 'hilos-card__thumb' });
    const img   = document.createElement('img');
    img.src     = confession.image_url;
    img.alt     = 'Imagen adjunta';
    img.loading = 'lazy';
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  // ── Footer: badge de comentarios ────────────────────────────
  const footer = el('div', { className: 'hilos-card__footer' });

  const badge = el('div', { className: 'hilos-card__badge' });
  badge.appendChild(Icons.chat(14));
  badge.appendChild(el('span', { textContent: `${commentCount} respuesta${commentCount !== 1 ? 's' : ''}` }));
  footer.appendChild(badge);

  card.appendChild(footer);

  // Click abre el hilo
  card.addEventListener('click', () => {
    closeHilos(false);
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

// ── Toggle guardar (llamado desde chat.js) ─────────────────────
export async function toggleSaveThread(confessionId, btn) {
  if (!_user) { showToast('Inicia sesión para guardar hilos.', 'info'); return; }
  const isSaved = btn.classList.contains('chat-save--saved');
  if (isSaved) {
    const { error } = await sb.from('saved_threads').delete()
      .match({ user_id: _user.id, confession_id: confessionId });
    if (error) { showToast(error.message, 'error'); return; }
    btn.classList.remove('chat-save--saved');
    btn.title = 'Guardar hilo';
    showToast('Hilo eliminado de guardados.', 'success');
  } else {
    const { error } = await sb.from('saved_threads').insert({ user_id: _user.id, confession_id: confessionId });
    if (error && !error.message.includes('duplicate')) { showToast(error.message, 'error'); return; }
    btn.classList.add('chat-save--saved');
    btn.title = 'Guardado — toca para quitar';
    showToast('Hilo guardado.', 'success');
  }
  // Actualizar SVG del botón
  const oldSvg = btn.querySelector('svg');
  const isSavedNow = btn.classList.contains('chat-save--saved');
  if (oldSvg) {
    const newSvg = buildBookmarkSvg(isSavedNow);
    btn.replaceChild(newSvg, oldSvg);
  }
  updateHilosCount();
}

function buildBookmarkSvg(filled) {
  const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('d', 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z');
  svg.appendChild(p);
  return svg;
}

// ── Badge header — sin número (solo ícono cuando hay guardados) ─
export async function updateHilosCount() {
  if (!_user) return;
  const { count } = await sb
    .from('saved_threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', _user.id);

  const badge = document.getElementById('hilos-badge');
  if (badge) {
    // Sin número — solo visible si hay al menos un hilo guardado
    badge.textContent = '';
    badge.hidden = (count === 0);
  }
}
