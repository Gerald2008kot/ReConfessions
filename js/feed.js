// js/feed.js
// ============================================================
// Feed — cards compactas, thumbnail lateral, avatar, SVGs
// + Filtro por hashtag (chips scrolleables)
// + Compartir confesión (Web Share API / clipboard)
// + Encuestas rápidas (sí/no)
// ============================================================

import { sb }                                  from './api.js';
import { getCurrentUser, getProfile }          from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader }                   from './upload.js';
import { initChat, openChat }                  from './chat.js';
import { Icons }                               from './icons.js';
import { tagColor, countMap as sharedCountMap } from './shared.js';
import { routerPush, routerBack }              from './router.js';

let currentUser    = null;
let currentProfile = null;

let realtimeChannel  = null;
let pollingInterval  = null;
let lastConfessionId = null;
let activeView       = 'feed';

let activeHashtagFilter = null;

let feedEl, feedView, chatView,
    composeInput, composeHashtag, composeImgInput,
    composeImgPreview, composeProgressBar, composeSendBtn,
    composePollToggle, composePollInput;

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
  composePollToggle  = document.getElementById('compose-poll-toggle');
  composePollInput   = document.getElementById('compose-poll-input');

  currentUser = await getCurrentUser();
  if (currentUser) currentProfile = await getProfile(currentUser.id);

  document.getElementById('compose-bar')?.toggleAttribute('hidden', !currentUser);
  document.getElementById('login-prompt-bar')?.toggleAttribute('hidden', !!currentUser);

  populateHashtagSelector();
  initHashtagFilterChips();
  initPollToggle();

  if (composeImgInput) {
    const uploader = initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);
    window.__composeUploader = uploader;
  }

  await initChat(_closeChatUI);
  await loadConfessions();
  initComposeForm();
  startRealtime();

  handleHashNavigation();
}

