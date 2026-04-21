// js/feed.js
// ============================================================
// Feed principal — genera su propio HTML, queries agrupados y cacheados
// ============================================================

import { sb }                                  from './api.js';
import { getCurrentUser, getProfile }          from './auth.js';
import { el, formatDate, showToast, getInitials } from './utils.js';
import { initImageUploader, extractPublicId, deleteCloudinaryImage } from './upload.js';
import { initChat, openChat as _chatOpenChat }  from './chat.js';

// Re-exportar openChat para que hilos.js, explorar.js y buscar.js
// puedan importarla desde feed.js (evita el error de export no encontrado).
export { _chatOpenChat as openChat };
import { Icons }                               from './icons.js';
import { tagColor, countMap as sharedCountMap } from './shared.js';
import { routerPush, routerBack }              from './router.js';
import { cacheGet, cacheSet, cacheOr }         from './cache.js';

let currentUser    = null;
let currentProfile = null;

let realtimeChannel  = null;
let pollingInterval  = null;
let lastConfessionId = null;
let activeView       = 'feed';

let activeHashtagFilter = null;
let activeSort          = 'recent';

const PAGE_SIZE      = 20;
let   _page          = 0;
let   _allLoaded     = false;
let   _isLoadingMore = false;
let   _intersectionObs = null;

let _pickerSelected = [];
let _pickerOpen     = false;

// ── Callback para abrir autor.js al tocar avatar ──────────────
// Se registra desde index.html tras inicializar autor.js.
let _openAutorFn = null;
export function setOpenAutorCallback(fn) { _openAutorFn = fn; }

let feedEl, feedView, chatView,
    composeInput, composeHashtag, composeImgInput,
    composeImgPreview, composeProgressBar, composeSendBtn,
    composePollToggle, composePollInput;

export const HASHTAGS = [
  '#Confesión','#Desamor','#Traición','#Ruptura','#Secreto',
  '#Familia','#Trabajo','#Amistad','#Vergüenza','#Arrepentimiento',
  '#Felicidad','#Miedo','#Sueño','#Enojo','#Nostalgia',
];

// ── HTML Templates ────────────────────────────────────────────
// Genera el HTML del feed en el contenedor raíz
export function mountFeedHTML(root) {
  root.innerHTML = `
<!-- VISTA: FEED -->
<div id="view-feed" class="view active">
  <header class="app-header">
    <button id="logo-btn" class="app-header__logo-btn" type="button" aria-label="ReConfessions — recargar feed">
      Re-Confessions
    </button>
    <div class="app-header__actions">
      <button id="notif-btn" class="app-header__icon-btn" type="button" aria-label="Notificaciones" style="position:relative" hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
        </svg>
        <span id="notif-badge" class="notif-badge" hidden>0</span>
      </button>
      <button id="hilos-btn" class="app-header__icon-btn" type="button" aria-label="Hilos guardados" hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/>
        </svg>
        <span id="hilos-badge" class="header-badge" hidden>0</span>
      </button>
      <button id="theme-btn" class="app-header__icon-btn" type="button" aria-label="Cambiar tema">
        <svg id="theme-icon-dark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
        </svg>
        <svg id="theme-icon-light" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" hidden>
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
        </svg>
      </button>
      <div id="header-chip"></div>
    </div>
  </header>

  <main id="feed" class="feed-scroll" aria-label="Feed de confesiones" aria-live="polite">
    <p class="feed-empty">Cargando confesiones…</p>
  </main>

  <div id="feed-sentinel" aria-hidden="true"></div>
  <div id="feed-loading-more" hidden>Cargando más…</div>

  <div id="compose-bar" class="compose-bar" hidden>
    <div class="compose-bar__top">
      <select id="compose-hashtag" aria-hidden="true" tabindex="-1"></select>
      <div id="ht-picker" class="ht-picker" style="flex:1;min-width:0"></div>
      <label class="compose-img-btn" for="compose-img-input" title="Adjuntar imagen" aria-label="Adjuntar imagen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
        </svg>
      </label>
      <button id="compose-poll-toggle" class="compose-img-btn compose-poll-btn" type="button" title="Añadir encuesta" aria-label="Añadir encuesta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
        </svg>
      </button>
      <input type="file" id="compose-img-input" class="uploader__input" accept="image/jpeg,image/png,image/gif,image/webp" />
    </div>
    <div id="compose-poll-row" class="compose-poll-row" hidden>
      <div class="compose-poll-type-row">
        <button id="poll-type-simple" class="compose-poll-type-btn compose-poll-type-btn--active" type="button" data-type="simple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="15" height="15" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"/>
          </svg>
          Sí / No
        </button>
        <button id="poll-type-advanced" class="compose-poll-type-btn" type="button" data-type="advanced">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="15" height="15" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
          </svg>
          Opciones
        </button>
      </div>
      <div class="compose-poll-question-wrap">
        <span id="compose-poll-label" class="compose-poll-row__label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>
          </svg>
          Pregunta Sí/No
        </span>
        <input id="compose-poll-input" class="compose-poll-input" type="text" placeholder="¿Me debería disculpar?" maxlength="140" aria-label="Pregunta de la encuesta" />
      </div>
      <div id="compose-poll-options" class="compose-poll-options" hidden>
        <input class="compose-poll-option-input" type="text" placeholder="Opción 1" maxlength="100" />
        <input class="compose-poll-option-input" type="text" placeholder="Opción 2" maxlength="100" />
        <input class="compose-poll-option-input" type="text" placeholder="Opción 3 (opcional)" maxlength="100" />
        <input class="compose-poll-option-input" type="text" placeholder="Opción 4 (opcional)" maxlength="100" />
      </div>
    </div>
    <div id="compose-img-preview" class="compose-img-preview" hidden></div>
    <div class="uploader__progress-track" hidden>
      <div id="compose-progress" class="uploader__progress-bar"></div>
    </div>
    <div class="compose-bar__input-row">
      <textarea id="compose-input" class="compose-textarea" placeholder="Confiesa algo…" maxlength="2000" rows="2" aria-label="Escribe tu confesión"></textarea>
      <button id="compose-send-btn" class="compose-send-btn" type="button" aria-label="Publicar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
        </svg>
      </button>
    </div>
  </div>

  <div id="login-prompt-bar" class="login-prompt-bar" hidden>
    <a href="#" onclick="event.preventDefault();window.__showLogin&&window.__showLogin()" class="login-prompt-bar__link">
      Inicia sesión para confesar
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
      </svg>
    </a>
  </div>
</div>

<!-- VISTA: CHAT (Hilo) — siempre presente, se activa con .active -->
<div id="view-chat" class="view">
  <header class="app-header">
    <button id="chat-back-btn" class="app-header__back" type="button" aria-label="Volver">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
      </svg>
    </button>
    <h2 class="app-header__title">Hilo</h2>
    <div id="chat-save-slot" style="display:flex;align-items:center;min-width:44px;justify-content:flex-end"></div>
  </header>
  <div class="chat-scroll">
    <div id="chat-confession-slot" class="chat-confession-slot"></div>
    <div class="chat-divider">
      <div class="chat-divider__line"></div>
      <span class="chat-divider__label">Comentarios</span>
      <div class="chat-divider__line"></div>
    </div>
    <div id="chat-comment-list" class="chat-comment-list" role="log" aria-live="polite"></div>
  </div>
  <div id="chat-input-bar" class="chat-input-bar" hidden>
    <input id="chat-comment-input" class="chat-input" type="text" placeholder="Escribe un consejo…" maxlength="500" aria-label="Tu comentario" />
    <button id="chat-comment-submit" class="chat-send-btn" type="button" aria-label="Enviar">Enviar</button>
  </div>
  <div id="chat-login-prompt" class="chat-login-prompt" hidden>
    <a href="#" onclick="event.preventDefault();window.__showLogin&&window.__showLogin()">Inicia sesión</a> para unirte a la conversación.
  </div>
</div>
`;
}

