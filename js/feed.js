// js/feed.js
// ============================================================
// Feed — nueva UI móvil con hashtags, likes, avatar, vistas
// ============================================================

import { sb }                                from './api.js';
import { getCurrentUser, getProfile }        from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader }                 from './upload.js';
import { initChat, openChat }                from './chat.js';

// ── State ──────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;

let realtimeChannel   = null;
let pollingInterval   = null;
let lastConfessionId  = null;

// Vista activa: 'feed' | 'chat'
let activeView = 'feed';

// DOM refs
let feedEl, feedView, chatView,
    composeInput, composeHashtag, composeImgInput,
    composeImgPreview, composeProgressBar, composeSendBtn;

// Hashtags disponibles
const HASHTAGS = [
  '#Confesión','#Desamor','#Traición','#Ruptura','#Secreto',
  '#Familia','#Trabajo','#Amistad','#Vergüenza','#Arrepentimiento',
  '#Felicidad','#Miedo','#Sueño','#Enojo','#Nostalgia',
];

// ── Init ────────────────────────────────────────────────────
export async function initFeed() {
  feedEl             = document.getElementById('feed');
  feedView           = document.getElementById('view-feed');
  chatView           = document.getElementById('view-chat');
  composeInput       = document.getElementById('compose-input');
  composeHashtag     = document.getElementById('compose-hashtag');
  composeImgInput    = document.getElementById('compose-img-input');
  composeImgPreview  = document.getElementById('compose-img-preview');
  composeProgressBar = document.getElementById('compose-progress');
  composeSendBtn     = document.getElementById('compose-send-btn');

  currentUser = await getCurrentUser();
  if (currentUser) currentProfile = await getProfile(currentUser.id);

  // Ocultar barra de compose si no hay sesión
  const composeBar = document.getElementById('compose-bar');
  if (composeBar) composeBar.hidden = !currentUser;

  // Mostrar prompt de login si no hay sesión
  const loginPromptBar = document.getElementById('login-prompt-bar');
  if (loginPromptBar) loginPromptBar.hidden = !!currentUser;

  // Poblar selector de hashtags
  populateHashtagSelector();

  // Inicializar uploader
  if (composeImgInput && composeImgPreview) {
    initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);
  }

  // Inicializar chat (vista de hilo)
  await initChat(() => switchView('feed'));

  await loadConfessions();
  initComposeForm();
  startRealtime();
}

// ── Hashtag selector ─────────────────────────────────────────
function populateHashtagSelector() {
  if (!composeHashtag) return;
  while (composeHashtag.firstChild) composeHashtag.removeChild(composeHashtag.firstChild);
  HASHTAGS.forEach(tag => {
    const opt = document.createElement('option');
    opt.value       = tag;
    opt.textContent = tag;
    composeHashtag.appendChild(opt);
  });
}

// ── Vista switch ─────────────────────────────────────────────
function switchView(view) {
  activeView = view;
  feedView?.classList.toggle('active', view === 'feed');
  chatView?.classList.toggle('active', view === 'chat');
}

// ── Load confessions ─────────────────────────────────────────
async function loadConfessions() {
  const { data, error } = await sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { showToast('Error cargando confesiones.', 'error'); return; }

  // Obtener conteos de likes y comentarios en paralelo
  while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild);

  if (!data?.length) {
    feedEl.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones todavía. ¡Sé el primero!' }));
    return;
  }

  // Cargar likes del usuario actual de una vez
  let userLikedSet = new Set();
  if (currentUser) {
    const { data: likedRows } = await sb
      .from('likes')
      .select('confession_id')
      .eq('user_id', currentUser.id);
    userLikedSet = new Set(likedRows?.map(r => r.confession_id) || []);
  }

  // Conteos de likes y comentarios por confesión
  const ids = data.map(c => c.id);
  const [{ data: likeCounts }, { data: commentCounts }] = await Promise.all([
    sb.from('likes').select('confession_id').in('confession_id', ids),
    sb.from('comments').select('confession_id').in('confession_id', ids),
  ]);

  const likeMap    = buildCountMap(likeCounts,    'confession_id');
  const commentMap = buildCountMap(commentCounts, 'confession_id');

  data.forEach(c => buildCard(c, false, false, likeMap[c.id] || 0, commentMap[c.id] || 0, userLikedSet.has(c.id)));
  lastConfessionId = data[0].id;
}

function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}

