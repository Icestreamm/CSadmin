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
This app can be deployed to Render/Railway/Fly.io or any Node.js host:
1. Push this repository.
2. Set start command: `npm start` in `admin-web`.
3. Set env vars from `.env.example`.
4. Deploy and use generated HTTPS URL.

## Smoke Test Checklist
1. Login with password.
2. User table loads.
3. Search user by email.
4. Select user and verify edit form populates.
5. Save plan/bonus changes.
6. Confirm audit list shows latest updates.
7. Logout and verify protected routes are inaccessible.
