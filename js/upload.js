// js/upload.js
// ============================================================
// Cloudinary Unsigned Upload
// ============================================================

import { CLOUDINARY_CONFIG, CLOUDINARY_UPLOAD_URL } from './api.js';
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
