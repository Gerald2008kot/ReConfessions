// js/feed.js
// ============================================================
// Feed — cards compactas, thumbnail lateral, avatar, SVGs
// ============================================================

import { sb }                                  from './api.js';
import { getCurrentUser, getProfile }          from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader }                   from './upload.js';
import { initChat, openChat }                  from './chat.js';
import { Icons }                               from './icons.js';

let currentUser    = null;
let currentProfile = null;

let realtimeChannel  = null;
let pollingInterval  = null;
let lastConfessionId = null;
let activeView       = 'feed';

let feedEl, feedView, chatView,
    composeInput, composeHashtag, composeImgInput,
    composeImgPreview, composeProgressBar, composeSendBtn;

export const HASHTAGS = [
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

  document.getElementById('compose-bar')?.toggleAttribute('hidden', !currentUser);
  document.getElementById('login-prompt-bar')?.toggleAttribute('hidden', !!currentUser);

  populateHashtagSelector();

  if (composeImgInput) {
    const uploader = initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);
    window.__composeUploader = uploader; // accesible en initComposeForm
  }

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
    opt.value = opt.textContent = tag;
    composeHashtag.appendChild(opt);
  });
}

// ── Vista switch ─────────────────────────────────────────────
export function switchView(view) {
  activeView = view;
  feedView?.classList.toggle('active', view === 'feed');
  chatView?.classList.toggle('active', view === 'chat');
}

// ── Load confessions ─────────────────────────────────────────
export async function loadConfessions(containerEl, userId = null) {
  const target = containerEl || feedEl;
  let query = sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) { showToast('Error cargando confesiones.', 'error'); return; }

  while (target.firstChild) target.removeChild(target.firstChild);

  if (!data?.length) {
    target.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones todavía.' }));
    return;
  }

  // Likes del usuario actual
  let userLikedSet = new Set();
  if (currentUser) {
    const { data: liked } = await sb.from('likes').select('confession_id').eq('user_id', currentUser.id);
    userLikedSet = new Set(liked?.map(r => r.confession_id) || []);
  }

  const ids = data.map(c => c.id);
  const [{ data: lk }, { data: cm }] = await Promise.all([
    sb.from('likes').select('confession_id').in('confession_id', ids),
    sb.from('comments').select('confession_id').in('confession_id', ids),
  ]);

  const likeMap    = buildCountMap(lk, 'confession_id');
  const commentMap = buildCountMap(cm, 'confession_id');

  // Cargar avatares de los autores en batch
  const userIds   = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  data.forEach(c => buildCard(
    c, target, false, false,
    likeMap[c.id]    || 0,
    commentMap[c.id] || 0,
    userLikedSet.has(c.id),
    profileMap[c.user_id] || null
  ));

  if (!userId) lastConfessionId = data[0]?.id;
}

function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}

