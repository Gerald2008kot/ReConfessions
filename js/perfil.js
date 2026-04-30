// js/perfil.js
// ============================================================
// Vista de Perfil — sticky hero al scroll
// + Dropdown personalizado (Bio + Cerrar Sesión)
// + Gráfica de actividad semanal (Chart.js)
// ============================================================

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile, signOut,
         renderHeaderChip }                      from './auth.js';
import { uploadImage }                           from './upload.js';
import { getInitials, showToast, formatDate }    from './utils.js';
import { Icons }                                 from './icons.js';
import { tagColor, countMap }                    from './shared.js';
import { routerPush, routerBack }               from './router.js';
import { openChat }                              from './chat.js';

let _user          = null;
let _profile       = null;
let _chipSlot      = null;
let _onBack        = null;
let _activityChart = null;

// ── Init ──────────────────────────────────────────────────────
export async function initPerfil(user, profile, chipSlot, onBack) {
  _user     = user;
  _profile  = profile;
  _chipSlot = chipSlot;
  _onBack   = onBack;
  document.getElementById('perfil-back-btn')?.addEventListener('click', routerBack);
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openPerfil() {
  routerPush('perfil', _closePerfilUI);
  const view = document.getElementById('view-perfil');
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));

  renderHero(_profile);
  renderSuspensionBanner(_profile);
  loadStats();
  loadMyConfessions();
  _loadActivityChart();
}

