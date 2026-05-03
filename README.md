# CarSee Admin Web

Standalone hosted admin panel for subscription management, extracted from the Flutter app.

## Features
- Password-gated access (server-side check + httpOnly session cookie)
- List users via Supabase RPC: `admin_list_users_for_admin`
- Update user subscription via Edge Function: `admin-update-user`
- Show recent audit via Supabase RPC: `admin_audit_log_for_target`

## Local Run
1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Start:
   - `npm start`
4. Open:
   - `http://localhost:8787`

## Environment Variables
- `SUPABASE_URL`: your Supabase project URL
- `SUPABASE_ANON_KEY`: anon public key
- `ADMIN_SUPABASE_EMAIL`: email of an admin user
- `ADMIN_SUPABASE_PASSWORD`: password of that admin user
- `ADMIN_PAGE_PASSWORD` or `ADMIN_PAGE_PASSWORD_HASH`
- `ADMIN_SESSION_TTL_MINUTES` (optional, default `120`)
- `PORT` (optional, default `8787`)

## Deploy (Hosted URL)
This app can be deployed to Render, Railway, Fly.io, or any Node.js host.

### Railway (recommended quick path)
1. **GitHub:** Ensure the `admin-web` folder is committed and pushed on the branch you deploy (if the repo is the full CarSee app, you only need this subfolder in the tree).
2. **New project:** [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select your repo.
3. **Root directory:** Open the service → **Settings** → set **Root Directory** to `admin-web` (required for monorepos). Railway will run `npm install` and `npm start` from `package.json`.
4. **Networking:** **Settings** → **Networking** → **Generate domain** (HTTPS). Use that URL on phone and laptop.
5. **Variables:** **Variables** tab → add (same as `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ADMIN_SUPABASE_EMAIL`
   - `ADMIN_SUPABASE_PASSWORD`
   - `ADMIN_PAGE_PASSWORD` (or `ADMIN_PAGE_PASSWORD_HASH`)
   - `NODE_ENV` = `production` (so the session cookie is `Secure` over HTTPS)
   - Optional: `ADMIN_SESSION_TTL_MINUTES`
   - **Do not** set `PORT` manually unless you know you need to; Railway injects `PORT` automatically and `server.js` already uses it.
6. **Supabase:** The `ADMIN_SUPABASE_EMAIL` user must exist in Auth and have a row in `public.admin_users`.
7. Redeploy after changing variables if the app does not pick them up.

### Other hosts (Render / Fly / VPS)
1. Push this repository.
2. Set start command: `npm start` with working directory `admin-web` (or repo root if the service is only `admin-web`).
3. Set env vars from `.env.example` and `NODE_ENV=production` in production.
4. Use the platform’s HTTPS URL.

## Smoke Test Checklist
1. Login with password.
2. User table loads.
3. Search user by email.
4. Select user and verify edit form populates.
5. Save plan/bonus changes.
6. Confirm audit list shows latest updates.
7. Logout and verify protected routes are inaccessible.
