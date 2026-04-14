// js/chat.js
// ============================================================
// Vista de Hilo — misma estructura compacta que rc-card
// ============================================================

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile }            from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { Icons }                                 from './icons.js';
import { hashtagColor, canDelete as feedCanDelete } from './feed.js';

let currentUser      = null;
let currentProfile   = null;
let activeConfession = null;
let onBackCallback   = null;

let commentListEl, commentInputEl, commentSubmitEl,
    commentLoginPrompt, chatInputBar;

let realtimeChannel = null;
let pollingInterval = null;
let lastCommentId   = null;

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

  // Renderizar la confesión original con el mismo estilo de rc-card compacta
  renderConfessionCard(confession);

  chatInputBar.hidden       = !currentUser;
  commentLoginPrompt.hidden = !!currentUser;

  await loadComments(confession.id);
  startCommentRealtime(confession.id);
}

export function closeChat() {
  stopCommentRealtime();
  stopPolling();
  activeConfession = null;
  onBackCallback?.();  // feed.js callback calls switchView('feed', false)
}

// ── Renderizar card de la confesión en el hilo ────────────────
async function renderConfessionCard(confession) {
  const slot = document.getElementById('chat-confession-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);

  // Obtener perfil del autor — avatar visible para todos (sin revelar nombre)
  let authorProfile = null;
  try {
    const { data: ap } = await sb.from('profiles').select('id, avatar_url').eq('id', confession.user_id).single();
    authorProfile = ap;
  } catch { /* silencioso */ }

  // Reutiliza la misma estructura visual que buildCard del feed
  const card = el('div', { className: 'rc-card rc-card--thread' });

  // Top row
  const top = el('div', { className: 'rc-card__top' });
  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src     = authorProfile.avatar_url;
    img.alt     = 'Avatar anónimo';
    img.loading = 'lazy';
    avatarEl.appendChild(img);
  } else {
    avatarEl.appendChild(Icons.user(14));
  }
  top.appendChild(avatarEl);

  const tag      = confession.hashtag || '#Confesión';
  const tagColor = hashtagColor(tag);
  top.appendChild(el('span', {
    className:   'rc-card__tag',
    textContent: tag,
    attrs:       { style: `background:${tagColor.bg};color:${tagColor.fg}` },
  }));
  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));
  card.appendChild(top);

  // Body + thumbnail
  const bodyRow = el('div', { className: 'rc-card__body-row' });
  bodyRow.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img   = document.createElement('img');
    img.src     = confession.image_url;
    img.alt     = 'Imagen';
    img.loading = 'lazy';
    img.addEventListener('click', () => openImageModal(confession.image_url));
    thumb.appendChild(img);
    bodyRow.appendChild(thumb);
  }
  card.appendChild(bodyRow);

  // Barra de acento violeta izquierda
  card.style.borderLeft = '3px solid var(--accent)';

  slot.appendChild(card);
}

// ── Modal imagen ──────────────────────────────────────────────
function openImageModal(url) {
  const existing = document.getElementById('img-modal');
  if (existing) existing.remove();

  const overlay = el('div', {
    className: 'img-modal',
    attrs:     { id: 'img-modal', role: 'dialog', 'aria-modal': 'true' },
  });
  const img = document.createElement('img');
  img.src = url; img.alt = 'Imagen completa'; img.className = 'img-modal__img';

  const closeBtn = el('button', { className: 'img-modal__close', attrs: { type: 'button' } });
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

  data.forEach(c => appendBubble(c, false));
  lastCommentId = data[data.length - 1].id;
  scrollToBottom();
}

// ── Burbuja ───────────────────────────────────────────────────
function appendBubble(comment, animate) {
  if (document.getElementById(`bubble-${comment.id}`)) return;
  commentListEl.querySelector('.chat-empty')?.remove();

  const isOwn = currentUser && comment.user_id === currentUser.id;

  const row = el('div', {
    className: `chat-row${isOwn ? ' chat-row--own' : ''}${animate ? ' chat-row--new' : ''}`,
    attrs:     { id: `bubble-${comment.id}` },
  });

  // Avatar del otro
  if (!isOwn) {
    const av = el('div', { className: 'chat-avatar-sm' });
    av.appendChild(Icons.user(12));
    row.appendChild(av);
  }

  const wrap = el('div', { className: 'chat-bubble-wrap' });

  const bubble = el('div', { className: `chat-bubble${isOwn ? ' chat-bubble--own' : ''}` });
  bubble.appendChild(el('p', { className: 'chat-bubble__text', textContent: comment.content }));

  if (feedCanDelete(comment.user_id)) {
    const delBtn = el('button', {
      className: 'chat-delete-btn',
      attrs:     { type: 'button', 'aria-label': 'Borrar' },
    });
    delBtn.appendChild(Icons.trash(12));
    delBtn.addEventListener('click', () => deleteComment(comment.id));
    wrap.appendChild(delBtn);
  }

  wrap.appendChild(bubble);
  wrap.appendChild(el('span', { className: 'chat-bubble__time', textContent: formatDate(comment.created_at) }));
  row.appendChild(wrap);

  // Avatar propio
  if (isOwn) {
    const av = el('div', { className: 'chat-avatar-sm chat-avatar-sm--own' });
    if (currentProfile?.avatar_url) {
      const img = document.createElement('img');
      img.src = currentProfile.avatar_url; img.alt = 'Tu avatar';
      img.className = 'chat-avatar-img';
      av.appendChild(img);
    } else {
      av.appendChild(el('span', { textContent: getInitials(currentProfile?.full_name || '?'), className: 'chat-avatar-sm__initials' }));
    }
    row.appendChild(av);
  }

  commentListEl.appendChild(row);
  if (animate) scrollToBottom();
}

// ── Borrar comentario ─────────────────────────────────────────
async function deleteComment(id) {
  if (!confirm('¿Borrar este comentario?')) return;
  const { error } = await sb.from('comments').delete().eq('id', id);
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
    commentSubmitEl.disabled = true;
    try {
      const { error } = await sb.from('comments').insert({
        confession_id: activeConfession.id, user_id: currentUser.id, content,
      });
      if (error) throw new Error(error.message);
      commentInputEl.value = '';
    } catch (err) {
      showToast(err.message, 'error');
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
        ({ new: row }) => { appendBubble(row, true); lastCommentId = row.id; })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        ({ old: row }) => document.getElementById(`bubble-${row.id}`)?.remove())
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
      .select('id, user_id, content, created_at')
      .eq('confession_id', confessionId).gt('created_at', baseTime).order('created_at', { ascending: true });
    if (data?.length) { data.forEach(c => appendBubble(c, true)); lastCommentId = data[data.length-1].id; }
  }, 10_000);
}

function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }
function scrollToBottom() { requestAnimationFrame(() => { commentListEl.scrollTop = commentListEl.scrollHeight; }); }
