// js/chat.js
// ============================================================
// Vista de Hilo (Chat) — se activa al abrir una confesión
// ============================================================

import { sb }                         from './api.js';
import { getCurrentUser, getProfile } from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';

let currentUser    = null;
let currentProfile = null;
let activeConfession = null;

let commentListEl, commentInputEl, commentSubmitEl,
    commentLoginPrompt, threadBackBtn,
    threadHashtagEl, threadContentEl, threadAvatarEl,
    threadTimeEl, threadImgEl;

let realtimeCommentChannel = null;
let pollingInterval        = null;
let lastCommentId          = null;

// Callback para volver al feed (lo inyecta feed.js)
let onBackCallback = null;

// ── Init ─────────────────────────────────────────────────────
export async function initChat(onBack) {
  onBackCallback = onBack;

  currentUser = await getCurrentUser();
  if (currentUser) currentProfile = await getProfile(currentUser.id);

  commentListEl      = document.getElementById('chat-comment-list');
  commentInputEl     = document.getElementById('chat-comment-input');
  commentSubmitEl    = document.getElementById('chat-comment-submit');
  commentLoginPrompt = document.getElementById('chat-login-prompt');
  threadBackBtn      = document.getElementById('chat-back-btn');
  threadHashtagEl    = document.getElementById('chat-hashtag');
  threadContentEl    = document.getElementById('chat-confession-text');
  threadAvatarEl     = document.getElementById('chat-avatar');
  threadTimeEl       = document.getElementById('chat-time');
  threadImgEl        = document.getElementById('chat-confession-img');

  threadBackBtn?.addEventListener('click', closeChat);
  initCommentForm();
}

// ── Abrir hilo ────────────────────────────────────────────────
export async function openChat(confession) {
  activeConfession = confession;
  lastCommentId    = null;

  // Renderizar cabecera de la confesión
  if (threadHashtagEl)  threadHashtagEl.textContent  = confession.hashtag || '#Confesión';
  if (threadContentEl)  threadContentEl.textContent  = confession.content;
  if (threadTimeEl)     threadTimeEl.textContent      = formatDate(confession.created_at);

  // Avatar
  renderAvatar(threadAvatarEl, null); // siempre anónimo

  // Imagen adjunta
  if (threadImgEl) {
    if (confession.image_url) {
      threadImgEl.src    = confession.image_url;
      threadImgEl.hidden = false;
    } else {
      threadImgEl.hidden = true;
    }
  }

  // Mostrar/ocultar form de comentario
  const chatForm = document.getElementById('chat-input-bar');
  if (chatForm)           chatForm.hidden     = !currentUser;
  if (commentLoginPrompt) commentLoginPrompt.hidden = !!currentUser;

  // Cargar comentarios
  await loadComments(confession.id);

  // Suscribirse a nuevos comentarios
  startCommentRealtime(confession.id);
}

// ── Cerrar hilo ───────────────────────────────────────────────
export function closeChat() {
  stopCommentRealtime();
  stopPolling();
  activeConfession = null;
  onBackCallback?.();
}

// ── Cargar comentarios ────────────────────────────────────────
async function loadComments(confessionId) {
  while (commentListEl.firstChild) commentListEl.removeChild(commentListEl.firstChild);

  const { data, error } = await sb
    .from('comments')
    .select('id, user_id, content, created_at')
    .eq('confession_id', confessionId)
    .order('created_at', { ascending: true });

  if (error) { showToast('No se pudieron cargar los comentarios.', 'error'); return; }

  if (!data?.length) {
    commentListEl.appendChild(el('p', {
      className:   'chat-empty',
      textContent: 'Sé el primero en responder.',
    }));
    return;
  }

  data.forEach(c => appendBubble(c, false));
  lastCommentId = data[data.length - 1].id;
  scrollToBottom();
}

