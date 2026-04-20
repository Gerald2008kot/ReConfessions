// js/perfil.js
// Vista Mi Perfil — inyecta su HTML la primera vez que se abre

import { sb }                                    from './api.js';
import { getCurrentUser, getProfile, signOut,
         renderHeaderChip }                      from './auth.js';
import { uploadImage }                           from './upload.js';
import { getInitials, showToast, formatDate }    from './utils.js';
import { Icons }                                 from './icons.js';
import { tagColor, countMap }                    from './shared.js';
import { routerPush, routerBack }               from './router.js';

let _user    = null;
let _profile = null;
let _chipSlot = null;
let _onBack   = null;
let _mounted  = false;

// ── Inyectar HTML de la vista ────────────────────────────────
function mountPerfilHTML() {
  if (_mounted) return;
  _mounted = true;

  const view = document.createElement('div');
  view.id = 'view-perfil';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
  <header class="app-header">
    <button id="perfil-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <h2 class="app-header__title">Mi Perfil</h2>
    <div style="min-width:44px"></div>
  </header>
  <div style="overflow-y:auto;flex:1;scrollbar-width:none;">
    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">
          <span id="perfil-initials" class="profile-avatar__initials"></span>
          <img id="perfil-avatar-img" class="profile-avatar__img" alt="Foto de perfil" hidden />
        </div>
        <label class="profile-avatar__edit-btn" for="perfil-avatar-input" aria-label="Cambiar foto">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
          </svg>
        </label>
        <input type="file" id="perfil-avatar-input" class="uploader__input" accept="image/jpeg,image/png,image/gif,image/webp" />
      </div>
      <h2 id="perfil-name"  class="profile-name"></h2>
      <p  id="perfil-email" class="profile-email"></p>
      <span id="perfil-admin-badge" class="profile-admin-badge" hidden>Admin</span>
      <div class="uploader__progress-track" id="perfil-avatar-track" hidden style="width:180px;margin:10px auto 0">
        <div id="perfil-avatar-bar" class="uploader__progress-bar"></div>
      </div>
      <p id="perfil-avatar-status" class="profile-status"></p>
      <div class="profile-stats">
        <div class="profile-stat">
          <span id="perfil-stat-conf"  class="profile-stat__value">—</span>
          <span class="profile-stat__label">Confesiones</span>
        </div>
        <div class="profile-stat">
          <span id="perfil-stat-cm"    class="profile-stat__value">—</span>
          <span class="profile-stat__label">Respuestas</span>
        </div>
        <div class="profile-stat">
          <span id="perfil-stat-likes" class="profile-stat__value">—</span>
          <span class="profile-stat__label">Likes</span>
        </div>
        <div class="profile-stat">
          <span id="perfil-stat-views" class="profile-stat__value">—</span>
          <span class="profile-stat__label">Vistas</span>
        </div>
      </div>
      <div class="profile-actions">
        <button id="perfil-signout-btn" class="profile-signout-btn" type="button">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/>
          </svg>
          Cerrar Sesión
        </button>
      </div>
    </div>

    <div class="perfil-bio-wrap">
      <p class="perfil-bio-label">Bio</p>
      <textarea id="perfil-bio-input" placeholder="Cuéntanos algo sobre ti…" maxlength="200" rows="3"></textarea>
    </div>

    <div class="perfil-private-row">
      <div>
        <p class="perfil-private-label">Perfil privado</p>
        <p class="perfil-private-desc">Tus confesiones no aparecen en el feed público</p>
      </div>
      <label class="toggle-switch" aria-label="Activar perfil privado">
        <input type="checkbox" id="perfil-private-toggle" />
        <span class="toggle-switch__track"></span>
      </label>
    </div>

    <div class="chat-divider" style="padding:0 16px;margin:0 0 4px">
      <div class="chat-divider__line"></div>
      <span class="chat-divider__label">Mis confesiones</span>
      <div class="chat-divider__line"></div>
    </div>
    <div id="perfil-feed" class="feed-scroll" style="flex:none;overflow-y:visible;padding-bottom:40px;gap:8px">
      <p class="feed-empty">Cargando…</p>
    </div>
  </div>`;

  document.getElementById('app-root').appendChild(view);
}

// ── Init ──────────────────────────────────────────────────────
export async function initPerfil(user, profile, chipSlot, onBack) {
  _user     = user;
  _profile  = profile;
  _chipSlot = chipSlot;
  _onBack   = onBack;

  mountPerfilHTML();

  document.getElementById('perfil-back-btn')?.addEventListener('click', routerBack);
  document.getElementById('perfil-signout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.replace('./login.html');
  });

  const avatarInput = document.getElementById('perfil-avatar-input');
  avatarInput?.addEventListener('change', handleAvatarUpload);

  const bioInput = document.getElementById('perfil-bio-input');
  if (bioInput) {
    bioInput.addEventListener('blur', () => saveBio(bioInput.value.trim()));
    bioInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bioInput.blur(); }
    });
  }

  const privateToggle = document.getElementById('perfil-private-toggle');
  if (privateToggle) {
    privateToggle.addEventListener('change', async () => {
      const { error } = await sb.from('profiles')
        .update({ is_private: privateToggle.checked })
        .eq('id', _user.id);
      if (error) { showToast(error.message, 'error'); privateToggle.checked = !privateToggle.checked; return; }
      _profile = { ..._profile, is_private: privateToggle.checked };
      showToast(privateToggle.checked ? 'Perfil privado activado.' : 'Perfil privado desactivado.', 'success');
    });
  }
}

// ── Abrir ─────────────────────────────────────────────────────
export async function openPerfil() {
  routerPush('perfil', _closePerfilUI);

  const view = document.getElementById('view-perfil');
  document.getElementById('view-feed')?.classList.remove('active');
  view.hidden = false;
  requestAnimationFrame(() => view.classList.add('active'));

  renderHero(_profile);
  loadStats();
  loadMyConfessions();
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
  document.getElementById('perfil-name').textContent     = p.full_name;
  document.getElementById('perfil-email').textContent    = _user.email;
  document.getElementById('perfil-initials').textContent = getInitials(p.full_name);
  document.getElementById('perfil-admin-badge').hidden   = !p.is_admin;

  const bioInput = document.getElementById('perfil-bio-input');
  if (bioInput) bioInput.value = p.bio || '';

  const privateToggle = document.getElementById('perfil-private-toggle');
  if (privateToggle) privateToggle.checked = !!p.is_private;

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

// ── Bio ───────────────────────────────────────────────────────
async function saveBio(bio) {
  const prev = _profile?.bio || '';
  if (bio === prev) return;
  const { error } = await sb.from('profiles').update({ bio }).eq('id', _user.id);
  if (error) { showToast(error.message, 'error'); return; }
  _profile = { ..._profile, bio };
  showToast('Bio actualizada.', 'success');
}

// ── Stats ──────────────────────────────────────────────────────
async function loadStats() {
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    sb.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', _user.id),
    sb.from('comments').select('id',    { count: 'exact', head: true }).eq('user_id', _user.id),
  ]);
  document.getElementById('perfil-stat-conf').textContent = c1 ?? 0;
  document.getElementById('perfil-stat-cm').textContent   = c2 ?? 0;

  const { data: myIds } = await sb.from('confessions').select('id').eq('user_id', _user.id);
  const ids = myIds?.map(r => r.id) || [];

  if (ids.length) {
    const [{ count: lk }, { count: cv }] = await Promise.all([
      sb.from('likes').select('id', { count: 'exact', head: true }).in('confession_id', ids),
      sb.from('confession_views').select('id', { count: 'exact', head: true }).in('confession_id', ids),
    ]);
    document.getElementById('perfil-stat-likes').textContent = lk ?? 0;
    const viewsEl = document.getElementById('perfil-stat-views');
    if (viewsEl) viewsEl.textContent = cv ?? 0;
  } else {
    document.getElementById('perfil-stat-likes').textContent = '0';
    const viewsEl = document.getElementById('perfil-stat-views');
    if (viewsEl) viewsEl.textContent = '0';
  }
}

// ── Mis confesiones ───────────────────────────────────────────
async function loadMyConfessions() {
  const feed = document.getElementById('perfil-feed');
  while (feed.firstChild) feed.removeChild(feed.firstChild);
  feed.appendChild(Object.assign(document.createElement('p'), { className: 'feed-empty', textContent: 'Cargando…' }));

  const { loadConfessions } = await import('./feed.js');
  await loadConfessions(feed, _user.id);
}

// ── Avatar upload ─────────────────────────────────────────────
async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const track  = document.getElementById('perfil-avatar-track');
  const bar    = document.getElementById('perfil-avatar-bar');
  const status = document.getElementById('perfil-avatar-status');
  if (track) track.hidden = false;
  if (status) status.textContent = 'Subiendo…';

  try {
    const url = await uploadImage(file, (pct) => {
      if (bar) bar.style.width = `${pct}%`;
    });

    const { error } = await sb.from('profiles')
      .update({ avatar_url: url })
      .eq('id', _user.id);

    if (error) throw new Error(error.message);

    _profile = { ..._profile, avatar_url: url };
    renderHero(_profile);
    if (_chipSlot) renderHeaderChip(_chipSlot, _profile, () => {});
    if (status) status.textContent = '¡Foto actualizada!';
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
  } catch (err) {
    showToast(err.message, 'error');
    if (status) status.textContent = '';
  } finally {
    if (track) track.hidden = true;
    if (bar)   bar.style.width = '0%';
    e.target.value = '';
  }
}