// ── Hash navigation (#confession-UUID) ──────────────────────
function handleHashNavigation() {
  const hash = window.location.hash;
  const match = hash.match(/^#confession-([0-9a-f-]{36})$/i);
  if (!match) return;
  const uuid = match[1];
  setTimeout(async () => {
    const card = document.getElementById(`card-${uuid}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('rc-card--highlight');
      card.addEventListener('animationend', () => card.classList.remove('rc-card--highlight'), { once: true });
    } else {
      const { data } = await sb.from('confessions')
        .select('id, user_id, content, image_url, hashtag, created_at, poll_question')
        .eq('id', uuid).single();
      if (data) { switchView('chat'); await openChat(data); }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }, 400);
}

// ── Hashtag selector (compose) ───────────────────────────────
function populateHashtagSelector() {
  if (!composeHashtag) return;
  while (composeHashtag.firstChild) composeHashtag.removeChild(composeHashtag.firstChild);
  HASHTAGS.forEach(tag => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = tag;
    composeHashtag.appendChild(opt);
  });
}

// ── Hashtag filter chips ─────────────────────────────────────
function initHashtagFilterChips() {
  const wrapper = document.getElementById('hashtag-filter-bar');
  if (!wrapper) return;
  const allChip = buildFilterChip('Todos', true);
  allChip.addEventListener('click', () => setHashtagFilter(null, wrapper));
  wrapper.appendChild(allChip);
  HASHTAGS.forEach(tag => {
    const tc = tagColor(tag);
    const chip = buildFilterChip(tag, false, tc);
    chip.addEventListener('click', () => setHashtagFilter(tag, wrapper));
    wrapper.appendChild(chip);
  });
}

function buildFilterChip(label, active, tc = null) {
  const chip = el('button', {
    className: `hf-chip${active ? ' hf-chip--active' : ''}`,
    textContent: label,
    attrs: { type: 'button', 'data-tag': label },
  });
  if (tc && !active) {
    chip.style.setProperty('--chip-fg', tc.fg);
    chip.style.setProperty('--chip-bg', tc.bg);
  }
  return chip;
}

async function setHashtagFilter(tag, wrapper) {
  activeHashtagFilter = tag;
  wrapper.querySelectorAll('.hf-chip').forEach(chip => {
    const chipTag = chip.dataset.tag;
    const isActive = tag === null ? chipTag === 'Todos' : chipTag === tag;
    chip.classList.toggle('hf-chip--active', isActive);
  });
  await loadConfessions();
}

// ── Poll toggle (compose) ────────────────────────────────────
function initPollToggle() {
  if (!composePollToggle) return;
  composePollToggle.addEventListener('click', () => {
    const pollRow = document.getElementById('compose-poll-row');
    if (!pollRow) return;
    const isOpen = !pollRow.hidden;
    pollRow.hidden = isOpen;
    composePollToggle.classList.toggle('compose-poll-btn--active', !isOpen);
    if (!isOpen && composePollInput) composePollInput.focus();
  });
}

// ── Vista switch ─────────────────────────────────────────────
// Función interna que solo manipula el DOM, sin tocar historial.
function _closeChatUI() {
  activeView = 'feed';
  feedView?.classList.add('active');
  chatView?.classList.remove('active');
}

export function switchView(view, pushHistory = true) {
  activeView = view;

  if (view === 'chat') {
    feedView?.classList.remove('active');
    chatView?.classList.add('active');
    if (pushHistory) routerPush('chat', _closeChatUI);
  } else {
    feedView?.classList.add('active');
    chatView?.classList.remove('active');
  }
}

// ── Load confessions ─────────────────────────────────────────
export async function loadConfessions(containerEl, userId = null) {
  const target = containerEl || feedEl;
  let query = sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at, poll_question')
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) query = query.eq('user_id', userId);
  if (!userId && activeHashtagFilter) query = query.eq('hashtag', activeHashtagFilter);

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

  const likeMap    = buildCountMap(lk, 'confession_id');
  const commentMap = buildCountMap(cm, 'confession_id');

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const pollIds = data.filter(c => c.poll_question).map(c => c.id);
  let pollMap = {}, userVoteMap = {};
  if (pollIds.length) {
    const { data: polls } = await sb.from('polls').select('id, confession_id, question, yes_count, no_count').in('confession_id', pollIds);
    pollMap = Object.fromEntries((polls || []).map(p => [p.confession_id, p]));
    if (currentUser && polls?.length) {
      const pIds = polls.map(p => p.id);
      const { data: votes } = await sb.from('poll_votes').select('poll_id, vote').eq('user_id', currentUser.id).in('poll_id', pIds);
      userVoteMap = Object.fromEntries((votes || []).map(v => [v.poll_id, v.vote]));
    }
  }

  data.forEach(c => buildCard(
    c, target, false, false,
    likeMap[c.id]    || 0,
    commentMap[c.id] || 0,
    userLikedSet.has(c.id),
    profileMap[c.user_id] || null,
    pollMap[c.id]    || null,
    userVoteMap[pollMap[c.id]?.id] || null,
  ));

  if (!userId) lastConfessionId = data[0]?.id;
}

function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}

// ── Card compacta ─────────────────────────────────────────────
export function buildCard(confession, container, prependToTop, animate, likeCount, commentCount, isLiked, authorProfile, poll = null, userVote = null) {
  if (container === feedEl && document.getElementById(`card-${confession.id}`)) return;

  const card = el('article', {
    className: `rc-card${animate ? ' rc-card--new' : ''}`,
    attrs: { id: container === feedEl ? `card-${confession.id}` : undefined },
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
    const delBtn = el('button', {
      className: 'rc-card__del',
      attrs: { type: 'button', 'aria-label': 'Borrar' },
    });
    delBtn.appendChild(Icons.trash(15));
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConfession(confession.id, card); });
    top.appendChild(delBtn);
  }

  card.appendChild(top);

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img   = document.createElement('img');
    img.src = confession.image_url; img.alt = 'Imagen adjunta'; img.loading = 'lazy';
    img.addEventListener('click', (e) => { e.stopPropagation(); openImageModal(confession.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }

  card.appendChild(body);

  if (poll) {
    card.appendChild(buildPollWidget(poll, userVote, card));
  }

  const footer = el('div', { className: 'rc-card__footer' });

  const likeBtn = el('button', {
    className: `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`,
    attrs: { type: 'button', 'aria-label': 'Me gusta' },
  });
  likeBtn.appendChild(Icons.heart(isLiked, 17));
  likeBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(likeCount) }));
  likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(confession.id, likeBtn); });
  footer.appendChild(likeBtn);

  const commentBtn = el('button', {
    className: 'rc-card__action',
    attrs: { type: 'button', 'aria-label': 'Comentarios' },
  });
  commentBtn.appendChild(Icons.chat(17));
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenChat(confession); });
  footer.appendChild(commentBtn);

  const shareBtn = el('button', {
    className: 'rc-card__action rc-card__action--share',
    attrs: { type: 'button', 'aria-label': 'Compartir' },
  });
  shareBtn.appendChild(Icons.share(17));
  shareBtn.addEventListener('click', (e) => { e.stopPropagation(); shareConfession(confession.id); });
  footer.appendChild(shareBtn);

  card.appendChild(footer);
  card.addEventListener('click', () => handleOpenChat(confession));

  container.querySelector('.feed-empty')?.remove();
  if (prependToTop) container.insertBefore(card, container.firstChild);
  else              container.appendChild(card);

  if (animate) {
    card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });
  }
}

// ── Poll widget ───────────────────────────────────────────────
function buildPollWidget(poll, userVote, card) {
  const widget = el('div', { className: 'poll-widget' });
  widget.addEventListener('click', e => e.stopPropagation());
  widget.appendChild(el('p', { className: 'poll-widget__question', textContent: poll.question }));

  const total = (poll.yes_count || 0) + (poll.no_count || 0);

  const buildVoteBtn = (value, count) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isVoted = userVote === value;
    const btn = el('button', {
      className: `poll-btn${isVoted ? ' poll-btn--voted' : ''}`,
      attrs: { type: 'button', 'data-vote': value },
    });
    const label = el('span', { className: 'poll-btn__label', textContent: value === 'yes' ? '👍 Sí' : '👎 No' });
    const bar   = el('div',  { className: 'poll-btn__bar' });
    bar.style.width = `${pct}%`;
    const pctEl = el('span', { className: 'poll-btn__pct', textContent: `${pct}%` });
    btn.appendChild(label); btn.appendChild(bar); btn.appendChild(pctEl);
    btn.addEventListener('click', () => castVote(poll, value, widget, card));
    return btn;
  };

  const btnRow = el('div', { className: 'poll-widget__btns' });
  btnRow.appendChild(buildVoteBtn('yes', poll.yes_count || 0));
  btnRow.appendChild(buildVoteBtn('no',  poll.no_count  || 0));
  widget.appendChild(btnRow);

  widget.appendChild(el('span', { className: 'poll-widget__total', textContent: `${total} voto${total !== 1 ? 's' : ''}` }));
  return widget;
}

async function castVote(poll, vote, widgetEl, card) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  try {
    await sb.rpc('cast_poll_vote', { p_poll_id: poll.id, p_user_id: currentUser.id, p_vote: vote });
    const { data: fresh } = await sb.from('polls').select('id, confession_id, question, yes_count, no_count').eq('id', poll.id).single();
    const { data: voteRow } = await sb.from('poll_votes').select('vote').eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
    const newWidget = buildPollWidget(fresh, voteRow?.vote || null, card);
    widgetEl.replaceWith(newWidget);
  } catch (err) { showToast('Error al votar.', 'error'); }
}

// ── Share ─────────────────────────────────────────────────────
async function shareConfession(confessionId) {
  const url = `${location.origin}${location.pathname}#confession-${confessionId}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Re-Confessions', text: 'Mira esta confesión anónima', url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('¡Enlace copiado!', 'success'); }
  catch { showToast('No se pudo copiar el enlace.', 'error'); }
}

// ── Image modal ───────────────────────────────────────────────
function openImageModal(url) {
  const existing = document.getElementById('img-modal');
  if (existing) existing.remove();

  const overlay = el('div', {
    className: 'img-modal',
    attrs: { id: 'img-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Imagen completa' },
  });

  const img = document.createElement('img');
  img.src = url; img.alt = 'Imagen completa'; img.className = 'img-modal__img';

  const closeBtn = el('button', {
    className: 'img-modal__close',
    attrs: { type: 'button', 'aria-label': 'Cerrar' },
  });
  closeBtn.appendChild(Icons.close(20));

  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

  overlay.appendChild(closeBtn); overlay.appendChild(img);
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
    const content      = composeInput?.value.trim();
    const hashtag      = composeHashtag?.value || '#Confesión';
    const pollQuestion = composePollInput?.value.trim() || null;
    if (!content) return;

    composeSendBtn.disabled = true;
    try {
      let imageUrl = null;
      const uploader = window.__composeUploader;
      if (uploader?.getFile()) imageUrl = await uploader.triggerUpload();

      const { data: inserted, error } = await sb.from('confessions').insert({
        user_id: currentUser.id, content, image_url: imageUrl, hashtag,
        poll_question: pollQuestion || null,
      }).select('id').single();
      if (error) throw new Error(error.message);

      if (pollQuestion && inserted?.id) {
        await sb.from('polls').insert({ confession_id: inserted.id, question: pollQuestion });
      }

      composeInput.value = '';
      if (composePollInput) composePollInput.value = '';
      const pollRow = document.getElementById('compose-poll-row');
      if (pollRow) pollRow.hidden = true;
      composePollToggle?.classList.remove('compose-poll-btn--active');
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

export { tagColor };
export const hashtagColor = tagColor;

// ── Realtime ──────────────────────────────────────────────────
function startRealtime() {
  try {
    realtimeChannel = sb.channel('rc-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' },
        async ({ new: row }) => {
          if (activeHashtagFilter && row.hashtag !== activeHashtagFilter) return;
          const { data: p } = await sb.from('profiles').select('id, avatar_url, full_name').eq('id', row.user_id).single();
          buildCard(row, feedEl, true, true, 0, 0, false, p, null, null);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => document.getElementById(`card-${row.id}`)?.remove())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls' },
        ({ new: poll }) => {
          const card = document.getElementById(`card-${poll.confession_id}`);
          if (!card) return;
          const existing = card.querySelector('.poll-widget');
          if (!existing) return;
          const newWidget = buildPollWidget(poll, null, card);
          existing.replaceWith(newWidget);
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')                               stopPolling();
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
    let q = sb.from('confessions')
      .select('id, user_id, content, image_url, hashtag, created_at, poll_question')
      .gt('created_at', ref.created_at).order('created_at', { ascending: true });
    if (activeHashtagFilter) q = q.eq('hashtag', activeHashtagFilter);
    const { data } = await q;
    if (data?.length) {
      const ids = data.map(c => c.user_id);
      const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', ids);
      const pm = Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      data.forEach(c => buildCard(c, feedEl, true, true, 0, 0, false, pm[c.user_id], null, null));
      lastConfessionId = data[data.length - 1].id;
    }
  }, 10_000);
}

function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }
