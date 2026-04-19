// js/buscar.js
// Vista Buscar — búsqueda full-text en confesiones

import { sb } from './api.js';
import { el, showToast, formatDate } from './utils.js';
import { tagColor } from './shared.js';
import { Icons } from './icons.js';
import { routerPush } from './router.js';

let _onBack = null;
let _onOpenChat = null;
let _debounceTimer = null;

export function initBuscar(onBack, onOpenChat) {
  _onBack = onBack;
  _onOpenChat = onOpenChat;

  document.getElementById('buscar-back-btn')?.addEventListener('click', closeBuscar);

  const input = document.getElementById('buscar-input');
  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => runSearch(input.value.trim()), 350);
    });
    input.addEventListener('keydown', (e) => {
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

export function closeBuscar() { _closeUI(); }

function _closeUI() {
  const view = document.getElementById('view-buscar');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

async function runSearch(query) {
  const results = document.getElementById('buscar-results');
  if (!results) return;

  if (!query) {
    while (results.firstChild) results.removeChild(results.firstChild);
    return;
  }

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

    // Obtener perfiles
    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    data.forEach(c => results.appendChild(buildResultCard(c, profileMap[c.user_id], query)));
  } catch (err) {
    showToast('Error en la búsqueda.', 'error');
  }
}

function buildResultCard(c, profile, query) {
  const card = el('article', { className: 'rc-card buscar-card', attrs: { tabindex: '0' } });

  const top = el('div', { className: 'rc-card__top' });
  const av = el('div', { className: 'rc-card__avatar' });
  if (profile?.avatar_url) {
    const img = document.createElement('img');
    img.src = profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(Icons.user(14)); }
  top.appendChild(av);

  const tag = c.hashtag || '#Confesión';
  const tc = tagColor(tag);
  top.appendChild(el('span', {
    className: 'rc-card__tag', textContent: tag,
    attrs: { style: `background:${tc.bg};color:${tc.fg}` },
  }));
  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(c.created_at) }));
  card.appendChild(top);

  // Highlight match
  const highlighted = highlightMatch(c.content, query);
  const body = el('div', { className: 'rc-card__body-row' });
  const textEl = el('p', { className: 'rc-card__text buscar-snippet' });
  textEl.innerHTML = highlighted;
  body.appendChild(textEl);
  card.appendChild(body);

  card.addEventListener('click', () => _onOpenChat?.(c));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') _onOpenChat?.(c); });
  return card;
}

function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(
    new RegExp(escaped, 'gi'),
    m => `<mark class="buscar-highlight">${m}</mark>`
  );
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