// ── Card compacta ─────────────────────────────────────────────
export function buildCard(confession, container, prependToTop, animate, likeCount, commentCount, isLiked, authorProfile) {
  if (container === feedEl && document.getElementById(`card-${confession.id}`)) return;

  const card = el('article', {
    className: `rc-card${animate ? ' rc-card--new' : ''}`,
    attrs:     { id: container === feedEl ? `card-${confession.id}` : undefined },
  });

  // ── Fila superior: avatar + hashtag + tiempo + borrar ────
  const top = el('div', { className: 'rc-card__top' });

  // Avatar del autor (anónimo para visitantes, real para el dueño)
  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url && currentUser?.id === confession.user_id) {
    // Solo el dueño ve su propio avatar
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url;
    img.alt = 'Avatar';
    avatarEl.appendChild(img);
  } else {
    avatarEl.appendChild(Icons.user(14));
  }
  top.appendChild(avatarEl);

  // Hashtag pill
  const tag      = confession.hashtag || '#Confesión';
  const tagColor = hashtagColor(tag);
  top.appendChild(el('span', {
    className: 'rc-card__tag',
    textContent: tag,
    attrs: { style: `background:${tagColor.bg};color:${tagColor.fg}` },
  }));

  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));

  if (canDelete(confession.user_id)) {
    const delBtn = el('button', {
      className: 'rc-card__del',
      attrs:     { type: 'button', 'aria-label': 'Borrar' },
    });
    delBtn.appendChild(Icons.trash(15));
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConfession(confession.id, card); });
    top.appendChild(delBtn);
  }

  card.appendChild(top);

  // ── Fila media: texto + thumbnail lateral ────────────────
  const body = el('div', { className: 'rc-card__body-row' });

  body.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img   = document.createElement('img');
    img.src     = confession.image_url;
    img.alt     = 'Imagen adjunta';
    img.loading = 'lazy';
    // Abrir modal al tocar la imagen
    img.addEventListener('click', (e) => { e.stopPropagation(); openImageModal(confession.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }

  card.appendChild(body);

  // ── Footer: likes + comentarios ──────────────────────────
  const footer = el('div', { className: 'rc-card__footer' });

  const likeBtn = el('button', {
    className: `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`,
    attrs:     { type: 'button', 'aria-label': 'Me gusta' },
  });
  likeBtn.appendChild(Icons.heart(isLiked, 17));
  likeBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(likeCount) }));
  likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(confession.id, likeBtn); });
  footer.appendChild(likeBtn);

  const commentBtn = el('button', {
    className: 'rc-card__action',
    attrs:     { type: 'button', 'aria-label': 'Comentarios' },
  });
  commentBtn.appendChild(Icons.chat(17));
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenChat(confession); });
  footer.appendChild(commentBtn);

  card.appendChild(footer);

  card.addEventListener('click', () => handleOpenChat(confession));

  container.querySelector('.feed-empty')?.remove();
  if (prependToTop) container.insertBefore(card, container.firstChild);
  else              container.appendChild(card);

  if (animate) {
    card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });
  }
}

// ── Image modal ───────────────────────────────────────────────
function openImageModal(url) {
  const existing = document.getElementById('img-modal');
  if (existing) existing.remove();

  const overlay = el('div', {
    className: 'img-modal',
    attrs:     { id: 'img-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Imagen completa' },
  });

  const img = document.createElement('img');
  img.src       = url;
  img.alt       = 'Imagen completa';
  img.className = 'img-modal__img';

  const closeBtn = el('button', {
    className: 'img-modal__close',
    attrs:     { type: 'button', 'aria-label': 'Cerrar' },
  });
  closeBtn.appendChild(Icons.close(20));

  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

  overlay.appendChild(closeBtn);
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}

// ── Open chat ─────────────────────────────────────────────────
async function handleOpenChat(confession) {
  switchView('chat');
  await openChat(confession);
}

// ── Likes ─────────────────────────────────────────────────────
async function toggleLike(confessionId, btn) {
  if (!currentUser) { showToast('Inicia sesión para dar like.', 'info'); return; }
  const isLiked   = btn.classList.contains('rc-card__action--liked');
  const countSpan = btn.querySelector('.rc-card__action-count');
  let count       = parseInt(countSpan.textContent) || 0;

  // Actualizar SVG del corazón
  const updateIcon = (filled) => {
    const oldSvg = btn.querySelector('svg');
    if (oldSvg) btn.replaceChild(Icons.heart(filled, 17), oldSvg);
  };

  if (isLiked) {
    btn.classList.remove('rc-card__action--liked');
    updateIcon(false);
    countSpan.textContent = String(count - 1);
    await sb.from('likes').delete().match({ confession_id: confessionId, user_id: currentUser.id });
  } else {
    btn.classList.add('rc-card__action--liked');
    updateIcon(true);
    countSpan.textContent = String(count + 1);
    btn.classList.add('rc-card__action--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__action--pop'), { once: true });
    await sb.from('likes').insert({ confession_id: confessionId, user_id: currentUser.id });
  }
}

// ── Delete ────────────────────────────────────────────────────
async function deleteConfession(id, cardEl) {
  if (!confirm('¿Borrar esta confesión? No se puede deshacer.')) return;
  const { error } = await sb.from('confessions').delete().eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  cardEl?.remove() ?? document.getElementById(`card-${id}`)?.remove();
  showToast('Confesión eliminada.', 'success');
}

