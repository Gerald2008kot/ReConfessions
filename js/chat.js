// js/chat.js
// Cambios: reacciones ocultas (long-press 1s), swipe derecha para responder,
//          quote instantáneo al enviar (optimistic UI), banner reply con SVG

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile }            from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons }                                 from './icons.js';
import { hashtagColor, canDelete as feedCanDelete, canDeleteAsThreadOwner } from './feed.js';
import { toggleSaveThread }                      from './hilos.js';

let currentUser      = null;
let currentProfile   = null;
let activeConfession = null;
let onBackCallback   = null;
let _replyTo         = null; // { id, preview }

let commentListEl, commentInputEl, commentSubmitEl,
    commentLoginPrompt, chatInputBar;

let realtimeChannel = null;
let pollingInterval = null;
let lastCommentId   = null;

// previewMap global para construir quotes al instante
let _previewMap = {};

const REACTIONS = ['👍', '❤️', '😂'];

// SVG flecha reply para el banner
function svgReply(size = 14) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('d', 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3');
  s.appendChild(p);
  return s;
}

// ── Init ─────────────────────────────────────────────────────
export async function initChat(onBack) {
  onBackCallback = onBack;
  currentUser    = await getCurrentUser();
  if (currentUser) currentProfile = await getProfile(currentUser.id);

  commentListEl      = document.getElementById('chat-comment-list');
  commentInputEl     = document.getElementById('chat-comment-input');
  commentSubmitEl    = document.getElementById('chat-comment-submit');
  commentLoginPrompt = document.getElementById('chat-login-prompt');
  chatInputBar       = document.getElementById('chat-input-bar');

  document.getElementById('chat-back-btn')?.addEventListener('click', closeChat);
  initCommentForm();
}

// ── Abrir hilo ────────────────────────────────────────────────
export async function openChat(confession) {
  activeConfession = confession;
  lastCommentId    = null;
  _replyTo         = null;
  _previewMap      = {};

  renderConfessionCard(confession);

  chatInputBar.hidden       = !currentUser;
  commentLoginPrompt.hidden = !!currentUser;

  renderSaveButton(confession.id);
  await loadComments(confession.id);
  startCommentRealtime(confession.id);
}

// ── Botón guardar hilo ────────────────────────────────────────
async function renderSaveButton(confessionId) {
  const slot = document.getElementById('chat-save-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  if (!currentUser) return;

  const { data } = await sb.from('saved_threads')
    .select('id').match({ user_id: currentUser.id, confession_id: confessionId }).maybeSingle();
  const isSaved = !!data;

  const btn = document.createElement('button');
  btn.className = `chat-save-btn${isSaved ? ' chat-save--saved' : ''}`;
  btn.type = 'button';
  btn.setAttribute('aria-label', isSaved ? 'Guardado' : 'Guardar hilo');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('fill', isSaved ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z');
  svg.appendChild(path);
  btn.appendChild(svg);
  btn.addEventListener('click', e => { e.stopPropagation(); toggleSaveThread(confessionId, btn); });
  slot.appendChild(btn);
}

export function closeChat() {
  stopCommentRealtime();
  stopPolling();
  clearReply();
  activeConfession = null;
  _previewMap      = {};
  onBackCallback?.();
}

// ── Confesión card en hilo ────────────────────────────────────
async function renderConfessionCard(confession) {
  const slot = document.getElementById('chat-confession-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);

  let authorProfile = null;
  try {
    const { data: ap } = await sb.from('profiles').select('id, avatar_url').eq('id', confession.user_id).single();
    authorProfile = ap;
  } catch { /* silencioso */ }

  const card = el('div', { className: 'rc-card rc-card--thread' });
  const top = el('div', { className: 'rc-card__top' });
  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url; img.alt = 'Avatar anónimo'; img.loading = 'lazy';
    avatarEl.appendChild(img);
  } else { avatarEl.appendChild(Icons.user(14)); }
  top.appendChild(avatarEl);

  const tag      = confession.hashtag || '#Confesión';
  const tagColor = hashtagColor(tag);
  top.appendChild(el('span', { className: 'rc-card__tag', textContent: tag, attrs: { style: `background:${tagColor.bg};color:${tagColor.fg}` } }));
  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));
  card.appendChild(top);

  const bodyRow = el('div', { className: 'rc-card__body-row' });
  bodyRow.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));
  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img   = document.createElement('img');
    img.src = confession.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    img.addEventListener('click', () => openImageModal(confession.image_url));
    thumb.appendChild(img);
    bodyRow.appendChild(thumb);
  }
  card.appendChild(bodyRow);
  card.style.borderLeft = '3px solid var(--accent)';
  slot.appendChild(card);
}

