// js/router.js
// ============================================================
// Router SPA — gestiona historial y botón atrás del navegador
// para todas las vistas y overlays (sheet, image modal).
// ============================================================

// Estado del router: pila de "capas" abiertas
// Cada capa: { key, close }
// key: identificador único ('chat', 'hilos', 'perfil', 'admin', 'sheet', 'img-modal')
const _stack = [];

// ── Push (abrir algo) ─────────────────────────────────────────
// Llama a esto ANTES de mostrar la vista/overlay.
// closeFn: función que cierra la vista SIN tocar el historial.
export function routerPush(key, closeFn) {
  history.pushState({ routerKey: key }, '', location.href.split('#')[0]);
  _stack.push({ key, close: closeFn });
}

// ── Pop manual (botón "atrás" dentro de la UI) ────────────────
// Llama a esto desde los botones de back de cada vista.
// Ejecuta history.back() → dispara popstate → cierra la capa.
export function routerBack() {
  if (_stack.length > 0) {
    history.back(); // popstate hará el resto
  }
}

// ── Pop programático (sin botón — p.ej. abrir otra vista) ─────
// Cierra la capa superior sin empujar historial extra.
export function routerPop(key) {
  const idx = key
    ? _stack.findIndex(l => l.key === key)
    : _stack.length - 1;
  if (idx < 0) return;
  const [layer] = _stack.splice(idx, 1);
  layer.close?.();
}

// ── Escuchar popstate (botón nativo del navegador) ────────────
window.addEventListener('popstate', () => {
  if (_stack.length === 0) return; // nada que cerrar aquí
  const layer = _stack.pop();
  layer.close?.();
});
