// js/feed.js
// ============================================================
// Feed — cards compactas, thumbnail lateral, avatar, SVGs
// + Filtro por hashtag (chips scrolleables)
// + Compartir confesión (Web Share API / clipboard)
// + Encuestas rápidas (sí/no) y avanzadas (hasta 4 opciones)
// + Hashtags múltiples (hasta 3) — picker custom con colores
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

// Estado del picker de hashtags
let _pickerSelected = []; // array de tags seleccionados (máx 3)
let _pickerOpen     = false;

let feedEl, feedView, chatView,
    composeInput, composeHashtag, composeImgInput,
    composeImgPreview, composeProgressBar, composeSendBtn,
    composePollToggle, composePollInput;

export const HASHTAGS = [
  '#Confesión','#Desamor','#Traición','#Ruptura','#Secreto',
  '#Familia','#Trabajo','#Amistad','#Vergüenza','#Arrepentimiento',
  '#Felicidad','#Miedo','#Sueño','#Enojo','#Nostalgia',
];

// ── SVGs internos (sin emojis) ───────────────────────────────
const SvgPoll = (size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75
       C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z
       M9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25
       c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z
       M16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75
       c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>`;
  return s;
};

const SvgYesNo = (size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227
       1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133
       a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379
       c1.584-.233 2.707-1.626 2.707-3.228V6.741
       c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3
       c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>`;
  return s;
};

const SvgThumbUp = (size = 15) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0
       012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0
       00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5
       c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126
       c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0
       01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23
       l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75
       c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368
       a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203
       4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0
       00-1.302 4.665c0 1.194.232 2.333.654 3.375z"/>`;
  return s;
};

const SvgThumbDown = (size = 15) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977
       a8.963 8.963 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908
       c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507
       0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053
       c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48
       a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504
       c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285
       C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0
       00 7.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633
       c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715
       a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"/>`;
  return s;
};

const SvgCheck = (size = 14) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 16 16'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2.2');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M3 8l3.5 3.5L13 5"/>`;
  return s;
};

const SvgChevronDown = (size = 14) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>`;
  return s;
};

const SvgX = (size = 10) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2.5');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>`;
  return s;
};

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

  initHashtagPicker();
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
        .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
        .eq('id', uuid).single();
      if (data) { switchView('chat'); await openChat(data); }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }, 400);
}

// ── Custom hashtag picker ────────────────────────────────────
function initHashtagPicker() {
  const container = document.getElementById('ht-picker');
  if (!container) return;

  _pickerSelected = [HASHTAGS[0]]; // default: #Confesión
  renderPicker(container);

  // Cerrar al tocar fuera
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closePicker(container);
  });
}

function renderPicker(container) {
  container.className = `ht-picker${_pickerOpen ? ' ht-picker--open' : ''}`;
  container.innerHTML = '';

  // ── Trigger ───────────────────────────────────────────────
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ht-picker__trigger';
  trigger.setAttribute('aria-label', 'Seleccionar hashtags');

  const selectedWrap = el('div', { className: 'ht-picker__selected' });

  if (_pickerSelected.length === 0) {
    selectedWrap.appendChild(el('span', { className: 'ht-picker__placeholder', textContent: 'Hashtag…' }));
  } else {
    _pickerSelected.forEach(tag => {
      const tc   = tagColor(tag);
      const chip = el('span', {
        className: 'ht-picker__chip',
        attrs: { style: `background:${tc.bg};color:${tc.fg}` },
      });
      chip.textContent = tag;

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ht-picker__chip-remove';
      rm.setAttribute('aria-label', `Quitar ${tag}`);
      rm.appendChild(SvgX(9));
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        _pickerSelected = _pickerSelected.filter(t => t !== tag);
        renderPicker(container);
      });
      chip.appendChild(rm);
      selectedWrap.appendChild(chip);
    });
  }

  trigger.appendChild(selectedWrap);

  const chevron = el('span', { className: 'ht-picker__chevron' });
  chevron.appendChild(SvgChevronDown(14));
  trigger.appendChild(chevron);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    _pickerOpen = !_pickerOpen;
    renderPicker(container);
  });
  container.appendChild(trigger);

  // ── Dropdown ──────────────────────────────────────────────
  if (_pickerOpen) {
    const dropdown = el('div', { className: 'ht-picker__dropdown', attrs: { role: 'listbox', 'aria-multiselectable': 'true' } });

    HASHTAGS.forEach(tag => {
      const tc       = tagColor(tag);
      const isSelected = _pickerSelected.includes(tag);
      const maxReached = _pickerSelected.length >= 3 && !isSelected;

      const opt = el('button', {
        className: `ht-picker__option${isSelected ? ' ht-picker__option--selected' : ''}${maxReached ? ' ht-picker__option--disabled' : ''}`,
        textContent: tag,
        attrs: {
          type: 'button',
          role: 'option',
          'aria-selected': String(isSelected),
          style: `background:${tc.bg};color:${tc.fg}`,
        },
      });

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelected) {
          _pickerSelected = _pickerSelected.filter(t => t !== tag);
        } else if (_pickerSelected.length < 3) {
          _pickerSelected = [..._pickerSelected, tag];
        }
        // Si solo queda uno no permitir deseleccionar (mínimo 1)
        if (_pickerSelected.length === 0) _pickerSelected = [tag];
        renderPicker(container);
      });

      dropdown.appendChild(opt);
    });

    const hint = el('p', { className: 'ht-picker__hint', textContent: 'Máx. 3 hashtags' });
    dropdown.appendChild(hint);
    container.appendChild(dropdown);
  }
}