// Inyecta el profile sheet (overlay + bottom sheet) en el body
export function mountProfileSheet(body) {
  if (document.getElementById('profile-sheet')) return;

  const overlay = document.createElement('div');
  overlay.id = 'profile-overlay';
  overlay.className = 'profile-overlay';
  body.appendChild(overlay);

  const sheet = document.createElement('div');
  sheet.id = 'profile-sheet';
  sheet.className = 'profile-sheet';
  sheet.innerHTML = `
  <div id="profile-sheet-handle" class="profile-sheet__handle"></div>
  <div class="profile-sheet__body">
    <div class="profile-sheet__user">
      <div id="sheet-avatar" class="profile-sheet__avatar"></div>
      <div>
        <p id="sheet-name"  class="profile-sheet__name"></p>
        <p id="sheet-email" class="profile-sheet__email"></p>
      </div>
    </div>
    <div class="profile-sheet__actions">
      <button id="sheet-perfil" class="profile-sheet__item profile-sheet__item--btn" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
        </svg>
        <span>Mi Perfil y Foto</span>
      </button>
      <button id="sheet-buscar" class="profile-sheet__item profile-sheet__item--btn" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
        </svg>
        <span>Buscar</span>
      </button>


      <button id="sheet-admin" class="profile-sheet__item profile-sheet__item--btn" type="button" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/>
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <span>Administración</span>
        <span class="profile-sheet__item-badge">Admin</span>
      </button>
      <button id="sheet-signout" class="profile-sheet__signout" type="button">Cerrar Sesión</button>
    </div>
  </div>`;
  body.appendChild(sheet);
}

// ── SVGs internos ────────────────────────────────────────────
const SvgPoll = (size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75
       C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z
       M9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25
       c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625z
       M16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75
       c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>`;
  return s;
};

const SvgThumbUp = (size = 15) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0
       012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0
       00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5
       c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126
       c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0
       01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23
       l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75
       c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368
       a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203
       4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0
       00-1.302 4.665c0 1.194.232 2.333.654 3.375z"/>`;
  return s;
};

const SvgThumbDown = (size = 15) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.6');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
    d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977
       a8.963 8.963 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908
       c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507
       0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053
       c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48
       a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504
       c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285
       C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0
       00 7.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633
       c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715
       a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"/>`;
  return s;
};

const SvgCheck = (size = 14) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 16 16'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2.2');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M3 8l3.5 3.5L13 5"/>`;
  return s;
};

const SvgChevronDown = (size = 14) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>`;
  return s;
};

const SvgX = (size = 10) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
  s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2.5');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden','true');
  s.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>`;
  return s;
};

// ── Init ────────────────────────────────────────────────────
export async function initFeed() {
  feedEl             = document.getElementById('feed');
  feedView           = document.getElementById('view-feed');
  chatView           = document.getElementById('view-chat');
  composeInput       = document.getElementById('compose-input');
  composeHashtag     = document.getElementById('compose-hashtag');
  composeImgInput    = document.getElementById('compose-img-input');
  composeImgPreview  = document.getElementById('compose-img-preview');
  composeProgressBar = document.getElementById('compose-progress');
  composeSendBtn     = document.getElementById('compose-send-btn');
  composePollToggle  = document.getElementById('compose-poll-toggle');
  composePollInput   = document.getElementById('compose-poll-input');

  currentUser = await getCurrentUser();
  if (currentUser) currentProfile = await getProfile(currentUser.id);

  document.getElementById('compose-bar')?.toggleAttribute('hidden', !currentUser);
  document.getElementById('login-prompt-bar')?.toggleAttribute('hidden', !!currentUser);

  initHashtagPicker();
  initPollToggle();

  if (composeImgInput) {
    const uploader = initImageUploader(composeImgInput, composeImgPreview, composeProgressBar);
    window.__composeUploader = uploader;
  }

  await initChat(_closeChatUI);
  await loadConfessions();
  initComposeForm();
  startRealtime();
  handleHashNavigation();
  initInfiniteScroll();
}

// ── Infinite scroll ──────────────────────────────────────────
function initInfiniteScroll() {
  const sentinel = document.getElementById('feed-sentinel');
  if (!sentinel) return;

  _intersectionObs?.disconnect();
  _intersectionObs = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting && !_isLoadingMore && !_allLoaded) {
      await loadMoreConfessions();
    }
  }, { rootMargin: '200px' });

  _intersectionObs.observe(sentinel);
}

async function loadMoreConfessions() {
  _isLoadingMore = true;
  _page++;

  const spinner = document.getElementById('feed-loading-more');
  if (spinner) spinner.hidden = false;

  try {
    const { data, profileMap, likeMap, commentMap, userLikedSet, pollMap, userVoteMap } =
      await fetchConfessionsPage(_page);

    if (!data?.length) {
      _allLoaded = true;
      if (spinner) spinner.hidden = true;
      return;
    }

    data.forEach(c => buildCard(
      c, feedEl, false, false,
      likeMap[c.id] || 0, commentMap[c.id] || 0,
      userLikedSet.has(c.id), profileMap[c.user_id] || null,
      pollMap[c.id] || null, userVoteMap[pollMap[c.id]?.id] || null,
    ));

    if (data.length < PAGE_SIZE) _allLoaded = true;
  } finally {
    _isLoadingMore = false;
    const spinner2 = document.getElementById('feed-loading-more');
    if (spinner2) spinner2.hidden = true;
  }
}

// ── Hash navigation (#confession-UUID) ──────────────────────
function handleHashNavigation() {
  const hash = window.location.hash;
  const match = hash.match(/^#confession-([0-9a-f-]{36})$/i);
  if (!match) return;
  const uuid = match[1];
  setTimeout(async () => {
    const card = document.getElementById(`card-${uuid}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('rc-card--highlight');
      card.addEventListener('animationend', () => card.classList.remove('rc-card--highlight'), { once: true });
    } else {
      const { data } = await sb.from('confessions')
        .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question')
        .eq('id', uuid).single();
      if (data) { switchView('chat'); await _chatOpenChat(data); }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }, 400);
}

// ── Custom hashtag picker ────────────────────────────────────
function initHashtagPicker() {
  const container = document.getElementById('ht-picker');
  if (!container) return;
  _pickerSelected = [HASHTAGS[0]];
  renderPicker(container);
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closePicker(container);
  });
}

function renderPicker(container) {
  container.className = `ht-picker${_pickerOpen ? ' ht-picker--open' : ''}`;
  container.innerHTML = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ht-picker__trigger';
  trigger.setAttribute('aria-label', 'Seleccionar hashtags');

  const selectedWrap = el('div', { className: 'ht-picker__selected' });

  if (_pickerSelected.length === 0) {
    selectedWrap.appendChild(el('span', { className: 'ht-picker__placeholder', textContent: 'Hashtag…' }));
  } else {
    _pickerSelected.forEach(tag => {
      const tc   = tagColor(tag);
      const chip = el('span', {
        className: 'ht-picker__chip',
        attrs: { style: `background:${tc.bg};color:${tc.fg}` },
      });
      chip.textContent = tag;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ht-picker__chip-remove';
      rm.setAttribute('aria-label', `Quitar ${tag}`);
      rm.appendChild(SvgX(9));
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        _pickerSelected = _pickerSelected.filter(t => t !== tag);
        renderPicker(container);
      });
      chip.appendChild(rm);
      selectedWrap.appendChild(chip);
    });
  }

  trigger.appendChild(selectedWrap);
  const chevron = el('span', { className: 'ht-picker__chevron' });
  chevron.appendChild(SvgChevronDown(14));
  trigger.appendChild(chevron);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    _pickerOpen = !_pickerOpen;
    renderPicker(container);
  });
  container.appendChild(trigger);

  if (_pickerOpen) {
    const dropdown = el('div', { className: 'ht-picker__dropdown', attrs: { role: 'listbox', 'aria-multiselectable': 'true' } });
    HASHTAGS.forEach(tag => {
      const tc       = tagColor(tag);
      const isSelected = _pickerSelected.includes(tag);
      const maxReached = _pickerSelected.length >= 3 && !isSelected;
      const opt = el('button', {
        className: `ht-picker__option${isSelected ? ' ht-picker__option--selected' : ''}${maxReached ? ' ht-picker__option--disabled' : ''}`,
        textContent: tag,
        attrs: { type: 'button', role: 'option', 'aria-selected': String(isSelected), style: `background:${tc.bg};color:${tc.fg}` },
      });
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelected) { _pickerSelected = _pickerSelected.filter(t => t !== tag); }
        else if (_pickerSelected.length < 3) { _pickerSelected = [..._pickerSelected, tag]; }
        if (_pickerSelected.length === 0) _pickerSelected = [tag];
        renderPicker(container);
      });
      dropdown.appendChild(opt);
    });
    const hint = el('p', { className: 'ht-picker__hint', textContent: 'Máx. 3 hashtags' });
    dropdown.appendChild(hint);
    container.appendChild(dropdown);
  }
}

function closePicker(container) {
  if (!_pickerOpen) return;
  _pickerOpen = false;
  renderPicker(container);
}

// ── Poll toggle (compose) ────────────────────────────────────
function initPollToggle() {
  if (!composePollToggle) return;
  composePollToggle.addEventListener('click', () => {
    const pollRow = document.getElementById('compose-poll-row');
    if (!pollRow) return;
    const isOpen = !pollRow.hidden;
    pollRow.hidden = isOpen;
    composePollToggle.classList.toggle('compose-poll-btn--active', !isOpen);
    if (!isOpen && composePollInput) composePollInput.focus();
  });
  document.getElementById('poll-type-simple')?.addEventListener('click',   () => setPollType('simple'));
  document.getElementById('poll-type-advanced')?.addEventListener('click', () => setPollType('advanced'));
}

function setPollType(type) {
  document.getElementById('poll-type-simple')?.classList.toggle('compose-poll-type-btn--active',   type === 'simple');
  document.getElementById('poll-type-advanced')?.classList.toggle('compose-poll-type-btn--active', type === 'advanced');
  const advOptions  = document.getElementById('compose-poll-options');
  const simpleLabel = document.getElementById('compose-poll-label');
  if (advOptions)  advOptions.hidden  = type !== 'advanced';
  if (simpleLabel) simpleLabel.hidden = type !== 'simple';
}

// ── Vista switch ─────────────────────────────────────────────

// Almacena el callback de "quién debe verse al cerrar el chat".
// Se actualiza vía setChatViewBackCallback antes de cada apertura.
let _chatViewBackFn = null;

// Llamar desde hilos/explorar/buscar ANTES de switchView para indicar
// qué función restaura su propia vista (independiente del onBackCallback de chat.js).
export function setChatViewBackCallback(fn) {
  _chatViewBackFn = fn;
}

function _closeChatUI() {
  activeView = 'feed';
  chatView?.classList.remove('active');
  if (_chatViewBackFn) {
    // Una vista externa (hilos, explorar, buscar) abrió el chat — dejarle restaurar.
    const fn = _chatViewBackFn;
    _chatViewBackFn = null;
    fn();
  } else {
    // Apertura normal desde el feed — volver al feed.
    feedView?.classList.add('active');
  }
}

export function switchView(view, pushHistory = true) {
  activeView = view;
  if (view === 'chat') {
    feedView?.classList.remove('active');
    chatView?.classList.add('active');
    if (pushHistory) routerPush('chat', _closeChatUI);
  } else {
    _chatViewBackFn = null;
    feedView?.classList.add('active');
    chatView?.classList.remove('active');
  }
}

// ── Load confessions ─────────────────────────────────────────
export async function loadConfessions(containerEl, userId = null) {
  const target = containerEl || feedEl;

  if (!containerEl && !userId) {
    _page       = 0;
    _allLoaded  = false;
    _intersectionObs?.disconnect();
  }

  const { data, profileMap, likeMap, commentMap, userLikedSet, pollMap, userVoteMap } =
    await fetchConfessionsPage(0, userId);

  while (target.firstChild) target.removeChild(target.firstChild);

  if (!data?.length) {
    target.appendChild(el('p', { className: 'feed-empty', textContent: 'Sin confesiones todavía.' }));
    return;
  }

  if (!userId && !containerEl) {
    const pinned = data.filter(c => c.is_pinned);
    const rest   = data.filter(c => !c.is_pinned);
    [...pinned, ...rest].forEach(c => buildCard(
      c, target, false, false,
      likeMap[c.id] || 0, commentMap[c.id] || 0,
      userLikedSet.has(c.id), profileMap[c.user_id] || null,
      pollMap[c.id] || null, userVoteMap[pollMap[c.id]?.id] || null,
    ));
  } else {
    data.forEach(c => buildCard(
      c, target, false, false,
      likeMap[c.id] || 0, commentMap[c.id] || 0,
      userLikedSet.has(c.id), profileMap[c.user_id] || null,
      pollMap[c.id] || null, userVoteMap[pollMap[c.id]?.id] || null,
    ));
  }

  if (!userId) lastConfessionId = data[0]?.id;

  if (!containerEl && !userId) {
    _allLoaded = data.length < PAGE_SIZE;
    initInfiniteScroll();
  }
}

// ── Fetch una página — queries batch + caché de profiles ──────
async function fetchConfessionsPage(page = 0, userId = null) {
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = sb
    .from('confessions')
    .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question, is_pinned')
    .range(from, to);

  if (userId) {
    query = query.eq('user_id', userId).order('created_at', { ascending: false });
  } else {
    if (activeHashtagFilter) {
      query = query.or(`hashtags.cs.{"${activeHashtagFilter}"},hashtag.eq.${activeHashtagFilter}`);
    }
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) { showToast('Error cargando confesiones.', 'error'); return { data: [], profileMap: {}, likeMap: {}, commentMap: {}, userLikedSet: new Set(), pollMap: {}, userVoteMap: {} }; }

  const ids     = data?.map(c => c.id) || [];
  const userIds = [...new Set(data?.map(c => c.user_id) || [])];

  // ── Todo en paralelo, perfiles cacheados por ID ───────────────
  const [likesOwn, likesAll, commentsAll, profilesRaw] = await Promise.all([
    // Likes del usuario actual (solo si está logueado)
    currentUser
      ? sb.from('likes').select('confession_id').eq('user_id', currentUser.id).in('confession_id', ids)
      : Promise.resolve({ data: [] }),
    // Conteo de likes por confesión
    ids.length ? sb.from('likes').select('confession_id').in('confession_id', ids) : Promise.resolve({ data: [] }),
    // Conteo de comentarios
    ids.length ? sb.from('comments').select('confession_id').in('confession_id', ids) : Promise.resolve({ data: [] }),
    // Perfiles — usa caché cuando puede
    fetchProfilesCached(userIds),
  ]);

  const userLikedSet = new Set(likesOwn.data?.map(r => r.confession_id) || []);
  const likeMap      = buildCountMap(likesAll.data, 'confession_id');
  const commentMap   = buildCountMap(commentsAll.data, 'confession_id');
  const profileMap   = profilesRaw;

  // ── Polls (solo si hay confesiones con encuesta) ─────────────
  const pollIds = data?.filter(c => c.poll_question).map(c => c.id) || [];
  let pollMap = {}, userVoteMap = {};

  if (pollIds.length) {
    const { data: polls } = await sb
      .from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .in('confession_id', pollIds);

    pollMap = Object.fromEntries((polls || []).map(p => [p.confession_id, p]));

    if (currentUser && polls?.length) {
      const pIds = polls.map(p => p.id);
      const { data: votes } = await sb
        .from('poll_votes').select('poll_id, vote, option_id')
        .eq('user_id', currentUser.id).in('poll_id', pIds);
      userVoteMap = Object.fromEntries((votes || []).map(v => [v.poll_id, { vote: v.vote, option_id: v.option_id }]));
    }
  }

  return { data, profileMap, likeMap, commentMap, userLikedSet, pollMap, userVoteMap };
}

// ── Perfiles cacheados — evita re-fetching de profiles ya vistos
async function fetchProfilesCached(userIds) {
  if (!userIds.length) return {};

  const cached  = {};
  const missing = [];

  for (const id of userIds) {
    const hit = cacheGet(`profile:${id}`);
    if (hit) cached[id] = hit;
    else     missing.push(id);
  }

  if (missing.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, avatar_url, full_name')
      .in('id', missing);

    for (const p of (profiles || [])) {
      cacheSet(`profile:${p.id}`, p, 5 * 60_000); // 5 min TTL
      cached[p.id] = p;
    }
  }

  return cached;
}

function buildCountMap(rows, key) {
  const map = {};
  rows?.forEach(r => { map[r[key]] = (map[r[key]] || 0) + 1; });
  return map;
}

function effectiveTags(confession) {
  if (confession.hashtags?.length) return confession.hashtags;
  if (confession.hashtag)          return [confession.hashtag];
  return ['#Confesión'];
}

// ── Card compacta ─────────────────────────────────────────────
export function buildCard(confession, container, prependToTop, animate, likeCount, commentCount, isLiked, authorProfile, poll = null, userVoteInfo = null) {
  if (container === feedEl && document.getElementById(`card-${confession.id}`)) return;

  const card = el('article', {
    className: `rc-card${animate ? ' rc-card--new' : ''}${confession.is_pinned ? ' rc-card--pinned' : ''}`,
    attrs: { id: container === feedEl ? `card-${confession.id}` : undefined },
  });

  if (confession.is_pinned) {
    const pin = el('div', { className: 'rc-card__pin-badge', textContent: ' Destacada' });
    card.appendChild(pin);
  }

  const top = el('div', { className: 'rc-card__top' });
  const avatarEl = el('div', { className: 'rc-card__avatar' });
  if (authorProfile?.avatar_url) {
    const img = document.createElement('img');
    img.src = authorProfile.avatar_url; img.alt = 'Avatar anónimo'; img.loading = 'lazy';
    avatarEl.appendChild(img);
  } else {
    avatarEl.appendChild(Icons.user(14));
  }
  // Tocar el avatar abre el perfil del autor (autor.js)
  // Usamos captura (true) para interceptar ANTES del listener click de la card.
  if (confession.user_id && _openAutorFn) {
    avatarEl.style.cursor = 'pointer';
    avatarEl.setAttribute('title', 'Ver perfil del autor');
    avatarEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      _openAutorFn(confession.user_id);
    }, true); // capture = true
  }
  top.appendChild(avatarEl);

  const tags = effectiveTags(confession);
  if (tags.length === 1) {
    const tc = tagColor(tags[0]);
    top.appendChild(el('span', {
      className: 'rc-card__tag', textContent: tags[0],
      attrs: { style: `background:${tc.bg};color:${tc.fg}` },
    }));
  } else {
    const tagsWrap = el('div', { className: 'rc-card__tags' });
    tags.forEach(tag => {
      const tc = tagColor(tag);
      tagsWrap.appendChild(el('span', {
        className: 'rc-card__tag', textContent: tag,
        attrs: { style: `background:${tc.bg};color:${tc.fg}` },
      }));
    });
    top.appendChild(tagsWrap);
  }

  top.appendChild(el('span', { className: 'rc-card__time', textContent: formatDate(confession.created_at) }));

  if (canDelete(confession.user_id)) {
    const delBtn = el('button', { className: 'rc-card__del', attrs: { type: 'button', 'aria-label': 'Borrar' } });
    delBtn.appendChild(Icons.trash(15));
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConfession(confession.id, card); });
    top.appendChild(delBtn);

    if (currentProfile?.is_admin) {
      const pinBtn = el('button', {
        className: `rc-card__pin${confession.is_pinned ? ' rc-card__pin--active' : ''}`,
        attrs: { type: 'button', 'aria-label': confession.is_pinned ? 'Desanclar' : 'Destacar', title: confession.is_pinned ? 'Desanclar' : 'Destacar' },
      });
      pinBtn.textContent = '♦️';
      pinBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(confession.id, card, pinBtn); });
      top.appendChild(pinBtn);
    }
  }

  card.appendChild(top);

  const body = el('div', { className: 'rc-card__body-row' });
  body.appendChild(el('p', { className: 'rc-card__text', textContent: confession.content }));

  if (confession.image_url) {
    const thumb = el('div', { className: 'rc-card__thumb' });
    const img   = document.createElement('img');
    img.src = confession.image_url; img.alt = 'Imagen adjunta'; img.loading = 'lazy';
    img.addEventListener('click', (e) => { e.stopPropagation(); openImageModal(confession.image_url); });
    thumb.appendChild(img);
    body.appendChild(thumb);
  }
  card.appendChild(body);

  if (poll) card.appendChild(buildPollWidget(poll, userVoteInfo, card));

  const footer = el('div', { className: 'rc-card__footer' });

  const likeBtn = el('button', {
    className: `rc-card__action${isLiked ? ' rc-card__action--liked' : ''}`,
    attrs: { type: 'button', 'aria-label': 'Me gusta' },
  });
  likeBtn.appendChild(Icons.heart(isLiked, 17));
  likeBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(likeCount) }));
  likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(confession.id, likeBtn); });
  footer.appendChild(likeBtn);

  const commentBtn = el('button', { className: 'rc-card__action', attrs: { type: 'button', 'aria-label': 'Comentarios' } });
  commentBtn.appendChild(Icons.chat(17));
  commentBtn.appendChild(el('span', { className: 'rc-card__action-count', textContent: String(commentCount) }));
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenChat(confession); });
  footer.appendChild(commentBtn);

  const shareBtn = el('button', { className: 'rc-card__action rc-card__action--share', attrs: { type: 'button', 'aria-label': 'Compartir' } });
  shareBtn.appendChild(Icons.share(17));
  shareBtn.addEventListener('click', (e) => { e.stopPropagation(); shareConfession(confession.id); });
  footer.appendChild(shareBtn);

  card.appendChild(footer);
  card.addEventListener('click', () => handleOpenChat(confession));

  container.querySelector('.feed-empty')?.remove();
  if (prependToTop) container.insertBefore(card, container.firstChild);
  else              container.appendChild(card);

  if (animate) {
    card.addEventListener('animationend', () => card.classList.remove('rc-card--new'), { once: true });
  }
}

// ── Poll widget ───────────────────────────────────────────────
function buildPollWidget(poll, userVoteInfo, card) {
  if (poll.poll_type === 'advanced' && poll.poll_options?.length) {
    return buildAdvancedPollWidget(poll, userVoteInfo, card);
  }
  return buildSimplePollWidget(poll, userVoteInfo, card);
}

function buildSimplePollWidget(poll, userVoteInfo, card) {
  const vote = typeof userVoteInfo === 'string' ? userVoteInfo : (userVoteInfo?.vote ?? null);
  const widget = el('div', { className: 'poll-widget' });
  widget.addEventListener('click', e => e.stopPropagation());
  widget.appendChild(el('p', { className: 'poll-widget__question', textContent: poll.question }));
  const total = (poll.yes_count || 0) + (poll.no_count || 0);
  const buildVoteBtn = (value, count) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isVoted = vote === value;
    const btn = el('button', { className: `poll-btn${isVoted ? ' poll-btn--voted' : ''}`, attrs: { type: 'button', 'data-vote': value } });
    const labelWrap = el('span', { className: 'poll-btn__label' });
    labelWrap.appendChild(value === 'yes' ? SvgThumbUp(14) : SvgThumbDown(14));
    labelWrap.appendChild(document.createTextNode(value === 'yes' ? ' Sí' : ' No'));
    const bar   = el('div', { className: 'poll-btn__bar' });
    bar.style.width = `${pct}%`;
    const pctEl = el('span', { className: 'poll-btn__pct', textContent: `${pct}%` });
    btn.appendChild(labelWrap); btn.appendChild(bar); btn.appendChild(pctEl);
    btn.addEventListener('click', () => castSimpleVote(poll, value, widget, card));
    return btn;
  };
  const btnRow = el('div', { className: 'poll-widget__btns' });
  btnRow.appendChild(buildVoteBtn('yes', poll.yes_count || 0));
  btnRow.appendChild(buildVoteBtn('no',  poll.no_count  || 0));
  widget.appendChild(btnRow);
  widget.appendChild(el('span', { className: 'poll-widget__total', textContent: `${total} voto${total !== 1 ? 's' : ''}` }));
  return widget;
}

function buildAdvancedPollWidget(poll, userVoteInfo, card) {
  const votedOptionId = userVoteInfo?.option_id ?? null;
  const widget = el('div', { className: 'poll-widget poll-widget--advanced' });
  widget.addEventListener('click', e => e.stopPropagation());
  widget.appendChild(el('p', { className: 'poll-widget__question', textContent: poll.question }));
  const options = [...(poll.poll_options || [])].sort((a, b) => a.position - b.position);
  const total   = options.reduce((s, o) => s + (o.vote_count || 0), 0);
  const grid = el('div', { className: 'poll-advanced-grid' });
  options.forEach(opt => {
    const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
    const isVoted = votedOptionId === opt.id;
    const btn = el('button', { className: `poll-opt-btn${isVoted ? ' poll-opt-btn--voted' : ''}`, attrs: { type: 'button' } });
    const bar = el('div', { className: 'poll-opt-btn__bar' });
    requestAnimationFrame(() => { bar.style.width = `${pct}%`; });
    const label = el('span', { className: 'poll-opt-btn__label', textContent: opt.label });
    const pctEl = el('span', { className: 'poll-opt-btn__pct', textContent: `${pct}%` });
    const check = el('span', { className: 'poll-opt-btn__check', attrs: { 'aria-hidden': 'true' } });
    check.appendChild(SvgCheck(13));
    btn.appendChild(bar); btn.appendChild(label); btn.appendChild(pctEl); btn.appendChild(check);
    btn.addEventListener('click', () => castAdvancedVote(poll, opt.id, widget, card));
    grid.appendChild(btn);
  });
  widget.appendChild(grid);
  widget.appendChild(el('span', { className: 'poll-widget__total', textContent: `${total} voto${total !== 1 ? 's' : ''}` }));
  return widget;
}

async function castSimpleVote(poll, vote, widgetEl, card) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  try {
    await sb.rpc('cast_poll_vote', { p_poll_id: poll.id, p_user_id: currentUser.id, p_vote: vote });
    const { data: fresh } = await sb.from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .eq('id', poll.id).single();
    const { data: voteRow } = await sb.from('poll_votes').select('vote, option_id')
      .eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
    widgetEl.replaceWith(buildPollWidget(fresh, voteRow || null, card));
  } catch { showToast('Error al votar.', 'error'); }
}

async function castAdvancedVote(poll, optionId, widgetEl, card) {
  if (!currentUser) { showToast('Inicia sesión para votar.', 'info'); return; }
  try {
    await sb.rpc('cast_advanced_poll_vote', { p_poll_id: poll.id, p_option_id: optionId, p_user_id: currentUser.id });
    const { data: fresh } = await sb.from('polls')
      .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
      .eq('id', poll.id).single();
    const { data: voteRow } = await sb.from('poll_votes').select('vote, option_id')
      .eq('poll_id', poll.id).eq('user_id', currentUser.id).maybeSingle();
    widgetEl.replaceWith(buildPollWidget(fresh, voteRow || null, card));
  } catch { showToast('Error al votar.', 'error'); }
}

// ── Pin (admin) ─────────────────────────────────────────────
async function togglePin(confessionId, card, pinBtn) {
  const isPinned = card.classList.contains('rc-card--pinned');
  const { error } = await sb.from('confessions')
    .update({ is_pinned: !isPinned })
    .eq('id', confessionId);
  if (error) { showToast(error.message, 'error'); return; }
  card.classList.toggle('rc-card--pinned', !isPinned);
  pinBtn.classList.toggle('rc-card__pin--active', !isPinned);
  card.querySelector('.rc-card__pin-badge')?.remove();
  if (!isPinned) {
    const badge = el('div', { className: 'rc-card__pin-badge', textContent: ' Destacada' });
    card.insertBefore(badge, card.firstChild);
  }
  showToast(isPinned ? 'Confesión desanclada.' : 'Confesión destacada.', 'success');
}

// ── Share ─────────────────────────────────────────────────────
async function shareConfession(confessionId) {
  const url = `${location.origin}${location.pathname}#confession-${confessionId}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Re-Confessions', text: 'Mira esta confesión anónima', url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); showToast('¡Enlace copiado!', 'success'); }
  catch { showToast('No se pudo copiar el enlace.', 'error'); }
}

// ── Image modal ───────────────────────────────────────────────
function openImageModal(url) {
  document.getElementById('img-modal')?.remove();
  const overlay = el('div', { className: 'img-modal', attrs: { id: 'img-modal', role: 'dialog', 'aria-modal': 'true' } });
  const img = document.createElement('img');
  img.src = url; img.alt = 'Imagen completa'; img.className = 'img-modal__img';
  const closeBtn = el('button', { className: 'img-modal__close', attrs: { type: 'button', 'aria-label': 'Cerrar' } });
  closeBtn.appendChild(Icons.close(20));
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  overlay.appendChild(closeBtn); overlay.appendChild(img);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('img-modal--open'));
}

async function handleOpenChat(confession) {
  switchView('chat');
  await _chatOpenChat(confession);
}

// ── Likes ─────────────────────────────────────────────────────
async function toggleLike(confessionId, btn) {
  if (!currentUser) { showToast('Inicia sesión para dar like.', 'info'); return; }
  const isLiked   = btn.classList.contains('rc-card__action--liked');
  const countSpan = btn.querySelector('.rc-card__action-count');
  let count       = parseInt(countSpan.textContent) || 0;
  const updateIcon = (filled) => { const o = btn.querySelector('svg'); if (o) btn.replaceChild(Icons.heart(filled, 17), o); };
  if (isLiked) {
    btn.classList.remove('rc-card__action--liked'); updateIcon(false); countSpan.textContent = String(count - 1);
    await sb.from('likes').delete().match({ confession_id: confessionId, user_id: currentUser.id });
  } else {
    btn.classList.add('rc-card__action--liked'); updateIcon(true); countSpan.textContent = String(count + 1);
    btn.classList.add('rc-card__action--pop');
    btn.addEventListener('animationend', () => btn.classList.remove('rc-card__action--pop'), { once: true });
    await sb.from('likes').insert({ confession_id: confessionId, user_id: currentUser.id });
  }
}

// ── Delete ────────────────────────────────────────────────────
async function deleteConfession(id, cardEl) {
  if (!confirm('¿Borrar esta confesión? No se puede deshacer.')) return;
  let error, imageUrl;
  if (currentProfile?.is_admin) {
    const { data, error: rpcError } = await sb.rpc('admin_delete_confession', { p_confession_id: id });
    error = rpcError; imageUrl = data ?? null;
  } else {
    const { data: row } = await sb.from('confessions').select('image_url').eq('id', id).single();
    imageUrl = row?.image_url ?? null;
    ({ error } = await sb.from('confessions').delete().eq('id', id));
  }
  if (error) { showToast(error.message, 'error'); return; }
  if (imageUrl) { const pid = extractPublicId(imageUrl); if (pid) deleteCloudinaryImage(pid); }
  (cardEl ?? document.getElementById(`card-${id}`))?.remove();
  showToast('Confesión eliminada.', 'success');
}

// ── Permisos ──────────────────────────────────────────────────
export function canDelete(rowUserId) {
  if (sessionStorage.getItem('rc_guest') === '1') return false;
  if (!currentUser) return false;
  return currentUser.id === rowUserId || !!currentProfile?.is_admin;
}

export function canDeleteAsThreadOwner(confessionUserId) {
  if (sessionStorage.getItem('rc_guest') === '1') return false;
  if (!currentUser) return false;
  return currentUser.id === confessionUserId;
}

// ── Compose form ──────────────────────────────────────────────
function initComposeForm() {
  if (!composeSendBtn || !currentUser) return;
  composeSendBtn.addEventListener('click', async () => {
    const content      = composeInput?.value.trim();
    const pollQuestion = composePollInput?.value.trim() || null;
    if (!content) return;
    const selectedTags   = _pickerSelected.length ? _pickerSelected.slice(0, 3) : ['#Confesión'];
    const primaryHashtag = selectedTags[0];
    const isAdvanced = document.getElementById('poll-type-advanced')?.classList.contains('compose-poll-type-btn--active');
    let advancedOptions = [];
    if (isAdvanced && pollQuestion) {
      advancedOptions = Array.from(document.querySelectorAll('.compose-poll-option-input'))
        .map(i => i.value.trim()).filter(Boolean).slice(0, 4);
      if (advancedOptions.length < 2) { showToast('Añade al menos 2 opciones para la encuesta.', 'info'); return; }
    }
    composeSendBtn.disabled = true;
    try {
      let imageUrl = null;
      const uploader = window.__composeUploader;
      if (uploader?.getFile()) imageUrl = await uploader.triggerUpload();
      const { data: inserted, error } = await sb.from('confessions').insert({
        user_id: currentUser.id, content, image_url: imageUrl,
        hashtag: primaryHashtag, hashtags: selectedTags, poll_question: pollQuestion || null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      if (pollQuestion && inserted?.id) {
        if (isAdvanced && advancedOptions.length >= 2) {
          const { data: pollRow, error: pollErr } = await sb.from('polls').insert({
            confession_id: inserted.id, question: pollQuestion, poll_type: 'advanced',
          }).select('id').single();
          if (pollErr) throw new Error(pollErr.message);
          await sb.from('poll_options').insert(advancedOptions.map((label, i) => ({ poll_id: pollRow.id, position: i + 1, label })));
        } else {
          await sb.from('polls').insert({ confession_id: inserted.id, question: pollQuestion, poll_type: 'simple' });
        }
      }
      composeInput.value = '';
      if (composePollInput) composePollInput.value = '';
      document.querySelectorAll('.compose-poll-option-input').forEach(i => { i.value = ''; });
      const pollRow = document.getElementById('compose-poll-row');
      if (pollRow) pollRow.hidden = true;
      composePollToggle?.classList.remove('compose-poll-btn--active');
      window.__composeUploader?.reset();
      showToast('¡Confesión publicada!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      composeSendBtn.disabled = false;
    }
  });
  composeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composeSendBtn.click(); }
  });
}

export { tagColor };
export const hashtagColor = tagColor;

// ── Realtime ──────────────────────────────────────────────────
function startRealtime() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  let subscribeTimeout = setTimeout(() => { startPolling(); }, 8000);
  try {
    realtimeChannel = sb.channel(`rc-feed-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions' },
        async ({ new: row }) => {
          if (activeHashtagFilter) {
            const rowTags = row.hashtags?.length ? row.hashtags : (row.hashtag ? [row.hashtag] : []);
            if (!rowTags.includes(activeHashtagFilter)) return;
          }
          const profile = await fetchProfilesCached([row.user_id]);
          buildCard(row, feedEl, true, true, 0, 0, false, profile[row.user_id] || null, null, null);
          lastConfessionId = row.id;
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'confessions' },
        ({ old: row }) => { if (row?.id) document.getElementById(`card-${row.id}`)?.remove(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls' },
        async ({ new: poll }) => {
          const card = document.getElementById(`card-${poll.confession_id}`);
          if (!card) return;
          const existing = card.querySelector('.poll-widget');
          if (!existing) return;
          const { data: fresh } = await sb.from('polls')
            .select('id, confession_id, question, yes_count, no_count, poll_type, poll_options(id, position, label, vote_count)')
            .eq('id', poll.id).single();
          if (fresh) existing.replaceWith(buildPollWidget(fresh, null, card));
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(subscribeTimeout); stopPolling(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(subscribeTimeout); startPolling(); }
      });
  } catch (err) { clearTimeout(subscribeTimeout); startPolling(); }
}

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(async () => {
    if (!lastConfessionId) return;
    const { data: ref } = await sb.from('confessions').select('id').eq('id', lastConfessionId).single();
    if (!ref) return;
    let q = sb.from('confessions')
      .select('id, user_id, content, image_url, hashtag, hashtags, created_at, poll_question, is_pinned')
      .gt('id', lastConfessionId).order('id', { ascending: true });
    if (activeHashtagFilter) {
      q = q.or(`hashtags.cs.{"${activeHashtagFilter}"},hashtag.eq.${activeHashtagFilter}`);
    }
    const { data } = await q;
    if (data?.length) {
      const ids = [...new Set(data.map(c => c.user_id))];
      const pm  = await fetchProfilesCached(ids);
      data.forEach(c => buildCard(c, feedEl, true, true, 0, 0, false, pm[c.user_id] || null, null, null));
      lastConfessionId = data[data.length - 1].id;
    }
  }, 10_000);
}

function stopPolling() { clearInterval(pollingInterval); pollingInterval = null; }
