// js/perfil.js
// ============================================================
// Vista de Perfil — se renderiza como SPA view dentro de index.html
// ============================================================

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile, signOut,
         renderHeaderChip }                      from './auth.js';
import { uploadImage }                           from './upload.js';
import { getInitials, showToast, formatDate }    from './utils.js';
import { Icons }                                 from './icons.js';
import { tagColor, countMap }                    from './shared.js';

let _user    = null;
let _profile = null;
let _chipSlot = null;
let _onBack   = null;

// ── Init (llamado una vez desde boot) ─────────────────────────
export async function initPerfil(user, profile, chipSlot, onBack) {
  _user     = user;
  _profile  = profile;
  _chipSlot = chipSlot;
  _onBack   = onBack;

  document.getElementById('perfil-back-btn')?.addEventListener('click', closePerfil);
  document.getElementById('perfil-signout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.replace('./login.html');
  });

  const avatarInput = document.getElementById('perfil-avatar-input');
  avatarInput?.addEventListener('change', handleAvatarUpload);
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openPerfil() {
  history.pushState({ view: 'perfil' }, '');

  const view = document.getElementById('view-perfil');
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));

  renderHero(_profile);
  loadStats();
  loadMyConfessions();
}

export function closePerfil() {
  const view = document.getElementById('view-perfil');
  view.classList.remove('active');
  setTimeout(() => { view.hidden = true; }, 300);
  document.getElementById('view-feed')?.classList.add('active');
  _onBack?.();
}

// ── Hero ──────────────────────────────────────────────────────
function renderHero(p) {
  if (!p) return;
  document.getElementById('perfil-name').textContent     = p.full_name;
  document.getElementById('perfil-email').textContent    = _user.email;
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
}

// ── Stats ──────────────────────────────────────────────────────
async function loadStats() {
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    sb.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', _user.id),
    sb.from('comments').select('id',    { count: 'exact', head: true }).eq('user_id', _user.id),
  ]);
  document.getElementById('perfil-stat-conf').textContent = c1 ?? 0;
  document.getElementById('perfil-stat-cm').textContent   = c2 ?? 0;

  // Likes recibidos
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
  pill.style.background = bg;
  pill.style.color = fg;
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
  footer.appendChild(cmBtn);

  card.appendChild(footer);
  return card;
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
  const track = document.getElementById('perfil-avatar-track');
  const bar   = document.getElementById('perfil-avatar-bar');
  const status = document.getElementById('perfil-avatar-status');
  track.hidden = false; bar.style.width = '0%'; status.textContent = '';
  try {
    const url = await uploadImage(file, pct => { bar.style.width = pct + '%'; });
    const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', _user.id);
    if (error) throw new Error(error.message);
    _profile = { ..._profile, avatar_url: url };
    renderHero(_profile);
    renderHeaderChip(_chipSlot, _profile, () => window.location.replace('./login.html'));
    status.textContent = '✓ Foto actualizada';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch (err) { showToast(err.message, 'error'); }
  finally {
    track.hidden = true; bar.style.width = '0%';
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
