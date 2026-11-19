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

1. Register a seller and create a listing. The fresh database has categories but no mock listings. New listings appear immediately with an Unverified Seller badge.
2. Submit seller identity and phone details. For local testing, use the Dev Mode OTP Preview on the verification form. The code is also saved in `backend/data/phone-outbox.json`. Production requires an SMS delivery adapter.
3. Sign in with the local admin credentials and approve the request in Seller Verifications. The seller badge updates to Verified Seller in connected marketplace pages.
4. Register a buyer, start a private conversation and leave a review after messaging.
5. Sign in as the seller to reply, edit or mark the item sold, and download monthly sales PDF/daily inquiries CSV reports.
6. Use Admin Dashboard to moderate users/flagged listings, manage categories, inspect logs and download daily activity PDF/monthly audit CSV reports.

Accounts, listings, verification, messages, reviews and audit logs are server-backed. Favourites remain browser-local. Old preview localStorage records are ignored. There is no demo role override.

## Checks

Run `pnpm test` inside backend and `pnpm build` inside frontend.

Source: `frontend/src/App.jsx` (accounts, dashboards, listing/chat screens), `Marketplace.jsx` (discovery), `api.js` (API/session client), and `backend/src` (schema, API, auth, reports, Socket.io). All REST routes use `/api/v1`.

Local development is configured. Production SMS, HTTPS/secrets, PostgreSQL hosting, backups and retention still require deployment configuration.

## API configuration and security

Copy `.env.example` to `.env` when overriding defaults. Local defaults listen on 127.0.0.1:3001 and allow frontend origins 127.0.0.1:5175, localhost:5175 and 127.0.0.1:5173. Vite proxies API, uploads and Socket.io. A PGlite directory supports one process; stop the API before running admin maintenance scripts. Standard PostgreSQL uses `DATABASE_URL` through the `pg` adapter. Changing adapters selects a new database; it does not migrate existing records. Initial schema creation is idempotent; future schema changes need versioned migrations.

- Argon2id password hashing uses 64 MiB, 3 iterations and 1 lane. Password registration requires 12–128 characters; public registration accepts only buyer/seller.
- HS256 JWT access tokens expire in 10 minutes and enforce issuer, audience and an algorithm allowlist. Tokens stay in browser memory.
- Random refresh tokens last 7 days, are stored hashed and rotate on use. Cookies are HttpOnly, SameSite=Strict, scoped to `/api/v1/auth`, and Secure in production.
- Reuse revokes the session family. Access and refresh endpoints check current revocation/account status. Logout, suspension and role changes invalidate sessions and disconnect Socket.io clients.
- Refresh/logout require an allowlisted Origin and `X-NearBuy-CSRF: 1`. Ownership and role checks are server-side; admins cannot use the private chat endpoints.
- Helmet, explicit CORS, JSON body limits, Zod allowlists, length bounds and HTML/control-character rejection protect inputs. React renders text safely. SQL data always uses bound parameters.
- Limits per IP: 600 API requests/15 min, 8 registrations/15 min, 10 logins/15 min, 30 messages/min, 6 verification submissions/hour and 30 uploads/15 min. Rate counters are in-memory; multi-instance deployment needs a shared store and explicit trusted-proxy configuration.

## Identity and phone verification

NIC format accepts 9 digits plus V/X or 12 digits. Business registration IDs are reviewed manually. Phone uses +94 format. ID and phone fields are encrypted with AES-256-GCM; verification queue access and decisions are audited. Product uploads must never contain identity documents.

Phone codes expire after 10 minutes with at most five attempts. Development delivery writes the latest code to ignored `data/phone-outbox.json`: it tests the flow, not actual phone ownership. Real SMS requires `SMS_WEBHOOK_URL` (HTTPS) and `SMS_WEBHOOK_TOKEN`. The adapter receives `POST {to,message}` with bearer authorization and must return 2xx only after accepting delivery. Production startup refuses to run without the SMS URL and standard PostgreSQL. Government identity lookup is not implemented; approval is manual.

## Resource rules

- Seller listings publish immediately with their verification status. Admin approval updates the public badge through Socket.io. Sold/removed listings cannot be edited. Listing deletion is soft deletion. Discovery supports category/location/query filters and up to 100 results per page with `offset`.
- Admin category CRUD rejects deletion of in-use categories.
- Only buyers who sent a message can review a listing, once per buyer/listing. They can edit/delete their review; admins can delete reviews. Interaction is checked, not proof of purchase.
- Images: JPEG/PNG/WebP, 5 MiB maximum each, matching MIME and magic bytes. Sharp decodes/re-encodes WebP, strips metadata and limits pixels/dimensions. Only owned upload URLs can be attached, up to six. Product photos are public.
- Threads use listing_id + buyer_id. Sellers can reply only after a buyer starts a thread. Socket.io handshake uses auth.token; sends go through REST validation/rate limits, then emit private message events. UI polling every eight seconds provides fallback. Connections expire with JWTs and reconnect after refresh.

## Reports and logging

Reporting periods use Asia/Colombo. Endpoints under `/api/v1/reports`:

| Endpoint               | Role   | Period parameter | Output                                                      |
| ---------------------- | ------ | ---------------- | ----------------------------------------------------------- |
| seller/monthly-sales   | seller | month=YYYY-MM    | PDF: own sales/revenue and lifetime average rating          |
| seller/daily-inquiries | seller | date=YYYY-MM-DD  | CSV: buyer contact, inquiry timestamps and first reply time |
| admin/daily-activity   | admin  | date=YYYY-MM-DD  | PDF: signups, current active-listing snapshot, flags/events |
| admin/monthly-audit    | admin  | month=YYYY-MM    | CSV: monthly audit events                                   |

CSV fields are quoted with leading formula characters neutralized. Exports are audited. PDFKit uses Latin fonts; Sinhala/Tamil report text needs appropriate embedded fonts.

Winston logs structured JSON to stdout and rotating `logs/security.log` files (5 MB × 10). Morgan logs HTTP metadata. Database audits record failed login email hashes, mutations, verification access/decisions, moderation, reports and API errors. Passwords, tokens, codes, identity details and chat content are not logged. Database history is retained until a retention policy is applied; file-size rotation is not a 90-day retention guarantee.

## Production and maintenance

Development secrets are generated in ignored `data/*.key`. Production requires independent random JWT_SECRET/DATA_ENCRYPTION_KEY values (32+ characters), HTTPS reverse proxy, PostgreSQL connection/TLS, SMS adapter, secret management, backups, retention and shared rate limits when scaled. Changing the encryption key without migrating encrypted records makes them unreadable. Production deployment has not been exercised by local tests.

To provision a named admin: stop a PGlite API, set ADMIN_EMAIL, ADMIN_PASSWORD (12+ characters) and optional ADMIN_NAME in the process environment, then run `pnpm admin`. Do not put credentials in Git or shell history. Bootstrap is local-only, creates a random password only if no admin exists, and never overwrites an existing admin.

Tests create an isolated temporary PostgreSQL directory, use HTTP and Socket.io, and do not populate development data. Install frontend dependencies first because tests use its Socket.io client. OpenAPI JSON is at `/api-docs.json`; Swagger accepts access JWTs through Authorize. Cookie refresh is intended for the allowlisted frontend origin.