export function canDelete(rowUserId) {
  if (!currentUser) return false;
  return currentUser.id === rowUserId || !!currentProfile?.is_admin;
}

// ── Compose form ──────────────────────────────────────────────
function initComposeForm() {
  if (!composeSendBtn || !currentUser) return;

  composeSendBtn.addEventListener('click', async () => {
    const content = composeInput?.value.trim();
    const hashtag = composeHashtag?.value || '#Confesión';
    if (!content) return;

    composeSendBtn.disabled = true;
    try {
      let imageUrl = null;
      const uploader = window.__composeUploader;
      if (uploader?.getFile()) imageUrl = await uploader.triggerUpload();

      const { error } = await sb.from('confessions').insert({
        user_id: currentUser.id, content, image_url: imageUrl, hashtag,
      });
      if (error) throw new Error(error.message);

      composeInput.value = '';
      uploader?.reset();
      showToast('¡Confesión publicada!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      composeSendBtn.disabled = false;
    }
  });

  composeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composeSendBtn.click(); }
  });
}

// ── Hashtag → color ───────────────────────────────────────────
export function hashtagColor(tag) {
  const map = {
    '#Desamor':        { bg: 'rgba(239,68,68,0.12)',   fg: '#f87171' },
    '#Traición':       { bg: 'rgba(249,115,22,0.12)',  fg: '#fb923c' },
    '#Ruptura':        { bg: 'rgba(236,72,153,0.12)',  fg: '#f472b6' },
    '#Secreto':        { bg: 'rgba(234,179,8,0.12)',   fg: '#facc15' },
    '#Familia':        { bg: 'rgba(34,197,94,0.12)',   fg: '#4ade80' },
    '#Trabajo':        { bg: 'rgba(59,130,246,0.12)',  fg: '#60a5fa' },
    '#Amistad':        { bg: 'rgba(20,184,166,0.12)',  fg: '#2dd4bf' },
    '#Vergüenza':      { bg: 'rgba(168,85,247,0.12)',  fg: '#c084fc' },
    '#Arrepentimiento':{ bg: 'rgba(239,68,68,0.10)',   fg: '#fca5a5' },
    '#Felicidad':      { bg: 'rgba(234,179,8,0.12)',   fg: '#fde68a' },
    '#Miedo':          { bg: 'rgba(99,102,241,0.12)',  fg: '#818cf8' },
    '#Sueño':          { bg: 'rgba(155,127,255,0.12)', fg: '#a78bfa' },
    '#Enojo':          { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444' },
    '#Nostalgia':      { bg: 'rgba(59,130,246,0.12)',  fg: '#93c5fd' },
  };
  return map[tag] || { bg: 'rgba(155,127,255,0.12)', fg: '#a78bfa' };
}

// ── Realtime ──────────────────────────────────────────────────
function startRealtime() {
  try {
    realtimeChannel = sb.channel('rc-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' },
        async ({ new: row }) => {
          // Obtener perfil del autor
          const { data: p } = await sb.from('profiles').select('id, avatar_url, full_name').eq('id', row.user_id).single();
          buildCard(row, feedEl, true, true, 0, 0, false, p);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => document.getElementById(`card-${row.id}`)?.remove())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')                              stopPolling();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling();
      });
  } catch (err) {
    console.warn('[realtime]', err);
    startPolling();
  }
}

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(async () => {
    if (!lastConfessionId) return;
    const { data: ref } = await sb.from('confessions').select('created_at').eq('id', lastConfessionId).single();
    if (!ref) return;
    const { data } = await sb.from('confessions')
      .select('id, user_id, content, image_url, hashtag, created_at')
      .gt('created_at', ref.created_at).order('created_at', { ascending: true });
    if (data?.length) {
      const ids = data.map(c => c.user_id);
      const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', ids);
      const pm = Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      data.forEach(c => buildCard(c, feedEl, true, true, 0, 0, false, pm[c.user_id]));
      lastConfessionId = data[data.length - 1].id;
    }
  }, 10_000);
}

function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }