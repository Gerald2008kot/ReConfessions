// js/perfil.js
// ============================================================
// Vista de Perfil — SPA view dentro de index.html
// + Gráfica de actividad semanal (Chart.js) — NUEVO
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

let _user    = null;
let _profile = null;
let _chipSlot = null;
let _onBack   = null;
let _activityChart = null; // Instancia Chart.js

// ── Init ──────────────────────────────────────────────────────
export async function initPerfil(user, profile, chipSlot, onBack) {
  _user     = user;
  _profile  = profile;
  _chipSlot = chipSlot;
  _onBack   = onBack;

  document.getElementById('perfil-back-btn')?.addEventListener('click', routerBack);
  document.getElementById('perfil-signout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.replace('./login.html');
  });

  const avatarInput = document.getElementById('perfil-avatar-input');
  avatarInput?.addEventListener('change', handleAvatarUpload);
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

export function closePerfil() {
  _closePerfilUI();
}

// ── Hero ──────────────────────────────────────────────────────
function renderHero(p) {
  if (!p) return;
  const anonNum  = p.anonymous_number ?? '?';
  const nameEl   = document.getElementById('perfil-name');
  const emailEl  = document.getElementById('perfil-email');
  if (nameEl)  nameEl.textContent  = `Anónimo_${anonNum}`;
  if (emailEl) emailEl.textContent = _user.email;
  document.getElementById('perfil-initials').textContent = getInitials(p.full_name);
  document.getElementById('perfil-admin-badge').hidden   = !p.is_admin;

  const img = document.getElementById('perfil-avatar-img');
  if (p.avatar_url) {
    img.src = p.avatar_url;
    img.hidden = false;
    document.getElementById('perfil-initials').hidden = true;
  } else {
    img.hidden = true;
    document.getElementById('perfil-initials').hidden = false;
  }

  _renderBioEditor(p.bio || '');
}

