// js/utils.js
// ============================================================
// Utility helpers — XSS-safe DOM, date formatting, etc.
// ============================================================

/**
 * XSS-safe element factory.
 * NEVER use innerHTML for user content — this is the only approved
 * way to insert dynamic text into the DOM.
 *
 * @param {string} tag  - HTML tag name
 * @param {Object} opts - { className, textContent, attrs: {}, children: [] }
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className)   node.className = opts.className;
  if (opts.textContent !== undefined) node.textContent = opts.textContent;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      node.setAttribute(k, v);
    }
  }
  if (opts.children) {
    for (const child of opts.children) {
      if (child) node.appendChild(child);
    }
  }
  return node;
}

/**
 * Formats a UTC ISO string into a relative or absolute human date.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const date  = new Date(isoString);
  const now   = Date.now();
  const delta = Math.floor((now - date.getTime()) / 1000); // seconds

  if (delta < 60)          return 'just now';
  if (delta < 3600)        return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400)       return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 7)   return `${Math.floor(delta / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  });
}

/**
 * Returns up to 2 uppercase initials from a full name.
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

/**
 * Debounce — limits how often fn can fire.
 * @param {Function} fn
 * @param {number} delay ms
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Shows a transient toast notification.
 * @param {string} message
 * @param {'info'|'error'|'success'} type
 */
export function showToast(message, type = 'info') {
  const existing = document.getElementById('rc-toast');
  if (existing) existing.remove();

  const toast = el('div', {
    className: `toast toast--${type}`,
    textContent: message,
    attrs: { id: 'rc-toast', role: 'alert', 'aria-live': 'polite' },
  });

  document.body.appendChild(toast);
  // Trigger reflow for CSS transition
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

/**
 * Clamps a string to a max character count with ellipsis.
 * @param {string} str
 * @param {number} max
 */
export function clamp(str, max = 280) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
