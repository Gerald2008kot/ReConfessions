// js/icons.js
// ============================================================
// SVG icons — XSS-safe creation via createElementNS
// All icons are 24×24 viewBox, stroke-based
// ============================================================

const NS = 'http://www.w3.org/2000/svg';

function svg(paths, { size = 20, fill = 'none', stroke = 'currentColor', strokeWidth = 1.5 } = {}) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width',  String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('fill',        fill);
  s.setAttribute('stroke',      stroke);
  s.setAttribute('stroke-width', String(strokeWidth));
  s.setAttribute('aria-hidden', 'true');
  for (const d of (Array.isArray(paths) ? paths : [paths])) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('stroke-linecap',  'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('d', d);
    s.appendChild(p);
  }
  return s;
}

// ── Icon definitions ──────────────────────────────────────────

export const Icons = {
  heart: (filled = false, size = 18) => svg(
    'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
    { size, fill: filled ? '#e8596a' : 'none', stroke: filled ? '#e8596a' : 'currentColor' }
  ),

  chat: (size = 18) => svg(
    'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 11.96c0 1.696.586 3.276 1.583 4.545-.04.47-.234 1.258-.582 2.015a1.5 1.5 0 001.62 2.115c1.472-.25 2.78-.962 3.743-1.895A9.034 9.034 0 0012 20.25z',
    { size }
  ),

  trash: (size = 16) => svg(
    ['M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'],
    { size }
  ),

  back: (size = 20) => svg(
    'M15.75 19.5L8.25 12l7.5-7.5',
    { size }
  ),

  send: (size = 16) => svg(
    'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
    { size, strokeWidth: 2 }
  ),

  image: (size = 18) => svg(
    ['M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'],
    { size }
  ),

  close: (size = 18) => svg(
    'M6 18L18 6M6 6l12 12',
    { size, strokeWidth: 2 }
  ),

  user: (size = 14) => svg(
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    { size }
  ),

  pencil: (size = 14) => svg(
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
    { size }
  ),

  lock: (size = 28) => svg(
    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    { size, strokeWidth: 2 }
  ),

  logout: (size = 20) => svg(
    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
    { size }
  ),

  arrowRight: (size = 16) => svg(
    'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
    { size, strokeWidth: 2 }
  ),
};