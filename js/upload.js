// js/upload.js
// ============================================================
// Cloudinary Unsigned Upload
// ============================================================

import { CLOUDINARY_CONFIG, CLOUDINARY_UPLOAD_URL, CLOUDINARY_DELETE_URL } from './api.js';
import { showToast } from './utils.js';

const MAX_FILE_SIZE_MB = 5;
const ALLOWED_TYPES    = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Validates and uploads a File to Cloudinary.
 * Returns the secure_url string on success.
 *
 * @param {File} file
 * @param {Function} [onProgress]  - (percent: number) => void
 * @returns {Promise<string>}      - The Cloudinary secure_url
 */
export async function uploadImage(file, onProgress) {
  // ── Validation ─────────────────────────────────────────
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type. Use JPEG, PNG, GIF, or WebP.');
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
  }

  // ── Build FormData ─────────────────────────────────────
  const formData = new FormData();
  formData.append('file',          file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  formData.append('folder',        CLOUDINARY_CONFIG.folder);

  // ── Upload with XHR for progress tracking ──────────────
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL, true);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.secure_url);
        } catch {
          reject(new Error('Invalid response from Cloudinary.'));
        }
      } else {
        // Extraer el mensaje exacto que devuelve Cloudinary
        let detail = xhr.responseText;
        try {
          const errJson = JSON.parse(xhr.responseText);
          detail = errJson?.error?.message ?? detail;
        } catch { /* mantener texto crudo */ }
        console.error('[Cloudinary] HTTP ' + xhr.status + ':', detail);
        reject(new Error('Cloudinary ' + xhr.status + ': ' + detail));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    xhr.send(formData);
  });
}

/**
 * Wires up an <input type="file"> element with a preview container.
 *
 * @param {HTMLInputElement} inputEl     - The file input
 * @param {HTMLElement}      previewEl   - Container for image preview
 * @param {HTMLElement}      progressEl  - Progress bar element
 * @returns {{ getFile: Function, getUploadedUrl: Function, reset: Function }}
 */
export function initImageUploader(inputEl, previewEl, progressEl) {
  let selectedFile    = null;
  let uploadedUrl     = null;

  const reset = () => {
    selectedFile = null;
    uploadedUrl  = null;
    inputEl.value = '';
    while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);
    previewEl.hidden = true;
    if (progressEl) {
      progressEl.style.width = '0%';
      progressEl.hidden = true;
    }
  };

  inputEl.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate early so user sees feedback immediately
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('Unsupported file type.', 'error');
      inputEl.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`Max file size is ${MAX_FILE_SIZE_MB}MB.`, 'error');
      inputEl.value = '';
      return;
    }

    selectedFile = file;
    uploadedUrl  = null;

    // Show preview via Object URL (revoke after load to avoid memory leak)
    const objectUrl = URL.createObjectURL(file);
    while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = 'Image preview';
    img.className = 'uploader__preview-img';
    img.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });

    // Remove button — XSS safe: no innerHTML
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'uploader__remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', 'Remove image');
    removeBtn.addEventListener('click', reset);

    previewEl.appendChild(img);
    previewEl.appendChild(removeBtn);
    previewEl.hidden = false;
  });

  /**
   * Triggers the actual upload if a file is selected.
   * Returns the secure_url or null if no file.
   */
  const triggerUpload = async () => {
    if (!selectedFile) return null;
    if (uploadedUrl)   return uploadedUrl; // already uploaded

    if (progressEl) {
      progressEl.hidden = false;
      progressEl.style.width = '0%';
    }

    try {
      uploadedUrl = await uploadImage(selectedFile, (pct) => {
        if (progressEl) progressEl.style.width = `${pct}%`;
      });
      return uploadedUrl;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    } finally {
      if (progressEl) {
        progressEl.style.width = '100%';
        setTimeout(() => { progressEl.hidden = true; }, 600);
      }
    }
  };

  return {
    getFile:        () => selectedFile,
    getUploadedUrl: () => uploadedUrl,
    triggerUpload,
    reset,
  };
}

/**
 * Extrae el public_id de Cloudinary a partir de una secure_url.
 * Ej: "https://res.cloudinary.com/dxxx/image/upload/v123/re-confessions/abc.jpg"
 *  → "re-confessions/abc"   (sin extensión)
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractPublicId(url) {
  if (!url) return null;
  try {
    // La URL tiene la forma: .../image/upload/<version?>/<folder/name>.<ext>
    const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Solicita la eliminación de una imagen en Cloudinary.
 *
 * IMPORTANTE: La API /destroy requiere autenticación firmada (api_key + signature)
 * para uploads privados. Para uploads con preset "unsigned" Cloudinary no expone
 * un endpoint público de borrado sin firma, por lo que la solución correcta es
 * usar una Supabase Edge Function o un proxy propio que firme la petición con
 * api_secret. Este helper intenta un borrado "unsigned" (sólo funciona si el
 * preset lo permite o si usas un proxy) y falla silenciosamente para no bloquear
 * el flujo principal de la app.
 *
 * @param {string} publicId  - El public_id obtenido con extractPublicId()
 * @returns {Promise<boolean>} - true si se borró, false si falló
 */
export async function deleteCloudinaryImage(publicId) {
  if (!publicId) return false;
  try {
    const body = new URLSearchParams();
    body.append('public_id',    publicId);
    body.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

    const res = await fetch(CLOUDINARY_DELETE_URL, {
      method: 'POST',
      body,
    });

    if (!res.ok) {
      console.warn('[Cloudinary] delete failed — status', res.status,
        '— configura una Edge Function para borrados firmados.');
      return false;
    }

    const json = await res.json();
    if (json.result === 'ok') return true;

    // "not found" no es un error crítico (imagen ya borrada o nunca existió)
    if (json.result === 'not found') return true;

    console.warn('[Cloudinary] delete result:', json.result);
    return false;
  } catch (err) {
    console.warn('[Cloudinary] delete error:', err.message);
    return false;
  }
}