// ── Modal imagen ──────────────────────────────────────────────
function openImageModal(url) {
  document.getElementById('img-modal')?.remove();
  const overlay = el('div', { className: 'img-modal', attrs: { id: 'img-modal', role: 'dialog', 'aria-modal': 'true' } });
  const img = document.createElement('img');
  img.src = url; img.alt = 'Imagen completa'; img.className = 'img-modal__img';
  const closeBtn = el('button', { className: 'img-modal__close', attrs: { type: 'button' } });
  closeBtn.appendChild(Icons.close(20));
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  overlay.appendChild(closeBtn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}

// ── Cargar comentarios ────────────────────────────────────────
async function loadComments(confessionId) {
  while (commentListEl.firstChild) commentListEl.removeChild(commentListEl.firstChild);

  const { data, error } = await sb
    .from('comments')
    .select('id, user_id, content, created_at')
    .eq('confession_id', confessionId)
    .order('created_at', { ascending: true });

  if (error) { showToast('Error al cargar comentarios.', 'error'); return; }

  if (!data?.length) {
    commentListEl.appendChild(el('p', { className: 'chat-empty', textContent: 'Sé el primero en responder.' }));
    return;
  }

  let commentsWithReply = data.map(c => ({ ...c, reply_to_id: null }));
  try {
    const { data: extended } = await sb
      .from('comments')
      .select('id, reply_to_id')
      .in('id', data.map(c => c.id));
    if (extended) {
      const replyMap = Object.fromEntries(extended.map(r => [r.id, r.reply_to_id]));
      commentsWithReply = data.map(c => ({ ...c, reply_to_id: replyMap[c.id] ?? null }));
    }
  } catch { /* columna no existe aún */ }

  const userIds = [...new Set(commentsWithReply.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
  const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const commentIds = commentsWithReply.map(c => c.id);
  let reactionMap = {};
  try {
    const { data: reactionRows } = await sb
      .from('comment_reactions')
      .select('comment_id, emoji, user_id')
      .in('comment_id', commentIds);
    reactionMap = buildReactionMap(reactionRows || []);
  } catch { /* tabla no existe aún */ }

  // Poblar previewMap global antes de renderizar
  _previewMap = Object.fromEntries(commentsWithReply.map(c => [c.id, c.content.slice(0, 60)]));

  commentsWithReply.forEach(c => appendBubble(c, false, pm[c.user_id] || null, reactionMap[c.id] || {}));
  lastCommentId = commentsWithReply[commentsWithReply.length - 1].id;
  scrollToBottom();
}

function buildReactionMap(rows) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.comment_id]) map[r.comment_id] = {};
    if (!map[r.comment_id][r.emoji]) map[r.comment_id][r.emoji] = { count: 0, users: [] };
    map[r.comment_id][r.emoji].count++;
    map[r.comment_id][r.emoji].users.push(r.user_id);
  });
  return map;
}

