// js/api.js
// ============================================================
// Client configuration for Supabase and Cloudinary
// REPLACE the placeholder values with your actual credentials
// ============================================================

// ── Supabase ──────────────────────────────────────────────
const SUPABASE_URL    = 'https://ygqryoabjrvfkvtkfpaa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_W4vs07ePv0I8WooDW6ZF1Q_hyKakkh4';

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