function _closePerfilUI() {
  const view = document.getElementById('view-perfil');
  view.classList.remove('active');
  setTimeout(() => { view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

export function closePerfil() { _closePerfilUI(); }

// ── Hero ──────────────────────────────────────────────────────
function renderHero(p) {
  if (!p) return;
  const anonNum = p.anonymous_number ?? '?';

  document.getElementById('perfil-name').textContent         = `Anónimo_${anonNum}`;
  document.getElementById('perfil-email').textContent        = _user.email;
  document.getElementById('perfil-initials').textContent     = getInitials(p.full_name);
  document.getElementById('perfil-admin-badge').hidden       = !p.is_admin;

  const img = document.getElementById('perfil-avatar-img');
  if (p.avatar_url) {
    img.src = p.avatar_url; img.hidden = false;
    document.getElementById('perfil-initials').hidden = true;
  } else {
    img.hidden = true;
    document.getElementById('perfil-initials').hidden = false;
  }

  // Poblar sticky bar
  _renderStickyBar(p);

  // Dropdown opciones (bio + logout)
  _renderOptionsDropdown(p.bio || '');

  // Activar sticky scroll
  const scrollEl = document.getElementById('perfil-scroll');
  const hero     = document.getElementById('perfil-hero');
  const sticky   = document.getElementById('perfil-sticky-bar');
  if (scrollEl && hero && sticky) {
    // Remover listener previo clonando el nodo
    const fresh = scrollEl.cloneNode(false);
    while (scrollEl.firstChild) fresh.appendChild(scrollEl.firstChild);
    scrollEl.parentNode.replaceChild(fresh, scrollEl);

    fresh.addEventListener('scroll', () => {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const viewTop    = fresh.getBoundingClientRect().top;
      const collapsed  = (heroBottom - viewTop) < 64;
      sticky.classList.toggle('perfil-sticky-bar--visible', collapsed);
      hero.classList.toggle('perfil-hero--scrolled', collapsed);
    }, { passive: true });
  }

  // Avatar upload
  document.getElementById('perfil-avatar-input')
    ?.addEventListener('change', handleAvatarUpload);
}

// ── Sticky bar ────────────────────────────────────────────────
function _renderStickyBar(p) {
  const bar = document.getElementById('perfil-sticky-bar');
  if (!bar) return;
  while (bar.firstChild) bar.removeChild(bar.firstChild);

  // Avatar mini
  const av = document.createElement('div');
  av.className = 'autor-avatar autor-avatar--sm';
  if (p.avatar_url) {
    const img = document.createElement('img');
    img.src = p.avatar_url; img.alt = 'Avatar';
    av.appendChild(img);
  } else {
    const sp = document.createElement('span');
    sp.className = 'autor-avatar__initials autor-avatar__initials--sm';
    sp.textContent = getInitials(p.full_name);
    av.appendChild(sp);
  }
  bar.appendChild(av);

  // Info
  const info = document.createElement('div');
  info.className = 'autor-sticky-info';

  const name = document.createElement('span');
  name.className   = 'autor-sticky-name';
  name.textContent = `Anónimo_${p.anonymous_number ?? '?'}`;
  info.appendChild(name);

  // Stats (se rellenan cuando loadStats termina)
  const statsRow = document.createElement('div');
  statsRow.id        = 'perfil-sticky-stats';
  statsRow.className = 'autor-sticky-stats';
  info.appendChild(statsRow);

  bar.appendChild(info);
}

// ── Dropdown personalizado ────────────────────────────────────
function _renderOptionsDropdown(currentBio) {
  const slot = document.getElementById('perfil-menu-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);

  // Botón tres puntos
  const btn = document.createElement('button');
  btn.className = 'app-header__icon-btn';
  btn.type      = 'button';
  btn.setAttribute('aria-label', 'Opciones');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z
         M12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5z
         M12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>`;

  // Dropdown
  const dd = document.createElement('div');
  dd.className = 'perfil-options-dropdown';
  dd.id        = 'perfil-options-dropdown';
  dd.hidden    = true;

  // Item — Editar bio
  const bioItem = _mkPdItem(
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07
           a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>`,
    'Editar biografía',
    null,
    () => { dd.hidden = true; _openBioSheet(currentBio); }
  );
  dd.appendChild(bioItem);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'perfil-options-divider';
  dd.appendChild(divider);

  // Item — Cerrar sesión
  const outItem = _mkPdItem(
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5
           A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>`,
    'Cerrar sesión',
    'var(--danger, #ef4444)',
    async () => { dd.hidden = true; await signOut(); window.location.replace('./login.html'); }
  );
  dd.appendChild(outItem);

  // Toggle
  btn.addEventListener('click', e => { e.stopPropagation(); dd.hidden = !dd.hidden; });
  document.addEventListener('click', e => {
    if (!dd.contains(e.target) && e.target !== btn) dd.hidden = true;
  });

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;min-width:44px;display:flex;justify-content:flex-end;align-items:center';
  wrap.appendChild(btn);
  wrap.appendChild(dd);
  slot.appendChild(wrap);
}

function _mkPdItem(svgHtml, label, color, onClick) {
  const item = document.createElement('button');
  item.className = 'perfil-options-item';
  item.type      = 'button';
  if (color) item.style.color = color;
  item.innerHTML = `${svgHtml}<span>${label}</span>`;
  item.addEventListener('click', onClick);
  return item;
}

// ── Bottom sheet: editar bio ──────────────────────────────────
function _openBioSheet(currentBio) {
  document.getElementById('bio-sheet-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'bio-sheet-overlay';
  overlay.className = 'bio-sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'bio-sheet';

  const title = document.createElement('p');
  title.className   = 'bio-sheet__title';
  title.textContent = 'Editar biografía';
  sheet.appendChild(title);

  const textarea = document.createElement('textarea');
  textarea.className   = 'perfil-bio-input';
  textarea.placeholder = 'Cuéntale algo al mundo…';
  textarea.maxLength   = 280;
  textarea.value       = currentBio;
  textarea.rows        = 4;
  sheet.appendChild(textarea);

  const counter = document.createElement('span');
  counter.className   = 'bio-sheet__counter';
  counter.textContent = `${currentBio.length}/280`;
  textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length}/280`; });
  sheet.appendChild(counter);

  const actions = document.createElement('div');
  actions.className = 'bio-sheet__actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type      = 'button';
  cancelBtn.className = 'bio-sheet__btn bio-sheet__btn--cancel';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const saveBtn = document.createElement('button');
  saveBtn.type      = 'button';
  saveBtn.className = 'bio-sheet__btn bio-sheet__btn--save';
  saveBtn.textContent = 'Guardar';
  saveBtn.addEventListener('click', async () => {
    const bio = textarea.value.trim();
    const { error } = await sb.from('profiles').update({ bio }).eq('id', _user.id);
    if (error) { showToast(error.message, 'error'); return; }
    _profile = { ..._profile, bio };
    _renderOptionsDropdown(bio);
    showToast('Biografía guardada.', 'success');
    overlay.remove();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  sheet.appendChild(actions);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  requestAnimationFrame(() => {
    overlay.classList.add('bio-sheet-overlay--open');
    setTimeout(() => textarea.focus(), 120);
  });
}

// ── Suspension banner ─────────────────────────────────────────
function renderSuspensionBanner(p) {
  document.getElementById('perfil-suspension-banner')?.remove();
  if (!p?.suspended_until) return;
  const until = new Date(p.suspended_until);
  if (until <= new Date()) return;
  const diff   = Math.ceil((until - Date.now()) / 86400000);
  const banner = document.createElement('div');
  banner.id        = 'perfil-suspension-banner';
  banner.className = 'perfil-suspension-banner';
  banner.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71
         c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0
         L2.697 16.126zM12 15.75h.008v.008H12v-.008z"/></svg>
  <span>Estás suspendido — quedan <strong>${diff} día${diff !== 1 ? 's' : ''}</strong>.</span>`;
  document.getElementById('perfil-hero')?.insertAdjacentElement('beforebegin', banner);
}

// ── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  const [{ count: c1 }, { count: c2 }, { count: followers }] = await Promise.all([
    sb.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', _user.id),
    sb.from('comments').select('id',    { count: 'exact', head: true }).eq('user_id', _user.id),
    sb.from('follows').select('id',     { count: 'exact', head: true }).eq('following_id', _user.id),
  ]);

  document.getElementById('perfil-stat-conf').textContent      = c1 ?? 0;
  document.getElementById('perfil-stat-cm').textContent        = c2 ?? 0;
  document.getElementById('perfil-stat-followers').textContent = followers ?? 0;

  const { data: myIds } = await sb.from('confessions').select('id').eq('user_id', _user.id);
  let lkCount = 0;
  if (myIds?.length) {
    const { count: lk } = await sb.from('likes')
      .select('id', { count: 'exact', head: true })
      .in('confession_id', myIds.map(r => r.id));
    lkCount = lk ?? 0;
  }
  document.getElementById('perfil-stat-likes').textContent = lkCount;

  // Sticky stats
  const stickyRow = document.getElementById('perfil-sticky-stats');
  if (stickyRow) {
    stickyRow.innerHTML = '';
    const mk = (val, lbl) => {
      const s = document.createElement('span');
      s.className = 'autor-sticky-stat';
      s.innerHTML = `<strong>${val}</strong> ${lbl}`;
      return s;
    };
    stickyRow.appendChild(mk(c1 ?? 0,       'conf.'));
    stickyRow.appendChild(mk(lkCount,        'likes'));
    stickyRow.appendChild(mk(followers ?? 0, 'seg.'));
  }
}

// ── Gráfica actividad semanal ─────────────────────────────────
async function _loadActivityChart() {
  if (!window.Chart) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Chart.js no disponible'));
      document.head.appendChild(s);
    }).catch(err => { console.warn('[perfil chart]', err); });
  }
  if (!window.Chart) return;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const since = new Date(today);
  since.setDate(today.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const [{ data: confData }, { data: cmData }] = await Promise.all([
    sb.from('confessions').select('created_at').eq('user_id', _user.id).gte('created_at', since.toISOString()),
    sb.from('comments').select('created_at').eq('user_id', _user.id).gte('created_at', since.toISOString()),
  ]);

  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const days = [], labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
    labels.push(i === 0 ? 'Hoy' : DAYS[d.getDay()]);
  }

  const byDay = rows => {
    const m = {};
    rows?.forEach(r => { const d = r.created_at.slice(0, 10); m[d] = (m[d] || 0) + 1; });
    return days.map(d => m[d] || 0);
  };

  let slot = document.getElementById('perfil-activity-chart-slot');
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'perfil-activity-chart-slot'; slot.className = 'perfil-chart-slot';
    const t = document.createElement('p'); t.className = 'perfil-chart-title'; t.textContent = 'Actividad últimos 7 días';
    slot.appendChild(t);
    const cv = document.createElement('canvas'); cv.id = 'perfil-activity-canvas';
    slot.appendChild(cv);
    document.querySelector('#view-perfil .chat-divider')?.insertAdjacentElement('beforebegin', slot);
  }

  const canvas = document.getElementById('perfil-activity-canvas');
  if (!canvas) return;

  if (_activityChart) { _activityChart.destroy(); _activityChart = null; }

  const dark      = document.documentElement.getAttribute('data-theme') !== 'light';
  const grid      = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const ticks     = dark ? '#9891b0' : '#6b6480';

  _activityChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Confesiones', data: byDay(confData), backgroundColor:'#9b7fffcc', borderColor:'#9b7fff', borderWidth:1, borderRadius:4, borderSkipped:false },
        { label:'Comentarios', data: byDay(cmData),   backgroundColor:'#e8a83899', borderColor:'#e8a838', borderWidth:1, borderRadius:4, borderSkipped:false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true, aspectRatio: 2.2,
      animation: { duration: 500, easing: 'easeOutQuart' },
      plugins: {
        legend: { labels: { color: ticks, font: { family:'Inter', size:11 }, boxWidth:10, padding:12 } },
        tooltip: { backgroundColor: dark ? '#1c1a25' : '#fff', borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderWidth:1, titleColor: dark ? '#e8e4f0' : '#0a090e', bodyColor: ticks, cornerRadius:8 },
      },
      scales: {
        x: { ticks:{ color:ticks, font:{family:'Inter',size:11} }, grid:{ color:grid }, border:{ color:'transparent' } },
        y: { beginAtZero:true, ticks:{ color:ticks, font:{family:'Inter',size:11}, stepSize:1, precision:0 }, grid:{ color:grid }, border:{ color:'transparent' } },
      },
    },
  });
}

// ── Mis confesiones ───────────────────────────────────────────
async function loadMyConfessions() {
  const feed = document.getElementById('perfil-feed');
  while (feed.firstChild) feed.removeChild(feed.firstChild);
  feed.appendChild(Object.assign(document.createElement('p'), { className:'feed-empty', textContent:'Cargando…' }));

  const { data, error } = await sb
    .from('confessions').select('id, user_id, content, image_url, hashtag, created_at')
    .eq('user_id', _user.id).order('created_at', { ascending: false }).limit(50);

  while (feed.firstChild) feed.removeChild(feed.firstChild);

  if (error || !data?.length) {
    feed.appendChild(Object.assign(document.createElement('p'), {
      className: 'feed-empty',
      textContent: error ? 'Error al cargar.' : 'Aún no has publicado ninguna confesión.',
    }));
    return;
  }

  const ids = data.map(c => c.id);
  const [{ data: lk }, { data: cm }, { data: myLikes }] = await Promise.all([
    sb.from('likes').select('confession_id').in('confession_id', ids),
    sb.from('comments').select('confession_id').in('confession_id', ids),
    sb.from('likes').select('confession_id').eq('user_id', _user.id).in('confession_id', ids),
  ]);

  const likeMap  = countMap(lk, 'confession_id');
  const cmMap    = countMap(cm, 'confession_id');
  const likedSet = new Set(myLikes?.map(r => r.confession_id) || []);

  data.forEach(c => feed.appendChild(_buildCard(c, likeMap[c.id]||0, cmMap[c.id]||0, likedSet.has(c.id))));
}

function _buildCard(c, likeCount, commentCount, isLiked) {
  const card = document.createElement('article'); card.className = 'rc-card';
  const top  = document.createElement('div');     top.className  = 'rc-card__top';

  const av = document.createElement('div'); av.className = 'rc-card__avatar';
  if (_profile?.avatar_url) { const i = document.createElement('img'); i.src = _profile.avatar_url; i.alt='Avatar'; i.loading='lazy'; av.appendChild(i); }
  else av.appendChild(Icons.user(14));
  top.appendChild(av);

  const { bg, fg } = tagColor(c.hashtag || '#Confesión');
  const pill = document.createElement('span'); pill.className = 'rc-card__tag'; pill.textContent = c.hashtag || '#Confesión';
  pill.style.background = bg; pill.style.color = fg; top.appendChild(pill);

  const time = document.createElement('span'); time.className = 'rc-card__time'; time.textContent = formatDate(c.created_at); top.appendChild(time);

  const del = document.createElement('button'); del.className = 'rc-card__del'; del.type = 'button';
  del.appendChild(Icons.trash(15)); del.addEventListener('click', e => { e.stopPropagation(); _deleteConfession(c.id, card); }); top.appendChild(del);
  card.appendChild(top);

  const body = document.createElement('div'); body.className = 'rc-card__body-row';
  const text = document.createElement('p'); text.className = 'rc-card__text'; text.textContent = c.content; body.appendChild(text);
  if (c.image_url) {
    const th = document.createElement('div'); th.className = 'rc-card__thumb';
    const i  = document.createElement('img'); i.src = c.image_url; i.alt = 'Imagen'; i.loading = 'lazy';
    i.addEventListener('click', e => { e.stopPropagation(); _openImgModal(c.image_url); }); th.appendChild(i); body.appendChild(th);
  }
  card.appendChild(body);

  const footer = document.createElement('div'); footer.className = 'rc-card__footer';
  const lkBtn = document.createElement('button'); lkBtn.className = `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`; lkBtn.type = 'button';
  lkBtn.appendChild(Icons.heart(isLiked, 17));
  lkBtn.appendChild(Object.assign(document.createElement('span'), { className:'rc-card__action-count', textContent:String(likeCount) }));
  lkBtn.addEventListener('click', e => { e.stopPropagation(); _toggleLike(c.id, lkBtn); }); footer.appendChild(lkBtn);

  const cmBtn = document.createElement('button'); cmBtn.className = 'rc-card__action'; cmBtn.type = 'button';
  cmBtn.appendChild(Icons.chat(17));
  cmBtn.appendChild(Object.assign(document.createElement('span'), { className:'rc-card__action-count', textContent:String(commentCount) }));
  cmBtn.addEventListener('click', e => { e.stopPropagation(); _openChatFromPerfil(c); }); footer.appendChild(cmBtn);

  card.appendChild(footer);
  card.addEventListener('click', () => _openChatFromPerfil(c));
  return card;
}

async function _openChatFromPerfil(confession) {
  const view = document.getElementById('view-perfil');
  view?.classList.remove('active');
  const chatView = document.getElementById('view-chat');
  chatView?.classList.add('active');
  routerPush('chat', () => { chatView?.classList.remove('active'); view?.classList.add('active'); });
  await openChat(confession);
}

async function _toggleLike(cid, btn) {
  const liked = btn.classList.contains('rc-card__action--liked');
  const sp    = btn.querySelector('.rc-card__action-count');
  const n     = parseInt(sp.textContent) || 0;
  const swap  = f => { const o = btn.querySelector('svg'); if (o) btn.replaceChild(Icons.heart(f, 17), o); };
  if (liked) {
    btn.classList.remove('rc-card__action--liked'); swap(false); sp.textContent = String(n - 1);
    await sb.from('likes').delete().match({ confession_id: cid, user_id: _user.id });
  } else {
    btn.classList.add('rc-card__action--liked'); swap(true); sp.textContent = String(n + 1);
    btn.classList.add('rc-card__action--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__action--pop'), { once: true });
    await sb.from('likes').insert({ confession_id: cid, user_id: _user.id });
  }
}

async function _deleteConfession(id, cardEl) {
  if (!confirm('¿Borrar esta confesión? No se puede deshacer.')) return;
  const { error } = await sb.from('confessions').delete().eq('id', id).eq('user_id', _user.id);
  if (error) { showToast(error.message, 'error'); return; }
  cardEl.remove();
  const s = document.getElementById('perfil-stat-conf');
  if (s) s.textContent = Math.max(0, parseInt(s.textContent) - 1);
  showToast('Confesión eliminada.', 'success');
}

// ── Avatar upload ─────────────────────────────────────────────
async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const track    = document.getElementById('perfil-avatar-track');
  const bar      = document.getElementById('perfil-avatar-bar');
  const status   = document.getElementById('perfil-avatar-status');
  const wrap     = document.querySelector('.profile-avatar-wrap');
  wrap?.classList.add('profile-avatar-wrap--loading');
  track.hidden = false; bar.style.width = '0%'; status.textContent = 'Subiendo…';
  try {
    const url   = await uploadImage(file, pct => { bar.style.width = pct + '%'; });
    const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', _user.id);
    if (error) throw new Error(error.message);
    _profile = { ..._profile, avatar_url: url };
    const heroImg = document.getElementById('perfil-avatar-img');
    if (heroImg) { heroImg.src = `${url}?_t=${Date.now()}`; heroImg.hidden = false; document.getElementById('perfil-initials').hidden = true; }
    _renderStickyBar(_profile);
    renderHeaderChip(_chipSlot, _profile, () => window.location.replace('./login.html'));
    status.textContent = '✓ Foto actualizada';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch (err) {
    showToast(err.message, 'error'); status.textContent = '';
  } finally {
    wrap?.classList.remove('profile-avatar-wrap--loading');
    track.hidden = true; bar.style.width = '0%';
    document.getElementById('perfil-avatar-input').value = '';
  }
}

// ── Image modal ───────────────────────────────────────────────
function _openImgModal(url) {
  document.getElementById('img-modal')?.remove();
  const ov = document.createElement('div'); ov.id = 'img-modal'; ov.className = 'img-modal';
  const im = document.createElement('img'); im.src = url; im.className = 'img-modal__img'; im.alt = 'Imagen';
  const cl = document.createElement('button'); cl.className = 'img-modal__close'; cl.type = 'button'; cl.appendChild(Icons.close(20));
  const close = () => ov.remove();
  cl.addEventListener('click', close); ov.addEventListener('click', ev => { if (ev.target === ov) close(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); }, { once: true });
  ov.appendChild(cl); ov.appendChild(im); document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('img-modal--open'));
}