// ── Banner suspensión ─────────────────────────────────────────
function renderSuspensionBanner(p) {
  const existing = document.getElementById('perfil-suspension-banner');
  existing?.remove();

  if (!p?.suspended_until) return;
  const until = new Date(p.suspended_until);
  if (until <= new Date()) return;

  const diff = Math.ceil((until - Date.now()) / 86400000);
  const banner = document.createElement('div');
  banner.id        = 'perfil-suspension-banner';
  banner.className = 'perfil-suspension-banner';
  banner.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z"/></svg>
  <span>Estás suspendido — quedan <strong>${diff} día${diff !== 1 ? 's' : ''}</strong>. Durante este periodo no puedes confesar, comentar ni reaccionar.</span>`;

  const view = document.getElementById('view-perfil');
  const hero  = view?.querySelector('.profile-hero');
  if (hero) hero.insertAdjacentElement('beforebegin', banner);
}

// ── Bio editor ────────────────────────────────────────────────
function _renderBioEditor(currentBio) {
  const slot = document.getElementById('perfil-bio-slot');
  if (!slot) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);

  const textarea = document.createElement('textarea');
  textarea.className   = 'perfil-bio-input';
  textarea.placeholder = 'Escribe una biografía…';
  textarea.maxLength   = 280;
  textarea.value       = currentBio;
  textarea.rows        = 3;
  textarea.setAttribute('aria-label', 'Biografía');

  const saveBtn = document.createElement('button');
  saveBtn.type      = 'button';
  saveBtn.className = 'perfil-bio-save-btn';
  saveBtn.textContent = 'Guardar bio';

  saveBtn.addEventListener('click', async () => {
    const bio = textarea.value.trim();
    const { error } = await sb.from('profiles').update({ bio }).eq('id', _user.id);
    if (error) { showToast(error.message, 'error'); return; }
    _profile = { ..._profile, bio };
    showToast('Biografía guardada.', 'success');
  });

  slot.appendChild(textarea);
  slot.appendChild(saveBtn);
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
  if (myIds?.length) {
    const { count: lk } = await sb.from('likes')
      .select('id', { count: 'exact', head: true })
      .in('confession_id', myIds.map(r => r.id));
    document.getElementById('perfil-stat-likes').textContent = lk ?? 0;
  } else {
    document.getElementById('perfil-stat-likes').textContent = '0';
  }
}

// ── Gráfica de actividad semanal ──────────────────────────────
async function _loadActivityChart() {
  // Asegurar Chart.js disponible
  if (!window.Chart) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Chart.js no disponible'));
      document.head.appendChild(s);
    }).catch(err => { console.warn('[perfil chart]', err); return; });
  }
  if (!window.Chart) return;

  // Calcular rango: últimos 7 días
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const since = sevenDaysAgo.toISOString();

  const [{ data: confData }, { data: cmData }] = await Promise.all([
    sb.from('confessions')
      .select('created_at')
      .eq('user_id', _user.id)
      .gte('created_at', since),
    sb.from('comments')
      .select('created_at')
      .eq('user_id', _user.id)
      .gte('created_at', since),
  ]);

  // Construir arrays de 7 días
  const days    = [];
  const labels  = [];
  const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
    labels.push(i === 0 ? 'Hoy' : DAYS_ES[d.getDay()]);
  }

  const countByDay = (rows) => {
    const map = {};
    rows?.forEach(r => {
      const day = r.created_at.slice(0, 10);
      map[day] = (map[day] || 0) + 1;
    });
    return days.map(d => map[d] || 0);
  };

  const confCounts = countByDay(confData);
  const cmCounts   = countByDay(cmData);

  // Renderizar contenedor si no existe
  let chartSlot = document.getElementById('perfil-activity-chart-slot');
  if (!chartSlot) {
    chartSlot = document.createElement('div');
    chartSlot.id = 'perfil-activity-chart-slot';
    chartSlot.className = 'perfil-chart-slot';

    const title = document.createElement('p');
    title.className = 'perfil-chart-title';
    title.textContent = 'Actividad últimos 7 días';
    chartSlot.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.id = 'perfil-activity-canvas';
    canvas.setAttribute('aria-label', 'Gráfica de actividad semanal');
    chartSlot.appendChild(canvas);

    // Insertar antes de la sección de confesiones
    const divider = document.querySelector('#view-perfil .chat-divider');
    divider?.insertAdjacentElement('beforebegin', chartSlot);
  }

  const canvas = document.getElementById('perfil-activity-canvas');
  if (!canvas) return;

  // Destruir instancia previa si existe
  if (_activityChart) {
    _activityChart.destroy();
    _activityChart = null;
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor   = isDark ? '#9891b0' : '#6b6480';
  const accentColor = '#9b7fff';
  const amberColor  = '#e8a838';

  _activityChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Confesiones',
          data: confCounts,
          backgroundColor: `${accentColor}cc`,
          borderColor: accentColor,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Comentarios',
          data: cmCounts,
          backgroundColor: `${amberColor}99`,
          borderColor: amberColor,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      animation: { duration: 500, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          labels: {
            color: tickColor,
            font: { family: 'Inter', size: 11 },
            boxWidth: 10,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: isDark ? '#1c1a25' : '#ffffff',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          titleColor: isDark ? '#e8e4f0' : '#0a090e',
          bodyColor: tickColor,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: { family: 'Inter', size: 11 } },
          grid: { color: gridColor },
          border: { color: 'transparent' },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: tickColor,
            font: { family: 'Inter', size: 11 },
            stepSize: 1,
            precision: 0,
          },
          grid: { color: gridColor },
          border: { color: 'transparent' },
        },
      },
    },
  });
}

// ── Mis confesiones ───────────────────────────────────────────
async function loadMyConfessions() {
  const feed = document.getElementById('perfil-feed');
  while (feed.firstChild) feed.removeChild(feed.firstChild);
  feed.appendChild(Object.assign(document.createElement('p'), { className: 'feed-empty', textContent: 'Cargando…' }));

  const { data, error } = await sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, created_at')
    .eq('user_id', _user.id)
    .order('created_at', { ascending: false })
    .limit(50);

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

  const likeMap  = countMap(lk,      'confession_id');
  const cmMap    = countMap(cm,      'confession_id');
  const likedSet = new Set(myLikes?.map(r => r.confession_id) || []);

  data.forEach(c => feed.appendChild(buildCard(c, likeMap[c.id]||0, cmMap[c.id]||0, likedSet.has(c.id))));
}

// ── Card ──────────────────────────────────────────────────────
function buildCard(c, likeCount, commentCount, isLiked) {
  const card = document.createElement('article');
  card.className = 'rc-card';

  const top = document.createElement('div');
  top.className = 'rc-card__top';

  const av = document.createElement('div');
  av.className = 'rc-card__avatar';
  if (_profile?.avatar_url) {
    const img = document.createElement('img');
    img.src = _profile.avatar_url; img.alt = 'Avatar'; img.loading = 'lazy';
    av.appendChild(img);
  } else { av.appendChild(Icons.user(14)); }
  top.appendChild(av);

  const { bg, fg } = tagColor(c.hashtag || '#Confesión');
  const pill = document.createElement('span');
  pill.className = 'rc-card__tag';
  pill.textContent = c.hashtag || '#Confesión';
  pill.style.background = bg; pill.style.color = fg;
  top.appendChild(pill);

  const time = document.createElement('span');
  time.className = 'rc-card__time';
  time.textContent = formatDate(c.created_at);
  top.appendChild(time);

  const del = document.createElement('button');
  del.className = 'rc-card__del'; del.type = 'button';
  del.appendChild(Icons.trash(15));
  del.addEventListener('click', e => { e.stopPropagation(); deleteConfession(c.id, card); });
  top.appendChild(del);
  card.appendChild(top);

  const body = document.createElement('div');
  body.className = 'rc-card__body-row';
  const text = document.createElement('p');
  text.className = 'rc-card__text'; text.textContent = c.content;
  body.appendChild(text);

  if (c.image_url) {
    const thumb = document.createElement('div');
    thumb.className = 'rc-card__thumb';
    const img = document.createElement('img');
    img.src = c.image_url; img.alt = 'Imagen'; img.loading = 'lazy';
    img.addEventListener('click', e => { e.stopPropagation(); openImageModal(c.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'rc-card__footer';

  const likeBtn = document.createElement('button');
  likeBtn.className = `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`;
  likeBtn.type = 'button';
  likeBtn.appendChild(Icons.heart(isLiked, 17));
  const lkSpan = Object.assign(document.createElement('span'), { className: 'rc-card__action-count', textContent: String(likeCount) });
  likeBtn.appendChild(lkSpan);
  likeBtn.addEventListener('click', e => { e.stopPropagation(); toggleLike(c.id, likeBtn); });
  footer.appendChild(likeBtn);

  const cmBtn = document.createElement('button');
  cmBtn.className = 'rc-card__action'; cmBtn.type = 'button';
  cmBtn.appendChild(Icons.chat(17));
  cmBtn.appendChild(Object.assign(document.createElement('span'), { className: 'rc-card__action-count', textContent: String(commentCount) }));
  cmBtn.addEventListener('click', e => { e.stopPropagation(); _openChatFromPerfil(c); });
  footer.appendChild(cmBtn);

  card.appendChild(footer);
  card.addEventListener('click', () => _openChatFromPerfil(c));
  return card;
}

async function _openChatFromPerfil(confession) {
  const view = document.getElementById('view-perfil');
  view?.classList.remove('active');
  const chatView = document.getElementById('view-chat');
  chatView?.classList.add('active');
  routerPush('chat', () => {
    chatView?.classList.remove('active');
    view?.classList.add('active');
  });
  await openChat(confession);
}

async function toggleLike(cid, btn) {
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

async function deleteConfession(id, cardEl) {
  if (!confirm('¿Borrar esta confesión? No se puede deshacer.')) return;
  const { error } = await sb.from('confessions').delete().eq('id', id).eq('user_id', _user.id);
  if (error) { showToast(error.message, 'error'); return; }
  cardEl.remove();
  const s = document.getElementById('perfil-stat-conf');
  s.textContent = Math.max(0, parseInt(s.textContent) - 1);
  showToast('Confesión eliminada.', 'success');
}

// ── Avatar upload ─────────────────────────────────────────────
async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const track     = document.getElementById('perfil-avatar-track');
  const bar       = document.getElementById('perfil-avatar-bar');
  const status    = document.getElementById('perfil-avatar-status');
  const avatarWrap = document.querySelector('.profile-avatar-wrap');

  avatarWrap?.classList.add('profile-avatar-wrap--loading');
  track.hidden = false;
  bar.style.width = '0%';
  status.textContent = 'Subiendo…';

  try {
    const url = await uploadImage(file, pct => { bar.style.width = pct + '%'; });

    const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', _user.id);
    if (error) throw new Error(error.message);

    const cacheBustedUrl = url.includes('?')
      ? `${url}&_t=${Date.now()}`
      : `${url}?_t=${Date.now()}`;

    _profile = { ..._profile, avatar_url: url };

    const heroImg = document.getElementById('perfil-avatar-img');
    if (heroImg) {
      heroImg.src = cacheBustedUrl;
      heroImg.hidden = false;
      document.getElementById('perfil-initials').hidden = true;
    }

    renderHeaderChip(_chipSlot, _profile, () => window.location.replace('./login.html'));

    status.textContent = '✓ Foto actualizada';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch (err) {
    showToast(err.message, 'error');
    status.textContent = '';
  } finally {
    avatarWrap?.classList.remove('profile-avatar-wrap--loading');
    track.hidden = true;
    bar.style.width = '0%';
    document.getElementById('perfil-avatar-input').value = '';
  }
}

// ── Image modal ───────────────────────────────────────────────
function openImageModal(url) {
  document.getElementById('img-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'img-modal'; overlay.className = 'img-modal';
  const img = document.createElement('img');
  img.src = url; img.className = 'img-modal__img'; img.alt = 'Imagen';
  const btn = document.createElement('button');
  btn.className = 'img-modal__close'; btn.type = 'button';
  btn.appendChild(Icons.close(20));
  const close = () => overlay.remove();
  btn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
  overlay.appendChild(btn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}
