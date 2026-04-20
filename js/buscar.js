// js/buscar.js — Vista Buscar (inyecta HTML bajo demanda)

import { sb } from './api.js';
import { el, showToast, formatDate } from './utils.js';
import { tagColor } from './shared.js';
import { Icons } from './icons.js';
import { routerPush, routerBack } from './router.js';
import { switchView, openChat as feedOpenChat, setChatViewBackCallback } from './feed.js';

let _onBack        = null;
let _onOpenChat    = null;
let _debounceTimer = null;
let _mounted       = false;

function mountBuscarHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id = 'view-buscar';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
  <header class="buscar-header app-header" style="padding:0">
    <button id="buscar-back-btn" class="app-header__back" type="button" aria-label="Volver" style="flex-shrink:0">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
    <input id="buscar-input" type="search" placeholder="Buscar confesiones…" autocomplete="off" aria-label="Buscar confesiones" />
  </header>
  <div id="buscar-results" style="overflow-y:auto;flex:1;"></div>`;
  document.getElementById('app-root').appendChild(view);
}

export function initBuscar(onBack, onOpenChat) {
  _onBack     = onBack;
  _onOpenChat = onOpenChat;
  mountBuscarHTML();

  document.getElementById('buscar-back-btn')?.addEventListener('click', routerBack);

  const input = document.getElementById('buscar-input');
  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => runSearch(input.value.trim()), 350);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { clearTimeout(_debounceTimer); runSearch(input.value.trim()); }
    });
  }
}

export function openBuscar() {
  const view = document.getElementById('view-buscar');
  if (!view) return;
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  routerPush('buscar', _closeUI);
  setTimeout(() => document.getElementById('buscar-input')?.focus(), 150);
}

export function closeBuscar() { routerBack(); }

function _closeUI() {
  const view = document.getElementById('view-buscar');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// Abre el chat desde buscar y regresa a buscar al cerrar
function _openChatFromBuscar(confession) {
  // 1. Ocultar buscar
  const buscarView = document.getElementById('view-buscar');
  buscarView?.classList.remove('active');
  setTimeout(() => { if (buscarView) buscarView.hidden = true; }, 300);

  // 2. Registrar en feed.js quién debe restaurarse al cerrar el chat
  setChatViewBackCallback(() => {
    document.getElementById('view-feed')?.classList.remove('active');
    const v = document.getElementById('view-buscar');
    if (v) { v.hidden = false; requestAnimationFrame(() => v.classList.add('active')); }
  });

  // 3. Activar chat
  switchView('chat');
  feedOpenChat(confession);
}

async function runSearch(query) {
  const results = document.getElementById('buscar-results');
  if (!results) return;

  if (!query) { while (results.firstChild) results.removeChild(results.firstChild); return; }

  while (results.firstChild) results.removeChild(results.firstChild);
  results.appendChild(el('p', { className: 'feed-empty', textContent: 'Buscando…' }));

  try {
    const { data, error } = await sb
      .from('confessions')
      .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) throw error;

    while (results.firstChild) results.removeChild(results.firstChild);

    if (!data?.length) {
      results.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin resultados.' }));
      return;
    }

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
    const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    const obs = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('rc-card--visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '60px' });

    data.forEach((c, i) => {
      const card = buildResultCard(c, pm[c.user_id], query, i);
      results.appendChild(card);
      obs.observe(card);
    });
  } catch {
    showToast('Error en la búsqueda.', 'error');
  }
}

function buildResultCard(c, profile, query, index) {
  const card = el('article', {
    className: 'rc-card rc-card--compact buscar-card',
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

  const body   = el('div', { className: 'rc-card__body-row' });
  const textEl = el('p', { className: 'rc-card__text buscar-snippet' });
  textEl.innerHTML = highlightMatch(c.content, query);
  body.appendChild(textEl);

  if (c.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb rc-card__thumb--sm' });
    const img   = document.createElement('img');
    img.src = c.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  // Click abre chat regresando a buscar
  const open = () => _openChatFromBuscar(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(escaped, 'gi'), m => `<mark class="buscar-highlight">${m}</mark>`);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