// ── Burbuja ───────────────────────────────────────────────────
function appendBubble(comment, animate, profile = null, reactions = {}) {
  if (document.getElementById(`bubble-${comment.id}`)) return;
  commentListEl.querySelector('.chat-empty')?.remove();

  // Registrar en previewMap para quotes instantáneos
  _previewMap[comment.id] = comment.content.slice(0, 60);

  const isOwn = currentUser && comment.user_id === currentUser.id;
  const row = el('div', {
    className: `chat-row${isOwn ? ' chat-row--own' : ''}${animate ? ' chat-row--new' : ''}`,
    attrs: { id: `bubble-${comment.id}` },
  });

  if (!isOwn) {
    const av = el('div', { className: 'chat-avatar-sm' });
    if (profile?.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url; img.alt = 'Avatar'; img.className = 'chat-avatar-img';
      av.appendChild(img);
    } else {
      av.appendChild(Icons.user(12));
    }
    row.appendChild(av);
  }

  const wrap = el('div', { className: 'chat-bubble-wrap' });

  // Quote de reply — se muestra inmediatamente si hay previewMap disponible
  if (comment.reply_to_id && _previewMap[comment.reply_to_id]) {
    const quote = el('div', { className: 'chat-reply-quote', textContent: _previewMap[comment.reply_to_id] });
    wrap.appendChild(quote);
  }

  const bubble = el('div', { className: `chat-bubble${isOwn ? ' chat-bubble--own' : ''}` });
  bubble.appendChild(el('p', { className: 'chat-bubble__text', textContent: comment.content }));

  const canDel = feedCanDelete(comment.user_id) || canDeleteAsThreadOwner(activeConfession?.user_id);
  if (canDel) {
    const delBtn = el('button', { className: 'chat-delete-btn', attrs: { type: 'button', 'aria-label': 'Borrar' } });
    delBtn.appendChild(Icons.trash(12));
    delBtn.addEventListener('click', () => deleteComment(comment.id, comment.user_id));
    wrap.appendChild(delBtn);
  }

  wrap.appendChild(bubble);
  wrap.appendChild(el('span', { className: 'chat-bubble__time', textContent: formatDate(comment.created_at) }));

  // Reacciones — ocultas por defecto, long-press 1s para mostrar/ocultar
  const reactionBar = buildReactionBar(comment.id, reactions);
  reactionBar.classList.add('chat-reaction-bar--hidden');
  wrap.appendChild(reactionBar);

  // Botón Responder
  if (currentUser) {
    const replyBtn = el('button', { className: 'chat-reply-btn', textContent: 'Responder', attrs: { type: 'button' } });
    replyBtn.addEventListener('click', (e) => { e.stopPropagation(); setReplyTo(comment.id, comment.content); });
    wrap.appendChild(replyBtn);
  }

  row.appendChild(wrap);

  if (isOwn) {
    const av = el('div', { className: 'chat-avatar-sm chat-avatar-sm--own' });
    if (currentProfile?.avatar_url) {
      const img = document.createElement('img');
      img.src = currentProfile.avatar_url; img.alt = 'Tu avatar'; img.className = 'chat-avatar-img';
      av.appendChild(img);
    } else {
      av.appendChild(el('span', { textContent: getInitials(currentProfile?.full_name || '?'), className: 'chat-avatar-sm__initials' }));
    }
    row.appendChild(av);
  }

  // Long-press 1s sobre la burbuja → toggle reacciones
  attachLongPress(bubble, () => reactionBar.classList.toggle('chat-reaction-bar--hidden'));

  // Swipe derecha → responder
  if (currentUser) {
    attachSwipeReply(row, wrap, () => setReplyTo(comment.id, comment.content));
  }

  commentListEl.appendChild(row);
  if (animate) scrollToBottom();
}

// ── Long-press helper ─────────────────────────────────────────
function attachLongPress(target, callback) {
  let timer = null;
  let moved = false;

  const start = () => { moved = false; timer = setTimeout(() => { if (!moved) callback(); }, 1000); };
  const cancel = () => { clearTimeout(timer); timer = null; };
  const move = () => { moved = true; cancel(); };

  target.addEventListener('touchstart',   start,  { passive: true });
  target.addEventListener('touchend',     cancel);
  target.addEventListener('touchmove',    move,   { passive: true });
  target.addEventListener('mousedown',    start);
  target.addEventListener('mouseup',      cancel);
  target.addEventListener('mousemove',    move);
  target.addEventListener('mouseleave',   cancel);
  target.addEventListener('contextmenu',  (e) => e.preventDefault());
}

// ── Swipe derecha para responder ─────────────────────────────
function attachSwipeReply(row, wrap, onReply) {
  let startX = 0, startY = 0;
  let isDragging = false, triggered = false;
  const THRESHOLD = 60;

  row.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
    triggered = false;
  }, { passive: true });

  row.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!isDragging && Math.abs(dy) > Math.abs(dx)) return; // scroll vertical → ignorar
    isDragging = true;
    if (dx <= 0) { wrap.style.transform = ''; return; } // solo a la derecha

    const clamped = Math.min(dx, THRESHOLD + 20);
    wrap.style.transform  = `translateX(${clamped}px)`;
    wrap.style.transition = 'none';

    if (dx >= THRESHOLD && !triggered) {
      triggered = true;
      wrap.classList.add('chat-bubble-wrap--swipe');
    } else if (dx < THRESHOLD) {
      triggered = false;
      wrap.classList.remove('chat-bubble-wrap--swipe');
    }
  }, { passive: true });

  row.addEventListener('touchend', () => {
    wrap.style.transition = 'transform 0.2s ease';
    wrap.style.transform  = 'translateX(0)';
    wrap.classList.remove('chat-bubble-wrap--swipe');
    if (triggered) onReply();
    isDragging = false;
  });
}

// ── Reacciones ────────────────────────────────────────────────
function buildReactionBar(commentId, reactions) {
  const bar = el('div', { className: 'chat-reaction-bar' });

  REACTIONS.forEach(emoji => {
    const info = reactions[emoji];
    const count = info?.count || 0;
    const userReacted = currentUser && info?.users.includes(currentUser.id);

    const btn = el('button', {
      className: `chat-reaction-btn${userReacted ? ' chat-reaction-btn--active' : ''}`,
      attrs: { type: 'button', 'aria-label': emoji, title: emoji },
    });
    const countEl = el('span', { className: 'chat-reaction-count' });
    countEl.textContent = count > 0 ? `${emoji} ${count}` : emoji;
    btn.appendChild(countEl);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReaction(commentId, emoji, btn, countEl, reactions);
    });
    bar.appendChild(btn);
  });

  return bar;
}

async function toggleReaction(commentId, emoji, btn, countEl, reactions) {
  if (!currentUser) { showToast('Inicia sesión para reaccionar.', 'info'); return; }

  const info = reactions[emoji] || { count: 0, users: [] };
  const userReacted = info.users.includes(currentUser.id);

  if (userReacted) {
    await sb.from('comment_reactions').delete().match({ comment_id: commentId, user_id: currentUser.id, emoji });
    info.count = Math.max(0, info.count - 1);
    info.users = info.users.filter(u => u !== currentUser.id);
    btn.classList.remove('chat-reaction-btn--active');
  } else {
    await sb.from('comment_reactions').upsert({ comment_id: commentId, user_id: currentUser.id, emoji });
    info.count++;
    info.users.push(currentUser.id);
    btn.classList.add('chat-reaction-btn--active');
  }
  reactions[emoji] = info;
  countEl.textContent = info.count > 0 ? `${emoji} ${info.count}` : emoji;
}

// ── Reply ─────────────────────────────────────────────────────
function setReplyTo(commentId, content) {
  _replyTo = { id: commentId, preview: content.slice(0, 60) };

  let banner = document.getElementById('chat-reply-banner');
  if (!banner) {
    banner = el('div', { className: 'chat-reply-banner', attrs: { id: 'chat-reply-banner' } });

    const iconWrap = el('span', { className: 'chat-reply-banner__icon' });
    iconWrap.appendChild(svgReply(14));

    const previewEl  = el('span', { className: 'chat-reply-banner__preview' });
    const cancelBtn  = el('button', { className: 'chat-reply-banner__cancel', attrs: { type: 'button', 'aria-label': 'Cancelar respuesta' } });
    cancelBtn.appendChild(Icons.close(12));
    cancelBtn.addEventListener('click', clearReply);

    banner.appendChild(iconWrap);
    banner.appendChild(previewEl);
    banner.appendChild(cancelBtn);
    chatInputBar?.insertBefore(banner, chatInputBar.firstChild);
  }

  banner.querySelector('.chat-reply-banner__preview').textContent = _replyTo.preview;
  banner.hidden = false;
  commentInputEl?.focus();
}

function clearReply() {
  _replyTo = null;
  const banner = document.getElementById('chat-reply-banner');
  if (banner) banner.hidden = true;
}

// ── Borrar comentario ─────────────────────────────────────────
async function deleteComment(id, commentUserId) {
  if (!confirm('¿Borrar este comentario?')) return;
  const isAdmin       = !!currentProfile?.is_admin;
  const isOwnComment  = currentUser?.id === commentUserId;
  const isThreadOwner = !isOwnComment && currentUser?.id === activeConfession?.user_id;
  let error;
  if (isAdmin)            { ({ error } = await sb.rpc('admin_delete_comment', { p_comment_id: id })); }
  else if (isThreadOwner) { ({ error } = await sb.rpc('thread_owner_delete_comment', { p_comment_id: id })); }
  else                    { ({ error } = await sb.from('comments').delete().eq('id', id)); }
  if (error) { showToast(error.message, 'error'); return; }
  document.getElementById(`bubble-${id}`)?.remove();
  showToast('Comentario eliminado.', 'success');
  if (!commentListEl.querySelector('.chat-row')) {
    commentListEl.appendChild(el('p', { className: 'chat-empty', textContent: 'Sé el primero en responder.' }));
  }
}

// ── Formulario comentario ─────────────────────────────────────
function initCommentForm() {
  if (!commentSubmitEl) return;

  const send = async () => {
    if (!currentUser || !activeConfession) return;
    const content = commentInputEl.value.trim();
    if (!content) return;

    // Capturar reply antes de limpiar
    const replySnapshot = _replyTo ? { ..._replyTo } : null;

    commentSubmitEl.disabled = true;
    commentInputEl.value = '';
    clearReply();

    // Optimistic UI: mostrar burbuja al instante con id temporal
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      user_id: currentUser.id,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replySnapshot?.id ?? null,
    };
    appendBubble(optimistic, true, currentProfile || null, {});

    try {
      const insertData = { confession_id: activeConfession.id, user_id: currentUser.id, content };
      if (replySnapshot?.id) insertData.reply_to_id = replySnapshot.id;

      const { data: inserted, error } = await sb.from('comments').insert(insertData).select('id').single();
      if (error) throw new Error(error.message);

      // Reemplazar id temporal por el real para evitar duplicado en realtime
      if (inserted?.id) {
        const tempEl = document.getElementById(`bubble-${tempId}`);
        if (tempEl) {
          tempEl.id = `bubble-${inserted.id}`;
          _previewMap[inserted.id] = content.slice(0, 60);
          delete _previewMap[tempId];
        }
        lastCommentId = inserted.id;
      }
    } catch (err) {
      // Revertir burbuja optimista
      document.getElementById(`bubble-${tempId}`)?.remove();
      showToast(err.message, 'error');
      commentInputEl.value = content;
      if (replySnapshot) setReplyTo(replySnapshot.id, replySnapshot.preview);
    } finally {
      commentSubmitEl.disabled = false;
      commentInputEl.focus();
    }
  };

  commentSubmitEl.addEventListener('click', send);
  commentInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ── Realtime ──────────────────────────────────────────────────
function startCommentRealtime(confessionId) {
  stopCommentRealtime();
  try {
    realtimeChannel = sb.channel(`chat-${confessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `confession_id=eq.${confessionId}` },
        async ({ new: row }) => {
          // Si ya existe por id real, ignorar
          if (document.getElementById(`bubble-${row.id}`)) return;
          // Si hay burbuja temporal propia con el mismo contenido, promoverla
          if (currentUser && row.user_id === currentUser.id) {
            const tempEl = [...commentListEl.querySelectorAll('[id^="bubble-temp-"]')]
              .find(b => b.querySelector('.chat-bubble__text')?.textContent === row.content);
            if (tempEl) { tempEl.id = `bubble-${row.id}`; lastCommentId = row.id; return; }
          }
          const { data: p } = await sb.from('profiles').select('id, avatar_url, full_name').eq('id', row.user_id).maybeSingle();
          appendBubble(row, true, p || null, {});
          lastCommentId = row.id;
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        ({ old: row }) => { if (row?.id) document.getElementById(`bubble-${row.id}`)?.remove(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') stopPolling();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling(confessionId);
      });
  } catch { startPolling(confessionId); }
}

function stopCommentRealtime() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
}

function startPolling(confessionId) {
  stopPolling();
  pollingInterval = setInterval(async () => {
    let baseTime = '1970-01-01T00:00:00Z';
    if (lastCommentId) {
      const { data: ref } = await sb.from('comments').select('created_at').eq('id', lastCommentId).single();
      if (ref) baseTime = ref.created_at;
    }
    const { data } = await sb.from('comments')
      .select('id, user_id, content, created_at, reply_to_id')
      .eq('confession_id', confessionId)
      .gt('created_at', baseTime)
      .order('created_at', { ascending: true });
    if (data?.length) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
      const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      data.forEach(c => appendBubble(c, true, pm[c.user_id] || null, {}));
      lastCommentId = data[data.length - 1].id;
    }
  }, 10_000);
}

function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }
function scrollToBottom() { requestAnimationFrame(() => { commentListEl.scrollTop = commentListEl.scrollHeight; }); }