// ── Card ─────────────────────────────────────────────────────
function buildCard(confession, prependToTop, animate, likeCount, commentCount, isLiked) {
  if (document.getElementById(`card-${confession.id}`)) return;

  const card = el('article', {
    className: `rc-card${animate ? ' rc-card--new' : ''}`,
    attrs:     { id: `card-${confession.id}` },
  });

  // ── Cabecera ──────────────────────────────────────────────
  const cardHeader = el('div', { className: 'rc-card__header' });

  // Avatar anónimo
  const avatarEl = el('div', { className: 'rc-card__avatar' });
  avatarEl.appendChild(el('span', { textContent: '?' }));
  cardHeader.appendChild(avatarEl);

  const headerMeta = el('div', { className: 'rc-card__meta' });

  // Hashtag pill
  const tag = confession.hashtag || '#Confesión';
  const tagColor = hashtagColor(tag);
  const tagPill = el('span', {
    className:   'rc-card__tag',
    textContent: tag,
    attrs:       { style: `background:${tagColor.bg};color:${tagColor.fg}` },
  });
  headerMeta.appendChild(tagPill);

  headerMeta.appendChild(el('span', {
    className:   'rc-card__time',
    textContent: formatDate(confession.created_at),
  }));
  cardHeader.appendChild(headerMeta);

  // Botón borrar (dueño o admin)
  if (canDelete(confession.user_id)) {
    const delBtn = el('button', {
      className:   'rc-card__del',
      textContent: '🗑',
      attrs:       { type: 'button', 'aria-label': 'Borrar' },
    });
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConfession(confession.id); });
    cardHeader.appendChild(delBtn);
  }

  card.appendChild(cardHeader);

  // ── Contenido ─────────────────────────────────────────────
  card.appendChild(el('p', { className: 'rc-card__body', textContent: confession.content }));

  if (confession.image_url) {
    const imgWrap = el('div', { className: 'rc-card__img-wrap' });
    const img = document.createElement('img');
    img.className = 'rc-card__img';
    img.alt       = 'Imagen adjunta';
    img.loading   = 'lazy';
    img.src       = confession.image_url;
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);
  }

  // ── Footer: Likes + Comentarios ───────────────────────────
  const footer = el('div', { className: 'rc-card__footer' });

  // Like button
  const likeBtn = el('button', {
    className: `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`,
    attrs:     { type: 'button', 'data-id': confession.id, 'aria-label': 'Me gusta' },
  });
  const heartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  heartSvg.setAttribute('viewBox', '0 0 24 24');
  heartSvg.setAttribute('fill', isLiked ? '#ef4444' : 'none');
  heartSvg.setAttribute('stroke', isLiked ? '#ef4444' : 'currentColor');
  heartSvg.setAttribute('stroke-width', '1.5');
  const heartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  heartPath.setAttribute('stroke-linecap', 'round');
  heartPath.setAttribute('stroke-linejoin', 'round');
  heartPath.setAttribute('d', 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z');
  heartSvg.appendChild(heartPath);
  likeBtn.appendChild(heartSvg);
  likeBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(likeCount) }));

  likeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLike(confession.id, likeBtn);
  });
  footer.appendChild(likeBtn);

  // Comment count button
  const commentBtn = el('button', {
    className: 'rc-card__action',
    attrs:     { type: 'button', 'aria-label': 'Comentarios' },
  });
  const chatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chatSvg.setAttribute('viewBox', '0 0 24 24');
  chatSvg.setAttribute('fill', 'none');
  chatSvg.setAttribute('stroke', 'currentColor');
  chatSvg.setAttribute('stroke-width', '1.5');
  const chatPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chatPath.setAttribute('stroke-linecap', 'round');
  chatPath.setAttribute('stroke-linejoin', 'round');
  chatPath.setAttribute('d', 'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 11.96c0 1.696.586 3.276 1.583 4.545-.04.47-.234 1.258-.582 2.015a1.5 1.5 0 001.62 2.115c1.472-.25 2.78-.962 3.743-1.895A9.034 9.034 0 0012 20.25z');
  chatSvg.appendChild(chatPath);
  commentBtn.appendChild(chatSvg);
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));

  commentBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleOpenChat(confession);
  });
  footer.appendChild(commentBtn);

  card.appendChild(footer);

  // Click en la card completa también abre el hilo
  card.addEventListener('click', () => handleOpenChat(confession));

  feedEl.querySelector('.feed-empty')?.remove();

  if (prependToTop) feedEl.insertBefore(card, feedEl.firstChild);
  else              feedEl.appendChild(card);

  if (animate) {
    card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });
  }
}

// ── Abrir chat ────────────────────────────────────────────────
async function handleOpenChat(confession) {
  switchView('chat');
  await openChat(confession);
}

// ── Likes ─────────────────────────────────────────────────────
async function toggleLike(confessionId, btn) {
  if (!currentUser) { showToast('Inicia sesión para dar like.', 'info'); return; }

  const isLiked   = btn.classList.contains('rc-card__action--liked');
  const countSpan = btn.querySelector('.rc-card__action-count');
  const svg       = btn.querySelector('svg');
  let count       = parseInt(countSpan.textContent) || 0;

  // Optimistic UI
  if (isLiked) {
    btn.classList.remove('rc-card__action--liked');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    countSpan.textContent = String(count - 1);
    await sb.from('likes').delete().match({ confession_id: confessionId, user_id: currentUser.id });
  } else {
    btn.classList.add('rc-card__action--liked');
    svg.setAttribute('fill', '#ef4444');
    svg.setAttribute('stroke', '#ef4444');
    countSpan.textContent = String(count + 1);
    btn.classList.add('rc-card__action--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__action--pop'), { once: true });
    await sb.from('likes').insert({ confession_id: confessionId, user_id: currentUser.id });
  }
}

