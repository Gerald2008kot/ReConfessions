// js/upload.js
// ============================================================
// Cloudinary Unsigned Upload
// + Compresión de imágenes en el cliente antes de subir — NUEVO
// ============================================================

import { CLOUDINARY_CONFIG, CLOUDINARY_UPLOAD_URL, CLOUDINARY_DELETE_URL } from './api.js';
import { showToast } from './utils.js';

const MAX_FILE_SIZE_MB = 5;
const ALLOWED_TYPES    = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ── Configuración de compresión ───────────────────────────────
const COMPRESS_MAX_WIDTH  = 1280;
const COMPRESS_MAX_HEIGHT = 1280;
const COMPRESS_QUALITY    = 0.82; // 0-1, solo aplica a jpeg/webp
const COMPRESS_SKIP_GIF   = true; // GIF no se comprime (perdería animación)

/**
 * Comprime una imagen en el cliente usando Canvas.
 * Redimensiona si supera los límites y convierte a JPEG/WebP.
 * Devuelve el File comprimido o el original si no aplica.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function compressImage(file) {
  // GIFs se saltan (preservar animación)
  if (COMPRESS_SKIP_GIF && file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Solo comprimir si la imagen es grande o pesa más de 300 KB
      const needsResize = width > COMPRESS_MAX_WIDTH || height > COMPRESS_MAX_HEIGHT;
      const needsCompress = file.size > 300 * 1024;

      if (!needsResize && !needsCompress) {
        resolve(file);
        return;
      }

      // Calcular nuevas dimensiones manteniendo proporción
      if (needsResize) {
        const ratio = Math.min(COMPRESS_MAX_WIDTH / width, COMPRESS_MAX_HEIGHT / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Formato de salida: webp preferido, fallback jpeg
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }

          // Si el resultado es mayor que el original, usar el original
          if (blob.size >= file.size) { resolve(file); return; }

          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, outputType === 'image/png' ? '.png' : '.jpg'),
            { type: outputType, lastModified: Date.now() }
          );

          console.log(
            `[compress] ${(file.size / 1024).toFixed(0)} KB → ${(compressed.size / 1024).toFixed(0)} KB`,
            `(${width}×${height})`
          );

          resolve(compressed);
        },
        outputType,
        COMPRESS_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback: usar original
    };

    img.src = objectUrl;
  });
}

/**
 * Validates and uploads a File to Cloudinary.
 * Compresses the image before uploading.
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

  // ── Compress before upload ─────────────────────────────
  const fileToUpload = await compressImage(file);

  // ── Build FormData ─────────────────────────────────────
  const formData = new FormData();
  formData.append('file',          fileToUpload);
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
 * Compresses the selected image before showing the preview.
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

  inputEl.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

    // Comprimir antes de mostrar preview
    const compressed = await compressImage(file);
    selectedFile = compressed;
    uploadedUrl  = null;

    const objectUrl = URL.createObjectURL(compressed);
    while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = 'Image preview';
    img.className = 'uploader__preview-img';
    img.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'uploader__remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', 'Remove image');
    removeBtn.addEventListener('click', reset);

    // Mostrar tamaño comprimido si es menor
    if (compressed.size < file.size) {
      const sizeBadge = document.createElement('span');
      sizeBadge.className = 'uploader__size-badge';
      sizeBadge.textContent = `${(compressed.size / 1024).toFixed(0)} KB`;
      sizeBadge.title = `Comprimida desde ${(file.size / 1024).toFixed(0)} KB`;
      previewEl.appendChild(sizeBadge);
    }

    previewEl.appendChild(img);
    previewEl.appendChild(removeBtn);
    previewEl.hidden = false;
  });

  const triggerUpload = async () => {
    if (!selectedFile) return null;
    if (uploadedUrl)   return uploadedUrl;

    if (progressEl) {
      progressEl.hidden = false;
      progressEl.style.width = '0%';
    }

    try {
      // El archivo ya está comprimido (se comprimió al seleccionar)
      // Usamos uploadImage pero pasando el file ya comprimido directamente
      // para evitar comprimir dos veces
      const formData = new FormData();
      formData.append('file',          selectedFile);
      formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
      formData.append('folder',        CLOUDINARY_CONFIG.folder);

      uploadedUrl = await _uploadFormData(formData, (pct) => {
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

/** Helper interno: sube FormData ya construido */
function _uploadFormData(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL, true);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch { reject(new Error('Invalid response from Cloudinary.')); }
      } else {
        let detail = xhr.responseText;
        try { detail = JSON.parse(xhr.responseText)?.error?.message ?? detail; } catch {}
        reject(new Error('Cloudinary ' + xhr.status + ': ' + detail));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.send(formData);
  });
}

/**
 * Extrae el public_id de Cloudinary a partir de una secure_url.
 */
export function extractPublicId(url) {
  if (!url) return null;
  try {
    const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Solicita la eliminación de una imagen en Cloudinary.
 */
export async function deleteCloudinaryImage(publicId) {
  if (!publicId) return false;
  try {
    const body = new URLSearchParams();
    body.append('public_id',    publicId);
    body.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

    const res = await fetch(CLOUDINARY_DELETE_URL, { method: 'POST', body });

    if (!res.ok) {
      console.warn('[Cloudinary] delete failed — status', res.status,
        '— configura una Edge Function para borrados firmados.');
      return false;
    }

    const json = await res.json();
    if (json.result === 'ok') return true;
    if (json.result === 'not found') return true;

    console.warn('[Cloudinary] delete result:', json.result);
    return false;
  } catch (err) {
    console.warn('[Cloudinary] delete error:', err.message);
    return false;
  }
}
