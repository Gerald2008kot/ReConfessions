# Re-Confessions 🕯️

> An anonymous confession platform with real-time threads.

## Stack
- **Frontend**: Vanilla HTML5 / CSS3 / ES6+ (no framework)
- **Backend / Auth / DB**: Supabase
- **Image Storage**: Cloudinary (Unsigned Uploads)
- **Hosting**: Vercel

---

## Quick Setup

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the contents of `supabase_setup.sql`.
3. Enable **Realtime** for `confessions` and `comments` tables:  
   Dashboard → Database → Replication → Enable for both tables.
4. Copy your project URL and `anon` key from **Project Settings → API**.

### 2. Cloudinary

1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Go to **Settings → Upload → Upload Presets**.
3. Create an **Unsigned** preset. Note the preset name and your **Cloud Name**.

### 3. Configure Credentials

Open `js/api.js` and fill in:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const CLOUDINARY_CONFIG = {
  cloudName:    'YOUR_CLOUD_NAME',
  uploadPreset: 'YOUR_UNSIGNED_UPLOAD_PRESET',
  folder:       're-confessions',
};
```

### 4. Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deploys.

### 5. Create an Admin Account

1. Register normally through the app.
2. In Supabase Dashboard → Table Editor → `profiles`:
   - Find your row and set `is_admin = true`.
3. Admin users can see `full_name` associations via the Supabase dashboard only — the UI never exposes this.

---

## Security Architecture

| Threat          | Mitigation |
|-----------------|------------|
| XSS             | Zero use of `innerHTML`. All dynamic content via `.textContent` / `createElement`. |
| SQL Injection   | PostgREST parameterized queries only via Supabase client. |
| Unauthorized writes | RLS enforces `auth.uid() = user_id` on INSERT. No UPDATE/DELETE for users. |
| Content framing | `X-Frame-Options: DENY` + `frame-ancestors 'none'` CSP. |
| Data exposure   | `full_name` never returned to UI; admin access only via Supabase dashboard. |
| Malicious files | Client-side MIME type + size validation before Cloudinary upload. |

---

## File Structure

```
/
├── index.html          # Feed + thread overlay
├── login.html          # Auth (sign in / register)
├── supabase_setup.sql  # DB schema + RLS + trigger
├── vercel.json         # Security headers + routing
├── /js
│   ├── api.js          # Supabase + Cloudinary client config
│   ├── auth.js         # Auth logic, session, header chip
│   ├── feed.js         # Feed render, threads, realtime + polling
│   ├── upload.js       # Cloudinary image uploader
│   └── utils.js        # XSS-safe DOM helpers, date formatter, toast
└── /css
    ├── main.css        # Global styles, variables, dark theme
    └── components.css  # Cards, thread panel, bubbles, uploader
```

---

## Realtime Strategy

- **Primary**: `supabase.channel()` with `postgres_changes` for `INSERT` on both tables.
- **Fallback**: If Realtime quota is exceeded or the channel errors, `setInterval` polling every 10 seconds compares timestamps to fetch only new rows.

---

## Privacy Model

- Confessions and comments are stored with `user_id` (UUID FK).
- The UI **never** joins `user_id → profiles.full_name` — all posts display as "Anonymous".
- Only users with `is_admin = true` can access the Supabase dashboard to cross-reference.
- RLS prevents any client-side query from joining `profiles.full_name` without admin rights.