// ── Delete confession ─────────────────────────────────────────
async function deleteConfession(id) {
  if (!confirm('¿Borrar esta confesión? Esta acción no se puede deshacer.')) return;
  const { error } = await sb.from('confessions').delete().eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  document.getElementById(`card-${id}`)?.remove();
  showToast('Confesión eliminada.', 'success');
  if (!feedEl.querySelector('.rc-card')) {
    feedEl.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones todavía. ¡Sé el primero!' }));
  }
}

function canDelete(rowUserId) {
  if (!currentUser) return false;
  return currentUser.id === rowUserId || currentProfile?.is_admin;
}

// ── Compose form ──────────────────────────────────────────────
function initComposeForm() {
  if (!composeSendBtn || !currentUser) return;

  const uploader = initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);

  composeSendBtn.addEventListener('click', async () => {
    const content  = composeInput?.value.trim();
    const hashtag  = composeHashtag?.value || '#Confesión';
    if (!content) return;

    composeSendBtn.disabled = true;

    try {
      let imageUrl = null;
      if (uploader.getFile()) imageUrl = await uploader.triggerUpload();

      const { error } = await sb.from('confessions').insert({
        user_id: currentUser.id, content, image_url: imageUrl, hashtag,
      });
      if (error) throw new Error(error.message);

      composeInput.value = '';
      uploader.reset();
      if (composeImgPreview) composeImgPreview.hidden = true;
      showToast('¡Confesión publicada!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      composeSendBtn.disabled = false;
    }
  });

  // Enter en el input envía
  composeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composeSendBtn.click(); }
  });
}

// ── Hashtag color mapping ─────────────────────────────────────
function hashtagColor(tag) {
  const map = {
    '#Desamor':       { bg: 'rgba(239,68,68,0.12)',   fg: '#f87171' },
    '#Traición':      { bg: 'rgba(249,115,22,0.12)',  fg: '#fb923c' },
    '#Ruptura':       { bg: 'rgba(236,72,153,0.12)',  fg: '#f472b6' },
    '#Secreto':       { bg: 'rgba(234,179,8,0.12)',   fg: '#facc15' },
    '#Familia':       { bg: 'rgba(34,197,94,0.12)',   fg: '#4ade80' },
    '#Trabajo':       { bg: 'rgba(59,130,246,0.12)',  fg: '#60a5fa' },
    '#Amistad':       { bg: 'rgba(20,184,166,0.12)',  fg: '#2dd4bf' },
    '#Vergüenza':     { bg: 'rgba(168,85,247,0.12)',  fg: '#c084fc' },
    '#Arrepentimiento':{ bg:'rgba(239,68,68,0.10)',   fg: '#fca5a5' },
    '#Felicidad':     { bg: 'rgba(234,179,8,0.12)',   fg: '#fde68a' },
    '#Miedo':         { bg: 'rgba(99,102,241,0.12)',  fg: '#818cf8' },
    '#Sueño':         { bg: 'rgba(139,92,246,0.12)',  fg: '#a78bfa' },
    '#Enojo':         { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444' },
    '#Nostalgia':     { bg: 'rgba(59,130,246,0.12)',  fg: '#93c5fd' },
  };
  return map[tag] || { bg: 'rgba(139,92,246,0.12)', fg: '#a78bfa' };
}

// ── Realtime ──────────────────────────────────────────────────
function startRealtime() {
  try {
    realtimeChannel = sb.channel('rc-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' },
        ({ new: row }) => {
          buildCard(row, true, true, 0, 0, false);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => document.getElementById(`card-${row.id}`)?.remove())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') stopPolling();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling();
      });
  } catch (err) {
    console.warn('[realtime]', err);
    startPolling();
  }
}

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(pollNewConfessions, 10_000);
}
function stopPolling() {
  clearInterval(pollingInterval);
  pollingInterval = null;
}

async function pollNewConfessions() {
  if (!lastConfessionId) return;
  const { data: ref } = await sb.from('confessions').select('created_at').eq('id', lastConfessionId).single();
  if (!ref) return;
  const { data } = await sb.from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at')
    .gt('created_at', ref.created_at)
    .order('created_at', { ascending: true });
  if (data?.length) {
    data.forEach(c => buildCard(c, true, true, 0, 0, false));
    lastConfessionId = data[data.length - 1].id;
  }
}
