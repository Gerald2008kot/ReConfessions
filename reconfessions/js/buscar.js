// js/buscar.js
// ============================================================
// Vista Buscar — publicaciones populares, filtros y búsqueda
// ============================================================

import { sb }                                    from './api.js';
import { getCurrentUser }                        from './auth.js';
import { el, formatDate, showToast }             from './utils.js';
import { Icons }                                 from './icons.js';
import { tagColor }                              from './shared.js';
import { HASHTAGS }                              from './feed.js';
import { buildCard as feedBuildCard }            from './feed.js';
import { routerPush, routerBack }                from './router.js';

let _currentUser = null;
let _onClose     = null;
let _onOpenChat  = null;

// Filtros activos
let _activeRange   = 'week';   // 'day' | 'week' | 'month' | 'all'
let _activeHashtag = null;
let _searchText    = '';

// ── Init ──────────────────────────────────────────────────────
export async function initBuscar(onClose, onOpenChat) {
  _onClose    = onClose;
  _onOpenChat = onOpenChat;
  _currentUser = await getCurrentUser();
}

// ── Abrir ─────────────────────────────────────────────────────
export function openBuscar() {
  let overlay = document.getElementById('buscar-overlay');
  if (!overlay) {
    overlay = _buildOverlay();
    document.body.appendChild(overlay);
  }

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('buscar-overlay--open'));
  routerPush('buscar', _closeBuscarUI);

  // Cargar resultados iniciales
  _loadResults();
}

function _closeBuscarUI() {
  const overlay = document.getElementById('buscar-overlay');
  if (!overlay) return;
  overlay.classList.remove('buscar-overlay--open');
  setTimeout(() => { overlay.hidden = true; overlay.remove(); }, 280);
  _onClose?.();
}

export function closeBuscar() { routerBack(); }

// ── Construir overlay ─────────────────────────────────────────
function _buildOverlay() {
  const overlay = el('div', {
    className: 'buscar-overlay view',
    attrs: { id: 'buscar-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar' },
  });

  // Header
  const header = el('header', { className: 'app-header' });
  const backBtn = el('button', {
    className: 'app-header__back',
    attrs: { type: 'button', 'aria-label': 'Cerrar búsqueda' },
  });
  backBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>`;
  backBtn.addEventListener('click', closeBuscar);
  header.appendChild(backBtn);
  header.appendChild(el('h2', { className: 'app-header__title', textContent: 'Buscar' }));
  header.appendChild(el('div', { attrs: { style: 'min-width:44px' } }));
  overlay.appendChild(header);

  // Cuerpo
  const body = el('div', { className: 'buscar-body' });

  // ── Buscador de texto ────────────────────────────────────────
  const searchWrap = el('div', { className: 'buscar-search-wrap' });
  const searchIcon = el('span', { className: 'buscar-search-icon' });
  searchIcon.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>`;
  const searchInput = el('input', {
    className: 'buscar-search-input',
    attrs: {
      type: 'text',
      id: 'buscar-input',
      placeholder: 'Buscar texto o Anónimo_X…',
      maxlength: '100',
      'aria-label': 'Buscar publicaciones',
    },
  });
  searchInput.addEventListener('input', _debounce(() => {
    _searchText = searchInput.value.trim();
    _loadResults();
  }, 400));
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  body.appendChild(searchWrap);

  // ── Filtros de período ────────────────────────────────────────
  const rangeBar = el('div', { className: 'buscar-range-bar', attrs: { role: 'group', 'aria-label': 'Filtrar por período' } });
  [
    { key: 'day',   label: 'Hoy'   },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mes'   },
    { key: 'all',   label: 'Todo'  },
  ].forEach(({ key, label }) => {
    const chip = el('button', {
      className: `buscar-range-chip${key === _activeRange ? ' buscar-range-chip--active' : ''}`,
      textContent: label,
      attrs: { type: 'button', 'data-range': key },
    });
    chip.addEventListener('click', () => {
      _activeRange = key;
      rangeBar.querySelectorAll('.buscar-range-chip').forEach(c =>
        c.classList.toggle('buscar-range-chip--active', c.dataset.range === key));
      _loadResults();
    });
    rangeBar.appendChild(chip);
  });
  body.appendChild(rangeBar);

  // ── Filtros de hashtag ────────────────────────────────────────
  const hashBar = el('div', { className: 'buscar-hashtag-bar hashtag-filter-bar', attrs: { role: 'group', 'aria-label': 'Filtrar por hashtag' } });
  const allChip = el('button', {
    className: 'hf-chip hf-chip--active',
    textContent: 'Todos',
    attrs: { type: 'button', 'data-tag': 'all' },
  });
  allChip.addEventListener('click', () => {
    _activeHashtag = null;
    hashBar.querySelectorAll('.hf-chip').forEach(c => c.classList.toggle('hf-chip--active', c.dataset.tag === 'all'));
    _loadResults();
  });
  hashBar.appendChild(allChip);

  HASHTAGS.forEach(tag => {
    const tc   = tagColor(tag);
    const chip = el('button', {
      className: 'hf-chip',
      textContent: tag,
      attrs: { type: 'button', 'data-tag': tag, style: `--chip-fg:${tc.fg};--chip-bg:${tc.bg}` },
    });
    chip.addEventListener('click', () => {
      _activeHashtag = tag;
      hashBar.querySelectorAll('.hf-chip').forEach(c => c.classList.toggle('hf-chip--active', c.dataset.tag === tag));
      _loadResults();
    });
    hashBar.appendChild(chip);
  });
  body.appendChild(hashBar);

  // ── Resultados ────────────────────────────────────────────────
  const results = el('div', { className: 'buscar-results', attrs: { id: 'buscar-results' } });
  body.appendChild(results);

  overlay.appendChild(body);
  return overlay;
}

