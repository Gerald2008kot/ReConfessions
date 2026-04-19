// js/explorar.js
// Vista Explorar — feed público sin auth, hashtags en tendencia

import { sb } from './api.js';
import { el, formatDate, showToast } from './utils.js';
import { tagColor } from './shared.js';
import { Icons } from './icons.js';
import { routerPush } from './router.js';
import { HASHTAGS } from './feed.js';

let _onBack = null;
let _onOpenChat = null;

export function initExplorar(onBack, onOpenChat) {
  _onBack = onBack;
  _onOpenChat = onOpenChat;
  document.getElementById('explorar-back-btn')?.addEventListener('click', closeExplorar);
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

export function closeExplorar() { _closeUI(); }

function _closeUI() {
  const view = document.getElementById('view-explorar');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// ── Hashtags en tendencia ────────────────────────────────────
async function loadTrending() {
  const bar = document.getElementById('explorar-trending');
  if (!bar) return;
  while (bar.firstChild) bar.removeChild(bar.firstChild);

  // Contar apariciones en los últimos 7 días
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await sb
    .from('confessions')
    .select('hashtag, hashtags')
    .gte('created_at', since);

  const counts = {};
  data?.forEach(c => {
    const tags = c.hashtags?.length ? c.hashtags : (c.hashtag ? [c.hashtag] : []);
    tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!sorted.length) {
    // fallback: mostrar todos los hashtags
    HASHTAGS.slice(0, 8).forEach(tag => bar.appendChild(buildTrendChip(tag, 0)));
    return;
  }
  sorted.forEach(([tag, count]) => bar.appendChild(buildTrendChip(tag, count)));
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

// ── Feed público ─────────────────────────────────────────────
async function loadPublicFeed(hashtagFilter = null) {
  const feed = document.getElementById('explorar-feed');
  if (!feed) return;
  while (feed.firstChild) feed.removeChild(feed.firstChild);
  feed.appendChild(el('p', { className: 'feed-empty', textContent: 'Cargando…' }));

  let q = sb
    .from('confessions')
    .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
    .order('created_at', { ascending: false })
    .limit(30);

  if (hashtagFilter) {
    q = q.or(`hashtags.cs.{"${hashtagFilter}"},hashtag.eq.${hashtagFilter}`);
  }

  const { data, error } = await q;
  while (feed.firstChild) feed.removeChild(feed.firstChild);

  if (error || !data?.length) {
    feed.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones.' }));
    return;
  }

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, avatar_url').in('id', userIds);
  const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  data.forEach(c => feed.appendChild(buildPublicCard(c, pm[c.user_id])));
}

function buildPublicCard(c, profile) {
  const card = el('article', { className: 'rc-card', attrs: { tabindex: '0' } });

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

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: c.content }));
  card.appendChild(body);

  card.addEventListener('click', () => _onOpenChat?.(c));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') _onOpenChat?.(c); });
  return card;
}
