// js/reporte.js
// Formulario para reportar contenido

import { sb } from './api.js';
import { getCurrentUser } from './auth.js';
import { el, showToast } from './utils.js';

const REASONS = [
  'Contenido ofensivo o de odio',
  'Acoso o intimidación',
  'Información falsa',
  'Spam o publicidad',
  'Otro',
];

/**
 * Abre el modal de reporte para una confesión o comentario.
 * @param {{ type: 'confession'|'comment', id: string }} target
 */
export function openReporte(target) {
  document.getElementById('reporte-modal')?.remove();

  const overlay = el('div', {
    className: 'reporte-overlay',
    attrs: { id: 'reporte-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reportar contenido' },
  });

  const sheet = el('div', { className: 'reporte-sheet' });

  const header = el('div', { className: 'reporte-header' });
  header.appendChild(el('p', { className: 'reporte-title', textContent: 'Reportar contenido' }));
  const closeBtn = el('button', { className: 'reporte-close', attrs: { type: 'button', 'aria-label': 'Cerrar' } });
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);
  sheet.appendChild(header);

  sheet.appendChild(el('p', { className: 'reporte-subtitle', textContent: '¿Por qué quieres reportar esto?' }));

  const form = el('div', { className: 'reporte-options' });
  let selectedReason = null;

  REASONS.forEach(reason => {
    const btn = el('button', {
      className: 'reporte-option',
      textContent: reason,
      attrs: { type: 'button' },
    });
    btn.addEventListener('click', () => {
      form.querySelectorAll('.reporte-option').forEach(b => b.classList.remove('reporte-option--selected'));
      btn.classList.add('reporte-option--selected');
      selectedReason = reason;
    });
    form.appendChild(btn);
  });
  sheet.appendChild(form);

  const notes = el('textarea', {
    className: 'reporte-notes',
    attrs: { placeholder: 'Detalles adicionales (opcional)', rows: '3', maxlength: '300' },
  });
  sheet.appendChild(notes);

  const submitBtn = el('button', {
    className: 'reporte-submit',
    textContent: 'Enviar reporte',
    attrs: { type: 'button' },
  });
  sheet.appendChild(submitBtn);

  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  submitBtn.addEventListener('click', async () => {
    if (!selectedReason) { showToast('Selecciona un motivo.', 'info'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
    try {
      const user = await getCurrentUser();
      const { error } = await sb.from('reports').insert({
        reporter_id: user?.id ?? null,
        target_type: target.type,
        target_id: target.id,
        reason: selectedReason,
        notes: notes.value.trim() || null,
      });
      if (error) throw error;
      showToast('Reporte enviado. Gracias.', 'success');
      close();
    } catch {
      showToast('Error al enviar el reporte.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar reporte';
    }
  });

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('reporte-overlay--open'));
}
