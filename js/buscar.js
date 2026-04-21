// js/buscar.js
// ============================================================
// Vista Buscar — fusión con explorar.js
// Al abrir muestra la vista de Explorar (trending + feed público)
// Al escribir activa el buscador dual (usuarios + contenido).
// Sección Popular con ranking filtrado por periodo.
// ============================================================

import { sb }                                          from './api.js';
import { el, showToast, formatDate }                   from './utils.js';
import { tagColor }                                    from './shared.js';
import { Icons }                                       from './icons.js';
import { routerPush, routerBack }                      from './router.js';
import { HASHTAGS, switchView, openChat as feedOpenChat,
         setChatViewBackCallback }                      from './feed.js';

let _onBack        = null;
let _debounceTimer = null;
let _mounted       = false;
let _rankingPeriod = 'all';   // 'today' | 'week' | 'all'
let _openAutor     = null;    // callback inyectado desde index

// ── Montar HTML ───────────────────────────────────────────────
function mountBuscarHTML() {
  if (_mounted) return;
  _mounted = true;
  const view = document.createElement('div');
  view.id        = 'view-buscar';
  view.className = 'view';
  view.hidden    = true;
  view.innerHTML = `
  <!-- HEADER con búsqueda -->
  <header class="buscar-header app-header" style="padding:0">
    <button id="buscar-back-btn" class="app-header__back" type="button" aria-label="Volver" style="flex-shrink:0">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <div class="buscar-input-wrap" style="flex:1;position:relative">
      <svg class="buscar-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/>
      </svg>
      <input id="buscar-input" type="search" placeholder="Buscar usuarios o confesiones…"
        autocomplete="off" aria-label="Buscar" />
    </div>
  </header>

  <!-- TABS de secciones (visible solo cuando no se busca) -->
  <div id="buscar-tabs" class="buscar-tabs">
    <button id="buscar-tab-explorar" class="buscar-tab buscar-tab--active" type="button">Explorar</button>
    <button id="buscar-tab-popular"  class="buscar-tab"                   type="button">Popular</button>
  </div>

  <!-- PANEL EXPLORAR -->
  <div id="buscar-panel-explorar" class="buscar-panel" style="overflow-y:auto;flex:1;">
    <p class="explorar-section-title">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="vertical-align:middle;margin-right:4px">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/>
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z"/>
      </svg>
      En tendencia esta semana
    </p>
    <div id="buscar-trending" style="padding:0 12px 8px;display:flex;flex-wrap:wrap;gap:8px"></div>
    <p class="explorar-section-title">Confesiones recientes</p>
    <div id="buscar-public-feed"></div>
  </div>

  <!-- PANEL POPULAR (rankings) -->
  <div id="buscar-panel-popular" class="buscar-panel" hidden style="overflow-y:auto;flex:1;">
    <div class="buscar-ranking-filters">
      <button class="buscar-period-btn"                 type="button" data-period="today">Hoy</button>
      <button class="buscar-period-btn"                 type="button" data-period="week">Esta semana</button>
      <button class="buscar-period-btn buscar-period-btn--active" type="button" data-period="all">Todo el tiempo</button>
    </div>
    <div id="buscar-ranking-list" style="padding:0 12px"></div>
  </div>

  <!-- PANEL RESULTADOS DE BÚSQUEDA (visible cuando se escribe) -->
  <div id="buscar-results-panel" class="buscar-panel" hidden style="overflow-y:auto;flex:1;"></div>`;

  document.getElementById('app-root').appendChild(view);
}

// ── Init ──────────────────────────────────────────────────────
export function initBuscar(onBack, openAutorFn) {
  _onBack     = onBack;
  _openAutor  = openAutorFn;
  mountBuscarHTML();

  document.getElementById('buscar-back-btn')?.addEventListener('click', routerBack);

  // Tabs explorar / popular
  document.getElementById('buscar-tab-explorar')?.addEventListener('click', () => _switchTab('explorar'));
  document.getElementById('buscar-tab-popular')?.addEventListener('click',  () => _switchTab('popular'));

  // Filtros de periodo en ranking
  document.querySelectorAll('.buscar-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.buscar-period-btn').forEach(b => b.classList.remove('buscar-period-btn--active'));
      btn.classList.add('buscar-period-btn--active');
      _rankingPeriod = btn.dataset.period;
      loadRanking(_rankingPeriod);
    });
  });

  // Búsqueda
  const input = document.getElementById('buscar-input');
  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      const q = input.value.trim();
      if (!q) {
        _showSearchPanel(false);
        return;
      }
      _showSearchPanel(true);
      _debounceTimer = setTimeout(() => runSearch(q), 350);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(_debounceTimer);
        const q = input.value.trim();
        if (q) { _showSearchPanel(true); runSearch(q); }
      }
    });
  }
}

function _switchTab(tab) {
  ['explorar', 'popular'].forEach(t => {
    document.getElementById(`buscar-tab-${t}`)?.classList.toggle('buscar-tab--active', t === tab);
    document.getElementById(`buscar-panel-${t}`)?.toggleAttribute('hidden', t !== tab);
  });
  if (tab === 'popular') loadRanking(_rankingPeriod);
}

function _showSearchPanel(show) {
  document.getElementById('buscar-tabs')?.toggleAttribute('hidden', show);
  document.getElementById('buscar-panel-explorar')?.toggleAttribute('hidden', true);
  document.getElementById('buscar-panel-popular')?.toggleAttribute('hidden', true);
  document.getElementById('buscar-results-panel')?.toggleAttribute('hidden', !show);

  if (!show) {
    // Restaurar tab activo
    const activeTab = document.querySelector('.buscar-tab--active');
    const t = activeTab?.id?.replace('buscar-tab-', '') || 'explorar';
    document.getElementById('buscar-tabs')?.removeAttribute('hidden');
    document.getElementById(`buscar-panel-${t}`)?.removeAttribute('hidden');
  }
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openBuscar() {
  const view = document.getElementById('view-buscar');
  if (!view) return;
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));
  routerPush('buscar', _closeUI);
  // Reset búsqueda
  const input = document.getElementById('buscar-input');
  if (input) input.value = '';
  _showSearchPanel(false);
  _switchTab('explorar');
  setTimeout(() => input?.focus(), 150);
  await Promise.all([loadTrending(), loadPublicFeed()]);
}

export function closeBuscar() { routerBack(); }

function _closeUI() {
  const view = document.getElementById('view-buscar');
  view?.classList.remove('active');
  setTimeout(() => { if (view) view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// ── Explorar: Trending ────────────────────────────────────────
async function loadTrending() {
  const bar = document.getElementById('buscar-trending');
  if (!bar) return;
  bar.innerHTML = '';

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await sb.from('confessions').select('hashtag, hashtags').gte('created_at', since);

  const counts = {};
  data?.forEach(c => {
    const tags = c.hashtags?.length ? c.hashtags : (c.hashtag ? [c.hashtag] : []);
    tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const list   = sorted.length ? sorted : HASHTAGS.slice(0, 8).map(t => [t, 0]);
  list.forEach(([tag, count]) => bar.appendChild(_buildTrendChip(tag, count)));
}

function _buildTrendChip(tag, count) {
  const tc   = tagColor(tag);
  const chip = el('button', {
    className: 'explorar-trend-chip',
    attrs: { type: 'button', style: `background:${tc.bg};color:${tc.fg}` },
  });
  chip.appendChild(el('span', { textContent: tag }));
  if (count) chip.appendChild(el('span', { className: 'explorar-trend-count', textContent: String(count) }));
  chip.addEventListener('click', () => loadPublicFeed(tag));
  return chip;
}

// ── Explorar: Feed público ────────────────────────────────────
async function loadPublicFeed(hashtagFilter = null) {
  const feed = document.getElementById('buscar-public-feed');
  if (!feed) return;
  feed.innerHTML = '<p class="feed-empty">Cargando…</p>';

  let q = sb
    .from('confessions')
    .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
    .order('created_at', { ascending: false })
    .limit(40);

  if (hashtagFilter) q = q.or(`hashtags.cs.{"${hashtagFilter}"},hashtag.eq.${hashtagFilter}`);

  const { data, error } = await q;
  feed.innerHTML = '';

  if (error || !data?.length) {
    feed.innerHTML = '<p class="feed-empty">Sin confesiones.</p>';
    return;
  }

  const userIds = [...new Set(data.map(c => c.user_id))];
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, avatar_url, reg_number')
    .in('id', userIds);
  const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('rc-card--visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '60px' });

  data.forEach((c, i) => {
    const card = _buildPublicCard(c, pm[c.user_id], i);
    feed.appendChild(card);
    obs.observe(card);
  });
}

function _buildPublicCard(c, profile, index) {
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
  } else {
    av.appendChild(Icons.user(14));
  }

  // Click en avatar abre autor
  if (c.user_id && _openAutor) {
    av.style.cursor = 'pointer';
    av.addEventListener('click', e => { e.stopPropagation(); _openAutor(c.user_id); });
  }
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

  const open = () => _openChatFromBuscar(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

// ── Popular: Ranking ──────────────────────────────────────────
export async function loadRanking(period = 'all') {
  const list = document.getElementById('buscar-ranking-list');
  if (!list) return;
  list.innerHTML = '<p class="feed-empty">Cargando ranking…</p>';

  const { data, error } = await sb.rpc('get_user_rankings', {
    p_period: period,
    p_limit:  20,
  });

  list.innerHTML = '';
  if (error || !data?.length) {
    list.innerHTML = '<p class="feed-empty">Sin datos de ranking.</p>';
    return;
  }

  data.forEach((row, i) => list.appendChild(_buildRankingCard(row, i)));
}

function _buildRankingCard(row, index) {
  const card = el('div', {
    className: 'buscar-ranking-card rc-card--compact',
    attrs: { style: `animation-delay:${index * 40}ms` },
  });

  // Posición
  const pos = el('div', { className: 'buscar-ranking-pos' });
  if (index < 3) {
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    pos.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="${colors[index]}" aria-hidden="true">
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
    </svg>`;
  } else {
    pos.textContent = `#${index + 1}`;
    pos.style.cssText = 'font-size:0.75rem;font-weight:700;opacity:0.5;min-width:24px;text-align:center';
  }
  card.appendChild(pos);

  // Avatar
  const av = el('div', { className: 'rc-card__avatar', style: 'cursor:pointer' });
  if (row.avatar_url) {
    const img = document.createElement('img');
    img.src = row.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else {
    av.appendChild(Icons.user(14));
  }
  if (_openAutor) av.addEventListener('click', () => _openAutor(row.user_id));

  card.appendChild(av);

  // Info
  const info = el('div', { className: 'buscar-ranking-info', style: 'flex:1;min-width:0' });
  const alias = el('p', {
    className: 'buscar-ranking-alias',
    textContent: `Anonymous_${row.reg_number}`,
    attrs: { style: 'font-weight:600;font-size:0.85rem;margin:0;cursor:pointer' },
  });
  if (_openAutor) alias.addEventListener('click', () => _openAutor(row.user_id));
  info.appendChild(alias);

  const meta = el('p', {
    className: 'buscar-ranking-meta',
    attrs: { style: 'font-size:0.72rem;opacity:0.55;margin:2px 0 0;display:flex;gap:10px' },
  });
  meta.innerHTML = `
    <span>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:middle">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
      </svg>
      ${_fmt(row.follower_count)}
    </span>
    <span>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:middle">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
      </svg>
      ${_fmt(row.post_count)}
    </span>
    <span>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true" style="vertical-align:middle;color:#e05">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"/>
      </svg>
      ${_fmt(row.total_likes)}
    </span>`;
  info.appendChild(meta);
  card.appendChild(info);

  return card;
}

// ── Búsqueda dual ─────────────────────────────────────────────
async function runSearch(query) {
  const panel = document.getElementById('buscar-results-panel');
  if (!panel) return;
  panel.innerHTML = '<p class="feed-empty">Buscando…</p>';

  try {
    const [userResults, postResults] = await Promise.all([
      _searchUsers(query),
      _searchPosts(query),
    ]);

    panel.innerHTML = '';

    // Sección usuarios
    if (userResults.length) {
      panel.appendChild(el('p', {
        className: 'explorar-section-title',
        textContent: 'Usuarios',
      }));
      userResults.forEach((u, i) => panel.appendChild(_buildUserResult(u, i)));
    }

    // Sección posts
    if (postResults.length) {
      panel.appendChild(el('p', {
        className: 'explorar-section-title',
        textContent: 'Publicaciones',
      }));
      const userIds = [...new Set(postResults.map(c => c.user_id))];
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, avatar_url, reg_number')
        .in('id', userIds);
      const pm = Object.fromEntries((profiles || []).map(p => [p.id, p]));

      const obs = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('rc-card--visible');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '60px' });

      postResults.forEach((c, i) => {
        const card = _buildResultCard(c, pm[c.user_id], query, i);
        panel.appendChild(card);
        obs.observe(card);
      });
    }

    if (!userResults.length && !postResults.length) {
      panel.innerHTML = '<p class="feed-empty">Sin resultados.</p>';
    }
  } catch {
    showToast('Error en la búsqueda.', 'error');
  }
}

async function _searchUsers(query) {
  // Buscar por reg_number si el query es "Anonymous_N" o solo el número
  const isRegSearch = /^anonymous_?(\d+)$/i.test(query) || /^\d+$/.test(query);
  let q = sb
    .from('profiles')
    .select('id, full_name, avatar_url, reg_number, is_admin')
    .limit(10);

  if (isRegSearch) {
    const num = parseInt(query.replace(/\D/g, ''), 10);
    q = q.eq('reg_number', num);
  } else {
    q = q.ilike('full_name', `%${query}%`);
  }

  const { data } = await q;
  return data || [];
}

async function _searchPosts(query) {
  const { data } = await sb
    .from('confessions')
    .select('id, user_id, content, hashtag, hashtags, created_at, image_url')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}

function _buildUserResult(u, index) {
  const card = el('div', {
    className: 'buscar-user-result',
    attrs: { tabindex: '0', style: `animation-delay:${index * 40}ms;cursor:pointer` },
  });

  const av = el('div', { className: 'rc-card__avatar' });
  if (u.avatar_url) {
    const img = document.createElement('img');
    img.src = u.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(Icons.user(16)); }
  card.appendChild(av);

  const info  = el('div', { className: 'buscar-user-info', style: 'flex:1;min-width:0' });
  const alias = u.reg_number
    ? `Anonymous_${u.reg_number}`
    : (u.full_name || 'Usuario');
  info.appendChild(el('p', {
    className: 'buscar-user-alias',
    textContent: alias,
    attrs: { style: 'font-weight:600;font-size:0.85rem;margin:0' },
  }));
  if (u.is_admin) {
    info.appendChild(el('span', {
      className: 'admin-badge admin-badge--admin',
      textContent: 'Admin',
      attrs: { style: 'font-size:0.65rem' },
    }));
  }
  card.appendChild(info);

  const chevron = el('span', { attrs: { 'aria-hidden': 'true' } });
  chevron.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>`;
  card.appendChild(chevron);

  const open = () => { if (_openAutor) _openAutor(u.id); };
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

function _buildResultCard(c, profile, query, index) {
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

  if (c.user_id && _openAutor) {
    av.style.cursor = 'pointer';
    av.addEventListener('click', e => { e.stopPropagation(); _openAutor(c.user_id); });
  }
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
  textEl.innerHTML = _highlightMatch(c.content, query);
  body.appendChild(textEl);

  if (c.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb rc-card__thumb--sm' });
    const img   = document.createElement('img');
    img.src = c.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  const open = () => _openChatFromBuscar(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

// ── Abrir chat desde buscar ───────────────────────────────────
function _openChatFromBuscar(confession) {
  const buscarView = document.getElementById('view-buscar');
  buscarView?.classList.remove('active');
  setTimeout(() => { if (buscarView) buscarView.hidden = true; }, 300);

  setChatViewBackCallback(() => {
    document.getElementById('view-feed')?.classList.remove('active');
    const v = document.getElementById('view-buscar');
    if (v) { v.hidden = false; requestAnimationFrame(() => v.classList.add('active')); }
  });

  switchView('chat');
  feedOpenChat(confession);
}

// ── Helpers ───────────────────────────────────────────────────
function _highlightMatch(text, query) {
  if (!query) return _escHtml(text);
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return _escHtml(text).replace(
    new RegExp(esc, 'gi'),
    m => `<mark class="buscar-highlight">${m}</mark>`,
  );
}

function _escHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
  return String(num);
}
