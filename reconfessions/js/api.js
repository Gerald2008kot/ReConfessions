// js/api.js
// ============================================================
// Client configuration for Supabase and Cloudinary
// REPLACE the placeholder values with your actual credentials
// ============================================================

// ── Supabase ──────────────────────────────────────────────
const SUPABASE_URL    = 'https://canponxxasxexpyolgpc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dgiaLzIKCoUx-kxyi1lJNQ_5H5PYfMS';

// Import from the CDN bundle (loaded in HTML via importmap or script tag)
const { createClient } = supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ── Cloudinary (Unsigned Upload) ───────────────────────────
export const CLOUDINARY_CONFIG = {
  cloudName:    'dxsz7i6gr',
  uploadPreset: 'ml_imagen', // Created in Cloudinary Dashboard
  folder:       're-confessions',
};

export const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;

export const CLOUDINARY_DELETE_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/destroy`;
