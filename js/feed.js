// js/feed.js
import { sb }                                  from './api.js';
import { getCurrentUser, getProfile }          from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader }                   from './upload.js';
// chat.js imported dynamically to avoid circular dependency
import { Icons as _Icons }                      from './icons.js';

// Extend Icons with extra icons needed in feed
const NS = 'http://www.w3.org/2000/svg';
function makeSvg(d, size, fill='none', sw='1.5') {
  const s = document.createElementNS(NS,'svg');
  s.setAttribute('viewBox','0 0 24 24');
  s.setAttribute('width',String(size)); s.setAttribute('height',String(size));
  s.setAttribute('fill',fill); s.setAttribute('stroke','currentColor');
  s.setAttribute('stroke-width',sw); s.setAttribute('aria-hidden','true');
  const p = document.createElementNS(NS,'path');
  p.setAttribute('stroke-linecap','round'); p.setAttribute('stroke-linejoin','round');
  p.setAttribute('d', d); s.appendChild(p); return s;
}
const Icons = {
  ..._Icons,
  share:  (n=17) => makeSvg('M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z', n),
  check:  (n=15) => makeSvg('M4.5 12.75l6 6 9-13.5', n, 'none', '2'),
  x:      (n=15) => makeSvg('M6 18L18 6M6 6l12 12', n, 'none', '2'),
};
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

  // Dynamic import breaks the circular dependency chain
  const chatMod = await import('./chat.js');
  chatMod.setCanDelete(canDelete);
  await chatMod.initChat(() => switchView('feed', false));
  await loadConfessions();
  initComposeForm();
  startRealtime();
}

