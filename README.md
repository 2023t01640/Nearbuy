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

## Seeded account credentials

Log in using these existing local accounts. All six use password `NearBuy-Demo-2026!`.

| Role | Name | Email |
| --- | --- | --- |
| Admin | NearBuy Admin | admin@nearbuy.local |
| Verified Seller | Nimal Perera | nimal@demo.nearbuy.local |
| Verified Seller | Dilani Wijesinghe | dilani@demo.nearbuy.local |
| Verified Seller | Kasun Fernando | kasun@demo.nearbuy.local |
| Buyer | Amaya Silva | amaya@demo.nearbuy.local |
| Buyer | Tharindu Jayasinghe | tharindu@demo.nearbuy.local |

## Windows installer

Run `pnpm build:setup` in the repository root. Output is `release/NearBuy-Setup.exe`. The installer creates a NearBuy Desktop shortcut. The launcher runs silently in the notification area and opens http://127.0.0.1:5175 in your default browser. Use its tray menu to quit. Installed database, uploads and logs are stored in `%APPDATA%/NearBuy`, independently of the development checkout. A fresh installed database receives the same seeded accounts. Development pnpm commands remain available in frontend/backend.


### Registration and private seller verification

- The header uses Register and the UTF-8 tagline `Local Listings | Direct Chat | Verified Reviews`.
- Buyer registration requires a +94 mobile number and a confirmed six-digit code. Use **Send verification code**, enter the development banner code, then **Verify mobile number** and create the account. Codes expire after 10 minutes, allow five attempts and are consumed once. Changing the email or mobile requires a new code. Development delivery is also recorded in `backend/data/registration-phone-outbox.json`; production uses the configured SMS webhook and never returns the code.
- Google, Facebook and Apple buttons are explicitly **local mock OAuth**. They create/reuse separate demo buyer accounts, never authenticate with an external provider, and are disabled in production or when `DEMO_MODE=false`.
- Seller registration requires NIC number/photo, category (or Other), address, one of the 25 districts, and Agree to seller terms. After logging in, submit a BR number/photo and legal agreement in Seller verification, then confirm the phone code. Admins inspect details and NIC/BR photos in the verification queue and approve/reject as before. Seeded accounts are preserved.
- NIC/BR photos accept genuine JPEG, PNG or WebP up to 5 MB and 25 million pixels; photos are re-encoded without metadata and encrypted in PostgreSQL/PGlite alongside encrypted identity numbers and address. They are not placed in public uploads. The admin-only document API is audited and marked `no-store`.
- New columns and the registration OTP table are added automatically at backend startup without resetting existing data. Run `pnpm build` from the root (or frontend) for the production SPA. Updated API contracts are available at `/api-docs`.


### Listings, orders and purchase reviews

- Listing creation and editing support eight product details, up to eight photos, and Cash on Delivery / Online Payment. Complete submissions are `approved` automatically; incomplete submissions are `pending_admin` and hidden from Explore until approved in **Admin → Listing approvals**. Edits recalculate completeness. Invalid values and unsafe uploads are still rejected. Existing public listings migrate from `active` to `approved`; existing data is retained.
- **Buy Now** records an order with an encrypted delivery address, seller-enabled payment option, and server-side price snapshot. Orders are unpaid; no card details are collected and no payment gateway is connected. Coordinate delivery and payment with the seller in chat. Duplicate orders for the same buyer/product are prevented.
- Only buyers with an order can create or edit reviews. Historic reviews remain visible as community reviews unless an order exists; no purchases are fabricated for old reviews. The seller card averages reviews across all their listings.
- Product options include clipboard sharing, a report form, and buyer safety/support information. Swagger documents the new order and listing approval routes.


### Buyer workspace and seller fulfilment

Buyers can open the profile icon to access Cart, Orders and Settings. The database-backed cart supports quantities 1–99, removal and atomic checkout with per-item seller payment choices. One order per buyer/product remains enforced; remove already-ordered items before checking out. No payment gateway is implemented. Orders contain server-priced quantity snapshots and encrypted delivery addresses.

Settings update the buyer name, mobile and default delivery address. Changing mobile resets its verification flag. Password changes require the current password and a new password of at least 12 characters, then revoke every session. Seller order controls advance Pending → Confirmed → Packing → Delivered. The seller dashboard offers PDF and CSV sales/order and listing exports; these order totals do not imply payments were collected.

Run `pnpm build` at the root to verify the production SPA. No installer packaging is part of this update. Seeded accounts are retained, with no Quick Demo Login buttons. Local mock OAuth and OTP preview remain available for the university demonstration.


### Stock, variants, districts and card simulation

Explore lists all 25 Sri Lankan districts. Listings store a district separately from locality; existing locations are mapped where possible (otherwise edit the listing to choose its district). Logged-in accounts see Logout instead of Register.

Sellers set shared Item Count stock and up to five custom variant groups (20 tags each), such as Colors and Storage. Buyers must select every option and a quantity within stock (up to 99 per order). Cart stores one selected configuration per product; adding the product again replaces that configuration and quantity. Checkout checks availability again and atomically decrements stock, including across a multi-item cart. Stock is shared across variants, not tracked separately per option. Existing listings start with one available unit; adjust stock before demonstrations requiring multiple units.

Listing prices show a 7% platform-fee deduction and net payout; orders save rounded fee and net amounts. These are accounting previews, not collected fees or transferred payouts. Order stages are Pending → Confirmed → Packing → Delivered; buyer Orders refreshes every 15 seconds.

Online Payment shows a required **local simulation** card form. Use test card `4242 4242 4242 4242`, any future MM/YY and a three-digit test CVV. Real card numbers are rejected; no card field is sent to the API or stored. The backend accepts only a simulation confirmation and records `simulated`, never `paid`. Production disables this simulation until a real provider integration is configured. COD remains unpaid until arrangements are completed outside this app. No installer build is run for this update.
