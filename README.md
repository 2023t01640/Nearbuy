# NearBuy

React + Vite + Tailwind frontend and Express + PostgreSQL backend. The original UI preview is preserved in Git commit `7569d1c`.

## Run locally

Use Node.js 22.12+ and pnpm 11. In separate terminals:

```sh
cd backend
pnpm install
node scripts/bootstrap-admin.js
pnpm start
```

```sh
cd frontend
pnpm install
pnpm dev --port 5175 --strictPort
```

- App: http://127.0.0.1:5175
- API: http://127.0.0.1:3001/api/v1
- Swagger: http://127.0.0.1:3001/api-docs
- Local admin credentials: `backend/data/local-admin.txt` (generated once, ignored by Git).

The local backend uses persistent embedded PostgreSQL (PGlite), so no PostgreSQL installation is required. Set `DATABASE_URL` for standard PostgreSQL. See [backend documentation](backend/README.md) for configuration, security and endpoint details.

## Try the complete workflow

1. Register a seller and create a listing. The fresh database has categories but no mock listings. Listings start as private drafts.
2. Submit seller identity and phone details. For local testing, read the code in `backend/data/phone-outbox.json` and confirm it. Production requires an SMS delivery adapter.
3. Sign in with the local admin credentials and approve the request in Seller Verifications. The listing becomes public.
4. Register a buyer, start a private conversation and leave a review after messaging.
5. Sign in as the seller to reply, edit or mark the item sold, and download monthly sales PDF/daily inquiries CSV reports.
6. Use Admin Dashboard to moderate users/flagged listings, manage categories, inspect logs and download daily activity PDF/monthly audit CSV reports.

Accounts, listings, verification, messages, reviews and audit logs are server-backed. Favourites remain browser-local. Old preview localStorage records are ignored. There is no demo role override.

## Checks

Run `pnpm test` inside backend and `pnpm build` inside frontend.

Source: `frontend/src/App.jsx` (accounts, dashboards, listing/chat screens), `Marketplace.jsx` (discovery), `api.js` (API/session client), and `backend/src` (schema, API, auth, reports, Socket.io). All REST routes use `/api/v1`.

Local development is configured. Production SMS, HTTPS/secrets, PostgreSQL hosting, backups and retention still require deployment configuration.