// ── Custom hashtag picker ─────────────────────────────────────
function populateHashtagSelector() {
  const pickerBtn      = document.getElementById('hashtag-picker-btn');
  const pickerLabel    = document.getElementById('hashtag-picker-label');
  const pickerDropdown = document.getElementById('hashtag-picker-dropdown');
  const hiddenInput    = document.getElementById('compose-hashtag');
  if (!pickerBtn || !pickerDropdown) return;

  let isOpen = false;

  // Build dropdown items
  HASHTAGS.forEach(tag => {
    const item = el('div', {
      className:   'hashtag-picker__item',
      textContent: tag,
      attrs:       { role: 'option', tabindex: '0' },
    });
    // Color pill
    const { bg, fg } = tagColor(tag);
    item.style.cssText = `--tag-bg:${bg};--tag-fg:${fg}`;
    item.addEventListener('click', () => {
      if (hiddenInput)  hiddenInput.value   = tag;
      if (pickerLabel)  pickerLabel.textContent = tag;
      if (pickerLabel)  { pickerLabel.style.background = bg; pickerLabel.style.color = fg; }
      closePicker();
    });
    item.addEventListener('keydown', e => { if (e.key === 'Enter') item.click(); });
    pickerDropdown.appendChild(item);
  });

  function openPicker() {
    isOpen = true;
    pickerDropdown.hidden = false;
    pickerBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => pickerDropdown.classList.add('hashtag-picker__dropdown--open'));
  }
  function closePicker() {
    isOpen = false;
    pickerDropdown.classList.remove('hashtag-picker__dropdown--open');
    setTimeout(() => { pickerDropdown.hidden = true; }, 200);
    pickerBtn.setAttribute('aria-expanded', 'false');
  }

  pickerBtn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen ? closePicker() : openPicker();
  });
  document.addEventListener('click', e => {
    if (isOpen && !document.getElementById('hashtag-picker')?.contains(e.target)) closePicker();
  });

  // Init label color
  const initTag = hiddenInput?.value || '#Confesión';
  const { bg: iBg, fg: iFg } = tagColor(initTag);
  if (pickerLabel) { pickerLabel.style.background = iBg; pickerLabel.style.color = iFg; }
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
  // Toque corto = like, toque largo (>500ms) = expandir reacciones
  let pressTimer = null;
  const REACTIONS = [
    { emoji: '😢', key: 'sad' },
    { emoji: '😮', key: 'wow' },
    { emoji: '🤝', key: 'support' },
  ];

  function showReactionPicker(anchorBtn) {
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    const picker = el('div', { className: 'reaction-picker' });
    REACTIONS.forEach(({ emoji, key }) => {
      const btn = el('button', {
        className: 'reaction-picker__btn',
        attrs: { type: 'button', 'data-key': key, 'aria-label': key },
      });
      btn.textContent = emoji;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        picker.remove();
        toggleReaction(confession.id, key, likeBtn, reactionsState);
      });
      picker.appendChild(btn);
    });
    anchorBtn.appendChild(picker);
    requestAnimationFrame(() => picker.classList.add('reaction-picker--open'));
    // Cerrar al tocar fuera
    const close = e => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  // Estado de reacciones para actualizar el botón visualmente
  const reactionsState = { active: null };

  likeBtn.addEventListener('pointerdown', e => {
    pressTimer = setTimeout(() => {
      pressTimer = null;
      showReactionPicker(likeBtn);
    }, 500);
  });
  likeBtn.addEventListener('pointerup', e => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer); pressTimer = null;
      e.stopPropagation();
      toggleLike(confession.id, likeBtn);
    }
  });
  likeBtn.addEventListener('pointercancel', () => { clearTimeout(pressTimer); pressTimer = null; });
  likeBtn.addEventListener('contextmenu', e => e.preventDefault()); // prevent context menu on long press
  footer.appendChild(likeBtn);

  const commentBtn = el('button', { className: 'rc-card__action', attrs: { type: 'button', 'aria-label': 'Comentarios' } });
  commentBtn.appendChild(Icons.chat(17));
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenChat(confession); });
  footer.appendChild(commentBtn);

  // Reacciones: panel oculto, se activa con long-press en el botón de like

  // ── Compartir ────────────────────────────────────────────────
  const shareBtn = el('button', {
    className: 'rc-card__share',
    attrs:     { type: 'button', 'aria-label': 'Compartir' },
  });
  shareBtn.appendChild(Icons.share(17));
  shareBtn.addEventListener('click', e => { e.stopPropagation(); shareConfession(confession); });
  footer.appendChild(shareBtn);

  card.appendChild(footer);

  // ── Encuesta (si existe) ──────────────────────────────────────
  if (confession.poll_question) {
    const pollEl = el('div', { className: 'rc-card__poll' });
    pollEl.appendChild(el('p', { className: 'rc-card__poll-q', textContent: confession.poll_question }));
    const pollBtns = el('div', { className: 'rc-card__poll-btns' });
    const yesBtn = el('button', { className: 'rc-card__poll-btn rc-card__poll-btn--yes', attrs: { type: 'button', 'data-vote': 'yes' } });
    yesBtn.appendChild(Icons.check(15));
    yesBtn.appendChild(el('span', { textContent: 'Sí' }));
    const noBtn  = el('button', { className: 'rc-card__poll-btn rc-card__poll-btn--no',  attrs: { type: 'button', 'data-vote': 'no' } });
    noBtn.appendChild(Icons.x(15));
    noBtn.appendChild(el('span', { textContent: 'No' }));
    [yesBtn, noBtn].forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); votePoll(confession.id, btn.dataset.vote, pollEl); });
    });
    pollBtns.appendChild(yesBtn); pollBtns.appendChild(noBtn);
    pollEl.appendChild(pollBtns);
    card.appendChild(pollEl);
    // Cargar estado de la encuesta
    loadPoll(confession.id, pollEl, currentUser?.id);
  }

  card.addEventListener('click', () => handleOpenChat(confession));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleOpenChat(confession); });

  container.querySelector('.feed-empty')?.remove();
  if (prependToTop) container.insertBefore(card, container.firstChild);
  else              container.appendChild(card);

  if (animate) card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });

  // Cargar reacciones de forma asíncrona (actualiza reactionsState y badge)
  loadReactions(confession.id, likeBtn, reactionsState, currentUser?.id);
}