// ── Renderizar burbuja ────────────────────────────────────────
function appendBubble(comment, animate) {
  if (document.getElementById(`bubble-${comment.id}`)) return;
  commentListEl.querySelector('.chat-empty')?.remove();

  const isOwn = currentUser && comment.user_id === currentUser.id;

  const row = el('div', {
    className: `chat-row${isOwn ? ' chat-row--own' : ''}${animate ? ' chat-row--new' : ''}`,
    attrs:     { id: `bubble-${comment.id}` },
  });

  // Avatar anónimo (solo en mensajes de otros)
  if (!isOwn) {
    const avatar = el('div', { className: 'chat-avatar-sm' });
    renderAvatar(avatar, null);
    row.appendChild(avatar);
  }

  const bubbleWrap = el('div', { className: 'chat-bubble-wrap' });

  const bubble = el('div', {
    className: `chat-bubble${isOwn ? ' chat-bubble--own' : ''}`,
  });
  bubble.appendChild(el('p', { className: 'chat-bubble__text', textContent: comment.content }));

  const time = el('span', {
    className:   'chat-bubble__time',
    textContent: formatDate(comment.created_at),
  });

  // Botón borrar (dueño o admin)
  if (canDelete(comment.user_id)) {
    const delBtn = el('button', {
      className:   'chat-delete-btn',
      textContent: '🗑',
      attrs:       { type: 'button', 'aria-label': 'Borrar' },
    });
    delBtn.addEventListener('click', () => deleteComment(comment.id));
    bubbleWrap.appendChild(delBtn);
  }

  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(time);
  row.appendChild(bubbleWrap);

  // Avatar propio a la derecha
  if (isOwn) {
    const avatar = el('div', { className: 'chat-avatar-sm chat-avatar-sm--own' });
    renderAvatarFromProfile(avatar, currentProfile);
    row.appendChild(avatar);
  }

  commentListEl.appendChild(row);

  if (animate) {
    scrollToBottom();
    row.addEventListener('animationend', () => row.classList.remove('chat-row--new'), { once: true });
  }
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

// ── Formulario de comentario ───────────────────────────────────
function initCommentForm() {
  if (!commentSubmitEl) return;

  const send = async () => {
    if (!currentUser || !activeConfession) return;
    const content = commentInputEl.value.trim();
    if (!content) return;

    commentSubmitEl.disabled = true;
    try {
      const { error } = await sb.from('comments').insert({
        confession_id: activeConfession.id,
        user_id:       currentUser.id,
        content,
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
    realtimeCommentChannel = sb
      .channel(`chat-${confessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `confession_id=eq.${confessionId}` },
        ({ new: row }) => {
          appendBubble(row, true);
          lastCommentId = row.id;
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        ({ old: row }) => { document.getElementById(`bubble-${row.id}`)?.remove(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') stopPolling();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling(confessionId);
      });
  } catch {
    startPolling(confessionId);
  }
}

function stopCommentRealtime() {
  if (realtimeCommentChannel) {
    sb.removeChannel(realtimeCommentChannel);
    realtimeCommentChannel = null;
  }
}

function startPolling(confessionId) {
  stopPolling();
  pollingInterval = setInterval(() => pollComments(confessionId), 10_000);
}
function stopPolling() {
  clearInterval(pollingInterval);
  pollingInterval = null;
}

async function pollComments(confessionId) {
  let baseTime = '1970-01-01T00:00:00Z';
  if (lastCommentId) {
    const { data: ref } = await sb.from('comments').select('created_at').eq('id', lastCommentId).single();
    if (ref) baseTime = ref.created_at;
  }
  const { data } = await sb
    .from('comments')
    .select('id, user_id, content, created_at')
    .eq('confession_id', confessionId)
    .gt('created_at', baseTime)
    .order('created_at', { ascending: true });
  if (data?.length) {
    data.forEach(c => appendBubble(c, true));
    lastCommentId = data[data.length - 1].id;
  }
}

// ── Utils ─────────────────────────────────────────────────────
function canDelete(rowUserId) {
  if (!currentUser) return false;
  return currentUser.id === rowUserId || currentProfile?.is_admin;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    commentListEl.scrollTop = commentListEl.scrollHeight;
  });
}

function renderAvatar(container, profile) {
  while (container.firstChild) container.removeChild(container.firstChild);
  // Siempre anónimo para privacidad
  container.appendChild(el('span', { textContent: '?' }));
}

function renderAvatarFromProfile(container, profile) {
  while (container.firstChild) container.removeChild(container.firstChild);
  if (profile?.avatar_url) {
    const img = document.createElement('img');
    img.src       = profile.avatar_url;
    img.alt       = 'Avatar';
    img.className = 'chat-avatar-img';
    container.appendChild(img);
  } else {
    container.appendChild(el('span', { textContent: getInitials(profile?.full_name || '?') }));
  }
}
