// js/feed.js
import { sb }                                  from './api.js';
import { getCurrentUser, getProfile }          from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader }                   from './upload.js';
import { initChat, openChat }                  from './chat.js';
import { Icons }                               from './icons.js';
import { tagColor, countMap as sharedCountMap } from './shared.js';

// Alias para compatibilidad con chat.js
export { tagColor };
export const hashtagColor = tagColor;

let currentUser    = null;
let currentProfile = null;

let realtimeChannel  = null;
let pollingInterval  = null;
let lastConfessionId = null;

// Vista activa global — consultada por el popstate centralizado
export let activeView = 'feed';

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
    window.__composeUploader = initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);
  }

  await initChat(() => switchView('feed', false));
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

// ── Vista switch — CENTRALIZADO ───────────────────────────────
// Todas las vistas pasan por aquí para que el popstate funcione.
export function switchView(view, pushHistory = true) {
  activeView = view;

  // Feed siempre activo cuando view === 'feed'
  feedView?.classList.toggle('active', view === 'feed');
  chatView?.classList.toggle('active', view === 'chat');

  // Las vistas hilos/perfil/admin gestionan su propio DOM hidden/active
  // switchView solo actualiza activeView y el historial

  if (pushHistory) {
    history.pushState({ view }, '');
  }
}

// ── popstate CENTRALIZADO ─────────────────────────────────────
// Se registra una sola vez aquí. Maneja TODAS las vistas.
window.addEventListener('popstate', () => {
  // Cerrar sheet si está abierto (tiene prioridad)
  if (document.getElementById('profile-sheet')?.classList.contains('open')) {
    window.__closeProfileSheet?.();
    return;
  }

  switch (activeView) {
    case 'chat':
      import('./chat.js').then(({ closeChat }) => closeChat());
      break;
    case 'hilos':
      import('./hilos.js').then(({ closeHilos }) => closeHilos(false));
      break;
    case 'perfil':
      import('./perfil.js').then(({ closePerfil }) => closePerfil(false));
      break;
    case 'admin':
      document.getElementById('admin-back-btn')?.click();
      break;
    default:
      // Ya en el feed — no hacer nada, evitar salir de la app
      history.pushState({ view: 'feed' }, '');
      break;
  }
});

// ── Asegurar que siempre haya una entrada base en el historial ─
// Así el primer "atrás" no sale de la app
history.replaceState({ view: 'feed' }, '');

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

  const likeMap    = sharedCountMap(lk, 'confession_id');
  const commentMap = sharedCountMap(cm, 'confession_id');

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  data.forEach(c => buildCard(
    c, target, false, false,
    likeMap[c.id] || 0, commentMap[c.id] || 0,
    userLikedSet.has(c.id), profileMap[c.user_id] || null
  ));

  if (!userId) lastConfessionId = data[0]?.id;
}

function buildCountMap(rows, key) {
  const m = {};
  rows?.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; });
  return m;
}

// ── Card ─────────────────────────────────────────────────────
export function buildCard(confession, container, prependToTop, animate, likeCount, commentCount, isLiked, authorProfile) {
  if (container === feedEl && document.getElementById(`card-${confession.id}`)) return;

  const card = el('article', {
    className: `rc-card${animate ? ' rc-card--new' : ''}`,
    attrs:     { id: container === feedEl ? `card-${confession.id}` : undefined },
  });

  const top = el('div', { className: 'rc-card__top' });

  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url; img.alt = 'Avatar anónimo'; img.loading = 'lazy';
    avatarEl.appendChild(img);
  } else {
    avatarEl.appendChild(Icons.user(14));
  }
  top.appendChild(avatarEl);

  const tag = confession.hashtag || '#Confesión';
  const tc  = tagColor(tag);
  top.appendChild(el('span', {
    className: 'rc-card__tag',
    textContent: tag,
    attrs: { style: `background:${tc.bg};color:${tc.fg}` },
  }));

  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));

  if (canDelete(confession.user_id)) {
    const delBtn = el('button', { className: 'rc-card__del', attrs: { type: 'button', 'aria-label': 'Borrar' } });
    delBtn.appendChild(Icons.trash(15));
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConfession(confession.id, card); });
    top.appendChild(delBtn);
  }
  card.appendChild(top);

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img = document.createElement('img');
    img.src = confession.image_url; img.alt = 'Imagen adjunta'; img.loading = 'lazy';
    img.addEventListener('click', (e) => { e.stopPropagation(); openImageModal(confession.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  const footer = el('div', { className: 'rc-card__footer' });

  const likeBtn = el('button', {
    className: `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`,
    attrs: { type: 'button', 'aria-label': 'Me gusta' },
  });
  likeBtn.appendChild(Icons.heart(isLiked, 17));
  likeBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(likeCount) }));
  likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(confession.id, likeBtn); });
  footer.appendChild(likeBtn);

  const commentBtn = el('button', { className: 'rc-card__action', attrs: { type: 'button', 'aria-label': 'Comentarios' } });
  commentBtn.appendChild(Icons.chat(17));
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenChat(confession); });
  footer.appendChild(commentBtn);

  // ── Reacciones ──────────────────────────────────────────────
  const reactionsRow = el('div', { className: 'rc-card__reactions' });
  [
    { emoji: '😢', key: 'sad' },
    { emoji: '😮', key: 'wow' },
    { emoji: '🤝', key: 'support' },
  ].forEach(({ emoji, key }) => {
    const btn = el('button', {
      className: `rc-card__reaction`,
      attrs: { type: 'button', 'data-key': key, 'aria-label': key },
    });
    const emojiEl = document.createElement('span');
    emojiEl.textContent = emoji;
    emojiEl.className = 'rc-card__reaction-emoji';
    btn.appendChild(emojiEl);
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(confession.id, key, btn); });
    reactionsRow.appendChild(btn);
  });
  footer.appendChild(reactionsRow);

  card.appendChild(footer);
  card.addEventListener('click', () => handleOpenChat(confession));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleOpenChat(confession); });

  container.querySelector('.feed-empty')?.remove();
  if (prependToTop) container.insertBefore(card, container.firstChild);
  else              container.appendChild(card);

  if (animate) card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });

  // Cargar reacciones de forma asíncrona
  loadReactions(confession.id, reactionsRow, currentUser?.id);
}

// ── Open chat ─────────────────────────────────────────────────
async function handleOpenChat(confession) {
  switchView('chat');
  await openChat(confession);
}

// ── Image modal ───────────────────────────────────────────────
export function openImageModal(url) {
  document.getElementById('img-modal')?.remove();
  const overlay = el('div', { className: 'img-modal', attrs: { id: 'img-modal', role: 'dialog' } });
  const img = document.createElement('img');
  img.src = url; img.alt = 'Imagen'; img.className = 'img-modal__img';
  const closeBtn = el('button', { className: 'img-modal__close', attrs: { type: 'button' } });
  closeBtn.appendChild(Icons.close(20));
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
  overlay.appendChild(closeBtn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}

// ── Likes ─────────────────────────────────────────────────────
async function toggleLike(confessionId, btn) {
  if (!currentUser) { showToast('Inicia sesión para dar like.', 'info'); return; }
  const isLiked   = btn.classList.contains('rc-card__action--liked');
  const countSpan = btn.querySelector('.rc-card__action-count');
  let count       = parseInt(countSpan.textContent) || 0;
  const updateIcon = f => { const o = btn.querySelector('svg'); if (o) btn.replaceChild(Icons.heart(f, 17), o); };
  if (isLiked) {
    btn.classList.remove('rc-card__action--liked'); updateIcon(false); countSpan.textContent = String(count - 1);
    await sb.from('likes').delete().match({ confession_id: confessionId, user_id: currentUser.id });
  } else {
    btn.classList.add('rc-card__action--liked'); updateIcon(true); countSpan.textContent = String(count + 1);
    btn.classList.add('rc-card__action--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__action--pop'), { once: true });
    await sb.from('likes').insert({ confession_id: confessionId, user_id: currentUser.id });
  }
}

// ── Reacciones ────────────────────────────────────────────────
async function loadReactions(confessionId, container, userId) {
  const { data } = await sb
    .from('reactions')
    .select('reaction_type, user_id')
    .eq('confession_id', confessionId);
  if (!data) return;

  const counts = {};
  const userReacted = new Set();
  data.forEach(r => {
    counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
    if (r.user_id === userId) userReacted.add(r.reaction_type);
  });

  container.querySelectorAll('.rc-card__reaction').forEach(btn => {
    const key   = btn.dataset.key;
    const count = counts[key] || 0;
    // Remove old count span if any
    btn.querySelector('.rc-card__reaction-count')?.remove();
    if (count > 0) {
      const span = document.createElement('span');
      span.className = 'rc-card__reaction-count';
      span.textContent = String(count);
      btn.appendChild(span);
    }
    btn.classList.toggle('rc-card__reaction--active', userReacted.has(key));
  });
}

async function toggleReaction(confessionId, reactionType, btn) {
  if (!currentUser) { showToast('Inicia sesión para reaccionar.', 'info'); return; }
  const isActive = btn.classList.contains('rc-card__reaction--active');
  if (isActive) {
    await sb.from('reactions').delete().match({ confession_id: confessionId, user_id: currentUser.id, reaction_type: reactionType });
    btn.classList.remove('rc-card__reaction--active');
  } else {
    await sb.from('reactions').insert({ confession_id: confessionId, user_id: currentUser.id, reaction_type: reactionType });
    btn.classList.add('rc-card__reaction--active');
    btn.classList.add('rc-card__reaction--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__reaction--pop'), { once: true });
  }
  // Actualizar conteos
  const countSpan = btn.querySelector('.rc-card__reaction-count');
  const current = parseInt(countSpan?.textContent || '0');
  if (isActive) {
    if (current <= 1) { countSpan?.remove(); }
    else if (countSpan) countSpan.textContent = String(current - 1);
  } else {
    if (!countSpan) {
      const s = document.createElement('span');
      s.className = 'rc-card__reaction-count'; s.textContent = '1';
      btn.appendChild(s);
    } else countSpan.textContent = String(current + 1);
  }
}

// ── Delete ────────────────────────────────────────────────────
async function deleteConfession(id, cardEl) {
  if (!confirm('¿Borrar esta confesión? No se puede deshacer.')) return;
  const { error } = await sb.from('confessions').delete().eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  cardEl?.remove();
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
      if (window.__composeUploader?.getFile()) imageUrl = await window.__composeUploader.triggerUpload();
      const { error } = await sb.from('confessions').insert({ user_id: currentUser.id, content, image_url: imageUrl, hashtag });
      if (error) throw new Error(error.message);
      composeInput.value = '';
      window.__composeUploader?.reset();
      showToast('¡Confesión publicada!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    finally { composeSendBtn.disabled = false; }
  });
  composeInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composeSendBtn.click(); } });
}

// ── Realtime ──────────────────────────────────────────────────
function startRealtime() {
  try {
    realtimeChannel = sb.channel('rc-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' },
        async ({ new: row }) => {
          const { data: p } = await sb.from('profiles').select('id, avatar_url, full_name').eq('id', row.user_id).single();
          buildCard(row, feedEl, true, true, 0, 0, false, p);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => document.getElementById(`card-${row.id}`)?.remove())
      .subscribe(status => {
        if (status === 'SUBSCRIBED') stopPolling();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling();
      });
  } catch (err) { console.warn('[realtime]', err); startPolling(); }
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
      const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', data.map(c => c.user_id));
      const pm = Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      data.forEach(c => buildCard(c, feedEl, true, true, 0, 0, false, pm[c.user_id]));
      lastConfessionId = data[data.length - 1].id;
    }
  }, 10_000);
}
function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }
