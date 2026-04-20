// js/explorar.js — Vista Explorar (inyecta HTML bajo demanda)

import { sb } from './api.js';
import { el, formatDate, showToast } from './utils.js';
import { tagColor } from './shared.js';
import { Icons } from './icons.js';
import { routerPush, routerBack } from './router.js';
import { HASHTAGS, switchView, openChat as feedOpenChat, setChatViewBackCallback } from './feed.js';

let _onBack     = null;
let _onOpenChat = null;
let _mounted    = false;

function mountExplorarHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id = 'view-explorar';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="explorar-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
    <h2 class="app-header__title">Explorar</h2>
    <div style="min-width:44px"></div>
  </header>
  <div style="overflow-y:auto;flex:1;">
    <p class="explorar-section-title">🔥 En tendencia esta semana</p>
    <div id="explorar-trending"></div>
    <p class="explorar-section-title">Confesiones recientes</p>
    <div id="explorar-feed"></div>
  </div>`;
  document.getElementById('app-root').appendChild(view);
}

export function initExplorar(onBack, onOpenChat) {
  _onBack     = onBack;
  _onOpenChat = onOpenChat;
  mountExplorarHTML();
  document.getElementById('explorar-back-btn')?.addEventListener('click', routerBack);
}

export async function openExplorar() {
  const view = document.getElementById('view-explorar');
  if (!view) return;
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  routerPush('explorar', _closeUI);
  await Promise.all([loadTrending(), loadPublicFeed()]);
}

export function closeExplorar() { routerBack(); }

function _closeUI() {
  const view = document.getElementById('view-explorar');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// Abre el chat desde explorar y regresa a explorar al cerrar
function _openChatFromExplorar(confession) {
  // 1. Ocultar explorar
  const explorarView = document.getElementById('view-explorar');
  explorarView?.classList.remove('active');
  setTimeout(() => { if (explorarView) explorarView.hidden = true; }, 300);

  // 2. Registrar en feed.js quién debe restaurarse al cerrar el chat
  setChatViewBackCallback(() => {
    document.getElementById('view-feed')?.classList.remove('active');
    const v = document.getElementById('view-explorar');
    if (v) { v.hidden = false; requestAnimationFrame(() => v.classList.add('active')); }
  });

  // 3. Activar chat
  switchView('chat');
  feedOpenChat(confession);
}

async function loadTrending() {
  const bar = document.getElementById('explorar-trending');
  if (!bar) return;
  while (bar.firstChild) bar.removeChild(bar.firstChild);

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await sb.from('confessions').select('hashtag, hashtags').gte('created_at', since);

  const counts = {};
  data?.forEach(c => {
    const tags = c.hashtags?.length ? c.hashtags : (c.hashtag ? [c.hashtag] : []);
    tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const list = sorted.length ? sorted : HASHTAGS.slice(0, 8).map(t => [t, 0]);
  list.forEach(([tag, count]) => bar.appendChild(buildTrendChip(tag, count)));
}

function buildTrendChip(tag, count) {
  const tc = tagColor(tag);
  const chip = el('button', {
    className: 'explorar-trend-chip',
    attrs: { type: 'button', style: `background:${tc.bg};color:${tc.fg}` },
  });
  chip.appendChild(el('span', { textContent: tag }));
  if (count) chip.appendChild(el('span', { className: 'explorar-trend-count', textContent: String(count) }));
  chip.addEventListener('click', () => loadPublicFeed(tag));
  return chip;
}

async function loadPublicFeed(hashtagFilter = null) {
  const feed = document.getElementById('explorar-feed');
  if (!feed) return;
  while (feed.firstChild) feed.removeChild(feed.firstChild);
  feed.appendChild(el('p', { className: 'feed-empty', textContent: 'Cargando…' }));

  let q = sb
    .from('confessions')
    .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
    .order('created_at', { ascending: false })
    .limit(40);

  if (hashtagFilter) q = q.or(`hashtags.cs.{"${hashtagFilter}"},hashtag.eq.${hashtagFilter}`);

  const { data, error } = await q;
  while (feed.firstChild) feed.removeChild(feed.firstChild);

  if (error || !data?.length) {
    feed.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones.' }));
    return;
  }

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url').in('id', userIds);
  const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('rc-card--visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '60px' });

  data.forEach((c, i) => {
    const card = buildPublicCard(c, pm[c.user_id], i);
    feed.appendChild(card);
    obs.observe(card);
  });
}

function buildPublicCard(c, profile, index) {
  const card = el('article', {
    className: 'rc-card rc-card--compact',
    attrs: { tabindex: '0', style: `animation-delay:${index * 40}ms` },
  });

  const top = el('div', { className: 'rc-card__top' });
  const av  = el('div', { className: 'rc-card__avatar' });
  if (profile?.avatar_url) {
    const img = document.createElement('img');
    img.src = profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(Icons.user(14)); }
  top.appendChild(av);

  const tag = c.hashtag || '#Confesión';
  const tc  = tagColor(tag);
  top.appendChild(el('span', {
    className: 'rc-card__tag', textContent: tag,
    attrs: { style: `background:${tc.bg};color:${tc.fg}` },
  }));
  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(c.created_at) }));
  card.appendChild(top);

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: c.content }));

  if (c.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb rc-card__thumb--sm' });
    const img   = document.createElement('img');
    img.src = c.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  // Click abre chat regresando a explorar
  const open = () => _openChatFromExplorar(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}