// ── Open chat ─────────────────────────────────────────────────
async function handleOpenChat(confession) {
  switchView('chat');
  sb.rpc('increment_read_count', { p_confession_id: confession.id }).catch(() => {});
  const { openChat } = await import('./chat.js');
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
// Emoji map for reaction display
const REACTION_EMOJIS = { sad: '😢', wow: '😮', support: '🤝' };

// loadReactions: updates the like button with a small badge if there are reactions
async function loadReactions(confessionId, likeBtn, state, userId) {
  const { data } = await sb
    .from('reactions')
    .select('reaction_type, user_id')
    .eq('confession_id', confessionId);
  if (!data) return;

  let myReaction = null;
  const counts = {};
  data.forEach(r => {
    counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
    if (r.user_id === userId) myReaction = r.reaction_type;
  });

  state.active = myReaction;
  updateReactionBadge(likeBtn, counts, myReaction);
}

function updateReactionBadge(likeBtn, counts, myReaction) {
  likeBtn.querySelector('.like-reaction-badge')?.remove();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0 && !myReaction) return;

  const badge = document.createElement('span');
  badge.className = 'like-reaction-badge';
  // Show my reaction emoji, or the most popular one
  const show = myReaction || Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0];
  if (show) badge.textContent = REACTION_EMOJIS[show] || '';
  likeBtn.appendChild(badge);
}

async function toggleReaction(confessionId, reactionType, likeBtn, state) {
  if (!currentUser) { showToast('Inicia sesión para reaccionar.', 'info'); return; }

  if (state.active === reactionType) {
    // Quitar reacción
    await sb.from('reactions').delete()
      .match({ confession_id: confessionId, user_id: currentUser.id, reaction_type: reactionType });
    state.active = null;
  } else {
    // Quitar reacción anterior si la hay
    if (state.active) {
      await sb.from('reactions').delete()
        .match({ confession_id: confessionId, user_id: currentUser.id, reaction_type: state.active });
    }
    await sb.from('reactions').insert({ confession_id: confessionId, user_id: currentUser.id, reaction_type: reactionType });
    state.active = reactionType;
    likeBtn.classList.add('rc-card__action--pop');
    likeBtn.addEventListener('animationend', () => likeBtn.classList.remove('rc-card__action--pop'), { once: true });
  }

  // Recargar conteos
  const { data } = await sb.from('reactions').select('reaction_type').eq('confession_id', confessionId);
  const counts = {};
  data?.forEach(r => { counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1; });
  updateReactionBadge(likeBtn, counts, state.active);
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

  // Poll toggle
  const pollBtn   = document.getElementById('compose-poll-btn');
  const pollRow   = document.getElementById('compose-poll-row');
  const pollInput = document.getElementById('compose-poll-input');
  const pollClose = document.getElementById('compose-poll-close');

  pollBtn?.addEventListener('click', () => {
    const open = pollRow.hidden;
    pollRow.hidden = !open;
    pollBtn.classList.toggle('compose-poll-toggle--active', open);
    if (open) pollInput?.focus();
  });
  pollClose?.addEventListener('click', () => {
    pollRow.hidden = true;
    if (pollInput) pollInput.value = '';
    pollBtn?.classList.remove('compose-poll-toggle--active');
  });

  composeSendBtn.addEventListener('click', async () => {
    const text    = composeInput?.value.trim();
    const hashtag = document.getElementById('compose-hashtag')?.value || '#Confesión';
    const pollQ   = pollInput?.value.trim() || null;
    if (!text) return;
    composeSendBtn.disabled = true;
    try {
      let imageUrl = null;
      if (window.__composeUploader?.getFile()) imageUrl = await window.__composeUploader.triggerUpload();
      const { data: conf, error } = await sb.from('confessions')
        .insert({ user_id: currentUser.id, content: text, image_url: imageUrl, hashtag, poll_question: pollQ })
        .select('id').single();
      if (error) throw new Error(error.message);

      // Crear poll si hay pregunta
      if (pollQ && conf?.id) {
        await sb.from('polls').insert({ confession_id: conf.id, question: pollQ });
      }

      composeInput.value = '';
      window.__composeUploader?.reset();
      if (pollInput) pollInput.value = '';
      if (pollRow) pollRow.hidden = true;
      pollBtn?.classList.remove('compose-poll-toggle--active');
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

// ── Compartir ──────────────────────────────────────────────────
async function shareConfession(confession) {
  const text = confession.content.slice(0, 120) + (confession.content.length > 120 ? '…' : '');
  const url  = `${location.origin}${location.pathname}#${confession.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: confession.hashtag || 'Re-Confessions', text, url });
      return;
    } catch { /* usuario canceló */ }
  }
  // Fallback: copiar al portapapeles
  try {
    await navigator.clipboard.writeText(url);
    showToast('Enlace copiado al portapapeles.', 'success');
  } catch {
    showToast('No se pudo copiar el enlace.', 'error');
  }
}

// ── Lecturas ───────────────────────────────────────────────────
export async function registerRead(confessionId) {
  await sb.rpc('increment_read_count', { p_confession_id: confessionId });
}

// ── Encuesta ───────────────────────────────────────────────────
async function loadPoll(confessionId, container, userId) {
  const [{ data: poll }, { data: myVote }] = await Promise.all([
    sb.from('polls').select('id, question, yes_count, no_count').eq('confession_id', confessionId).single(),
    userId
      ? sb.from('poll_votes').select('vote').eq('poll_id',
          (await sb.from('polls').select('id').eq('confession_id', confessionId).single())?.data?.id || ''
        ).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!poll) return;

  container.dataset.pollId = poll.id;
  updatePollUI(container, poll.yes_count, poll.no_count, myVote?.data?.vote || null);
}

function updatePollUI(container, yes, no, voted) {
  const total  = yes + no || 1;
  const yesPct = Math.round((yes / total) * 100);
  const noPct  = 100 - yesPct;

  const yesBtn = container.querySelector('[data-vote="yes"]');
  const noBtn  = container.querySelector('[data-vote="no"]');

  if (yesBtn) {
    yesBtn.classList.toggle('rc-card__poll-btn--voted', voted === 'yes');
    // Show percentage
    let pctEl = yesBtn.querySelector('.poll-pct');
    if (!pctEl) { pctEl = document.createElement('span'); pctEl.className = 'poll-pct'; yesBtn.appendChild(pctEl); }
    pctEl.textContent = yes > 0 || no > 0 ? `${yesPct}%` : '';
  }
  if (noBtn) {
    noBtn.classList.toggle('rc-card__poll-btn--voted', voted === 'no');
    let pctEl = noBtn.querySelector('.poll-pct');
    if (!pctEl) { pctEl = document.createElement('span'); pctEl.className = 'poll-pct'; noBtn.appendChild(pctEl); }
    pctEl.textContent = yes > 0 || no > 0 ? `${noPct}%` : '';
  }
}

async function votePoll(confessionId, vote, container) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  const pollId = container.dataset.pollId;
  if (!pollId) return;
  await sb.rpc('cast_poll_vote', { p_poll_id: pollId, p_user_id: currentUser.id, p_vote: vote });
  // Recargar conteos
  const { data: poll } = await sb.from('polls').select('yes_count, no_count').eq('id', pollId).single();
  const { data: myVote } = await sb.from('poll_votes').select('vote').match({ poll_id: pollId, user_id: currentUser.id }).maybeSingle();
  if (poll) updatePollUI(container, poll.yes_count, poll.no_count, myVote?.vote || null);
}