function closePicker(container) {
  if (!_pickerOpen) return;
  _pickerOpen = false;
  renderPicker(container);
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

  document.getElementById('poll-type-simple')?.addEventListener('click',   () => setPollType('simple'));
  document.getElementById('poll-type-advanced')?.addEventListener('click', () => setPollType('advanced'));
}

function setPollType(type) {
  document.getElementById('poll-type-simple')?.classList.toggle('compose-poll-type-btn--active',   type === 'simple');
  document.getElementById('poll-type-advanced')?.classList.toggle('compose-poll-type-btn--active', type === 'advanced');
  const advOptions  = document.getElementById('compose-poll-options');
  const simpleLabel = document.getElementById('compose-poll-label');
  if (advOptions)  advOptions.hidden  = type !== 'advanced';
  if (simpleLabel) simpleLabel.hidden = type !== 'simple';
}

// ── Vista switch ─────────────────────────────────────────────
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
    .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) query = query.eq('user_id', userId);
  if (!userId && activeHashtagFilter) {
    query = query.or(`hashtags.cs.{"${activeHashtagFilter}"},hashtag.eq.${activeHashtagFilter}`);
  }

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
    const { data: polls } = await sb
      .from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .in('confession_id', pollIds);
    pollMap = Object.fromEntries((polls || []).map(p => [p.confession_id, p]));

    if (currentUser && polls?.length) {
      const pIds = polls.map(p => p.id);
      const { data: votes } = await sb
        .from('poll_votes')
        .select('poll_id, vote, option_id')
        .eq('user_id', currentUser.id)
        .in('poll_id', pIds);
      userVoteMap = Object.fromEntries((votes || []).map(v => [v.poll_id, { vote: v.vote, option_id: v.option_id }]));
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

function effectiveTags(confession) {
  if (confession.hashtags?.length) return confession.hashtags;
  if (confession.hashtag)          return [confession.hashtag];
  return ['#Confesión'];
}

// ── Card compacta ─────────────────────────────────────────────
export function buildCard(confession, container, prependToTop, animate, likeCount, commentCount, isLiked, authorProfile, poll = null, userVoteInfo = null) {
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

  // Tags
  const tags = effectiveTags(confession);
  if (tags.length === 1) {
    const tc = tagColor(tags[0]);
    top.appendChild(el('span', {
      className: 'rc-card__tag',
      textContent: tags[0],
      attrs: { style: `background:${tc.bg};color:${tc.fg}` },
    }));
  } else {
    const tagsWrap = el('div', { className: 'rc-card__tags' });
    tags.forEach(tag => {
      const tc = tagColor(tag);
      tagsWrap.appendChild(el('span', {
        className: 'rc-card__tag',
        textContent: tag,
        attrs: { style: `background:${tc.bg};color:${tc.fg}` },
      }));
    });
    top.appendChild(tagsWrap);
  }

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

  if (poll) card.appendChild(buildPollWidget(poll, userVoteInfo, card));

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
function buildPollWidget(poll, userVoteInfo, card) {
  if (poll.poll_type === 'advanced' && poll.poll_options?.length) {
    return buildAdvancedPollWidget(poll, userVoteInfo, card);
  }
  return buildSimplePollWidget(poll, userVoteInfo, card);
}

// Sí/No — lógica original
function buildSimplePollWidget(poll, userVoteInfo, card) {
  const vote = typeof userVoteInfo === 'string' ? userVoteInfo : (userVoteInfo?.vote ?? null);

  const widget = el('div', { className: 'poll-widget' });
  widget.addEventListener('click', e => e.stopPropagation());
  widget.appendChild(el('p', { className: 'poll-widget__question', textContent: poll.question }));

  const total = (poll.yes_count || 0) + (poll.no_count || 0);

  const buildVoteBtn = (value, count) => {
    const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
    const isVoted = vote === value;
    const btn = el('button', {
      className: `poll-btn${isVoted ? ' poll-btn--voted' : ''}`,
      attrs: { type: 'button', 'data-vote': value },
    });
    const labelWrap = el('span', { className: 'poll-btn__label' });
    // SVG en lugar de emoji
    labelWrap.appendChild(value === 'yes' ? SvgThumbUp(14) : SvgThumbDown(14));
    labelWrap.appendChild(document.createTextNode(value === 'yes' ? ' Sí' : ' No'));
    const bar   = el('div', { className: 'poll-btn__bar' });
    bar.style.width = `${pct}%`;
    const pctEl = el('span', { className: 'poll-btn__pct', textContent: `${pct}%` });
    btn.appendChild(labelWrap); btn.appendChild(bar); btn.appendChild(pctEl);
    btn.addEventListener('click', () => castSimpleVote(poll, value, widget, card));
    return btn;
  };

  const btnRow = el('div', { className: 'poll-widget__btns' });
  btnRow.appendChild(buildVoteBtn('yes', poll.yes_count || 0));
  btnRow.appendChild(buildVoteBtn('no',  poll.no_count  || 0));
  widget.appendChild(btnRow);
  widget.appendChild(el('span', { className: 'poll-widget__total', textContent: `${total} voto${total !== 1 ? 's' : ''}` }));
  return widget;
}

// Avanzada (hasta 4 opciones)
function buildAdvancedPollWidget(poll, userVoteInfo, card) {
  const votedOptionId = userVoteInfo?.option_id ?? null;

  const widget = el('div', { className: 'poll-widget poll-widget--advanced' });
  widget.addEventListener('click', e => e.stopPropagation());
  widget.appendChild(el('p', { className: 'poll-widget__question', textContent: poll.question }));

  const options = [...(poll.poll_options || [])].sort((a, b) => a.position - b.position);
  const total   = options.reduce((s, o) => s + (o.vote_count || 0), 0);

  const grid = el('div', { className: 'poll-advanced-grid' });

  options.forEach(opt => {
    const pct     = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
    const isVoted = votedOptionId === opt.id;

    const btn = el('button', {
      className: `poll-opt-btn${isVoted ? ' poll-opt-btn--voted' : ''}`,
      attrs: { type: 'button' },
    });

    const bar = el('div', { className: 'poll-opt-btn__bar' });
    requestAnimationFrame(() => { bar.style.width = `${pct}%`; });

    const label = el('span', { className: 'poll-opt-btn__label', textContent: opt.label });
    const pctEl = el('span', { className: 'poll-opt-btn__pct', textContent: `${pct}%` });

    const check = el('span', { className: 'poll-opt-btn__check', attrs: { 'aria-hidden': 'true' } });
    check.appendChild(SvgCheck(13));

    btn.appendChild(bar);
    btn.appendChild(label);
    btn.appendChild(pctEl);
    btn.appendChild(check);
    btn.addEventListener('click', () => castAdvancedVote(poll, opt.id, widget, card));
    grid.appendChild(btn);
  });

  widget.appendChild(grid);
  widget.appendChild(el('span', { className: 'poll-widget__total', textContent: `${total} voto${total !== 1 ? 's' : ''}` }));
  return widget;
}

// ── Votar simple ──────────────────────────────────────────────
async function castSimpleVote(poll, vote, widgetEl, card) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  try {
    await sb.rpc('cast_poll_vote', { p_poll_id: poll.id, p_user_id: currentUser.id, p_vote: vote });
    const { data: fresh } = await sb
      .from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .eq('id', poll.id).single();
    const { data: voteRow } = await sb
      .from('poll_votes').select('vote, option_id')
      .eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
    widgetEl.replaceWith(buildPollWidget(fresh, voteRow || null, card));
  } catch { showToast('Error al votar.', 'error'); }
}

// ── Votar avanzada ────────────────────────────────────────────
async function castAdvancedVote(poll, optionId, widgetEl, card) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  try {
    await sb.rpc('cast_advanced_poll_vote', { p_poll_id: poll.id, p_option_id: optionId, p_user_id: currentUser.id });
    const { data: fresh } = await sb
      .from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .eq('id', poll.id).single();
    const { data: voteRow } = await sb
      .from('poll_votes').select('vote, option_id')
      .eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
    widgetEl.replaceWith(buildPollWidget(fresh, voteRow || null, card));
  } catch { showToast('Error al votar.', 'error'); }
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
  const closeBtn = el('button', { className: 'img-modal__close', attrs: { type: 'button', 'aria-label': 'Cerrar' } });
  closeBtn.appendChild(Icons.close(20));
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  overlay.appendChild(closeBtn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}

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

  let error;

  if (currentProfile?.is_admin) {
    // Admins usan RPC con SECURITY DEFINER para saltarse RLS
    ({ error } = await sb.rpc('admin_delete_confession', { p_confession_id: id }));
  } else {
    // Dueño borra su propia confesión (RLS permite auth.uid() = user_id)
    ({ error } = await sb.from('confessions').delete().eq('id', id));
  }

  if (error) { showToast(error.message, 'error'); return; }
  (cardEl ?? document.getElementById(`card-${id}`))?.remove();
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
    const pollQuestion = composePollInput?.value.trim() || null;
    if (!content) return;

    // Tags del picker custom (máx 3, mínimo 1)
    const selectedTags   = _pickerSelected.length ? _pickerSelected.slice(0, 3) : ['#Confesión'];
    const primaryHashtag = selectedTags[0];

    // Tipo de encuesta
    const isAdvanced = document.getElementById('poll-type-advanced')?.classList.contains('compose-poll-type-btn--active');

    let advancedOptions = [];
    if (isAdvanced && pollQuestion) {
      advancedOptions = Array.from(
        document.querySelectorAll('.compose-poll-option-input')
      ).map(i => i.value.trim()).filter(Boolean).slice(0, 4);
      if (advancedOptions.length < 2) {
        showToast('Añade al menos 2 opciones para la encuesta.', 'info');
        return;
      }
    }

    composeSendBtn.disabled = true;
    try {
      let imageUrl = null;
      const uploader = window.__composeUploader;
      if (uploader?.getFile()) imageUrl = await uploader.triggerUpload();

      const { data: inserted, error } = await sb.from('confessions').insert({
        user_id:       currentUser.id,
        content,
        image_url:     imageUrl,
        hashtag:       primaryHashtag,
        hashtags:      selectedTags,
        poll_question: pollQuestion || null,
      }).select('id').single();
      if (error) throw new Error(error.message);

      if (pollQuestion && inserted?.id) {
        if (isAdvanced && advancedOptions.length >= 2) {
          const { data: pollRow, error: pollErr } = await sb.from('polls').insert({
            confession_id: inserted.id, question: pollQuestion, poll_type: 'advanced',
          }).select('id').single();
          if (pollErr) throw new Error(pollErr.message);
          await sb.from('poll_options').insert(
            advancedOptions.map((label, i) => ({ poll_id: pollRow.id, position: i + 1, label }))
          );
        } else {
          await sb.from('polls').insert({ confession_id: inserted.id, question: pollQuestion, poll_type: 'simple' });
        }
      }

      // Reset
      composeInput.value = '';
      if (composePollInput) composePollInput.value = '';
      document.querySelectorAll('.compose-poll-option-input').forEach(i => { i.value = ''; });
      const pollRow = document.getElementById('compose-poll-row');
      if (pollRow) pollRow.hidden = true;
      composePollToggle?.classList.remove('compose-poll-btn--active');
      window.__composeUploader?.reset();
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
          if (activeHashtagFilter) {
            const rowTags = row.hashtags?.length ? row.hashtags : (row.hashtag ? [row.hashtag] : []);
            if (!rowTags.includes(activeHashtagFilter)) return;
          }
          const { data: p } = await sb.from('profiles').select('id, avatar_url, full_name').eq('id', row.user_id).single();
          buildCard(row, feedEl, true, true, 0, 0, false, p, null, null);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => document.getElementById(`card-${row.id}`)?.remove())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls' },
        async ({ new: poll }) => {
          const card = document.getElementById(`card-${poll.confession_id}`);
          if (!card) return;
          const existing = card.querySelector('.poll-widget');
          if (!existing) return;
          const { data: fresh } = await sb
            .from('polls')
            .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
            .eq('id', poll.id).single();
          if (!fresh) return;
          existing.replaceWith(buildPollWidget(fresh, null, card));
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
      .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
      .gt('created_at', ref.created_at).order('created_at', { ascending: true });
    if (activeHashtagFilter) {
      q = q.or(`hashtags.cs.{"${activeHashtagFilter}"},hashtag.eq.${activeHashtagFilter}`);
    }
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