// ── Cargar resultados ─────────────────────────────────────────
async function _loadResults() {
  const container = document.getElementById('buscar-results');
  if (!container) return;

  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(el('p', { className: 'feed-empty', textContent: 'Buscando…' }));

  try {
    // Rango de fechas
    let since = null;
    const now  = new Date();
    if (_activeRange === 'day')   { since = new Date(now.getTime() - 86400000).toISOString(); }
    if (_activeRange === 'week')  { since = new Date(now.getTime() - 7 * 86400000).toISOString(); }
    if (_activeRange === 'month') { since = new Date(now.getTime() - 30 * 86400000).toISOString(); }

    // Base query
    let query = sb
      .from('confessions')
      .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
      .order('created_at', { ascending: false })
      .limit(60);

    if (since) query = query.gte('created_at', since);

    if (_activeHashtag) {
      query = query.or(`hashtags.cs.{"${_activeHashtag}"},hashtag.eq.${_activeHashtag}`);
    }

    // Búsqueda de texto en content
    if (_searchText) {
      // Si parece un Anónimo_X, buscar por número
      const anonMatch = _searchText.match(/^[Aa]nónimo_?(\d+)$/);
      if (anonMatch) {
        // Buscar perfil por anonymous_number
        const { data: foundProfiles } = await sb
          .from('profiles')
          .select('id')
          .eq('anonymous_number', parseInt(anonMatch[1]));
        if (foundProfiles?.length) {
          const ids = foundProfiles.map(p => p.id);
          query = query.in('user_id', ids);
        } else {
          while (container.firstChild) container.removeChild(container.firstChild);
          container.appendChild(el('p', { className: 'feed-empty', textContent: 'Ningún usuario encontrado.' }));
          return;
        }
      } else {
        query = query.ilike('content', `%${_searchText}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (!data?.length) {
      container.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin resultados.' }));
      return;
    }

    // Ordenar por likes (más populares primero)
    const ids = data.map(c => c.id);
    const { data: lkRows } = await sb.from('likes').select('confession_id').in('confession_id', ids);
    const likeMap = {};
    lkRows?.forEach(r => { likeMap[r.confession_id] = (likeMap[r.confession_id] || 0) + 1; });

    const { data: cmRows } = await sb.from('comments').select('confession_id').in('confession_id', ids);
    const cmMap = {};
    cmRows?.forEach(r => { cmMap[r.confession_id] = (cmMap[r.confession_id] || 0) + 1; });

    let userLikedSet = new Set();
    if (_currentUser) {
      const { data: liked } = await sb.from('likes').select('confession_id')
        .eq('user_id', _currentUser.id).in('confession_id', ids);
      userLikedSet = new Set(liked?.map(r => r.confession_id) || []);
    }

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await sb.from('profiles').select('id, avatar_url, full_name').in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    // Ordenar por likes desc
    const sorted = [...data].sort((a, b) => (likeMap[b.id] || 0) - (likeMap[a.id] || 0));

    sorted.forEach(c => {
      feedBuildCard(
        c, container, false, false,
        likeMap[c.id] || 0,
        cmMap[c.id]   || 0,
        userLikedSet.has(c.id),
        profileMap[c.user_id] || null,
        null, null,
      );
    });

  } catch (err) {
    console.error('[buscar]', err);
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(el('p', { className: 'feed-empty', textContent: 'Error al buscar.' }));
  }
}

// ── Debounce helper ───────────────────────────────────────────
function _debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
