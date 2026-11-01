# EcoEstate

EcoEstate, rebuilt to run without Base44. The React frontend is the same code as
the live site at ecoestate-homes.com. A small Node server replaces Base44's
backend: database, accounts, file storage, AI, Google Maps and the backend
functions.

## Run it locally

You need Node.js 22.13 or newer.

```bash
npm install                                  # also installs lawn-api/
cp .env.example .env                         # app keys
cp lawn-api/.env.example lawn-api/.env       # lawn API keys
npm run dev
```

`npm run dev` starts three processes: the site (http://localhost:5173), the app
API (:3001) and the lawn-to-native API in `lawn-api/` (:3000).

## Lawn-to-native API (`lawn-api/`)

The address box on the scan page calls `GET /v1/lawn`; editing or drawing a lawn
outline calls `POST /v1/area`. The browser never calls lawn-api directly: it goes
through this app's server at `/api/lawn/*` (`server/lawnApi.js`), which adds the
`x-api-key` header. Its keys (`GEOCODIO_API_KEY`, `APP_API_KEY`) live only in
`lawn-api/.env`. Check what's
configured at http://localhost:3000/health.

In production, run lawn-api as its own service (`npm --prefix lawn-api start`)
and set `LAWN_API_URL` in the app's `.env` if it isn't on the same machine.

## Run in production

```bash
npm run build
npm start              # serves the site and API on $PORT (default 3001)
```

Any host that runs a long-lived Node process with a persistent disk works
(Render, Railway, Fly.io, a VPS). Keep the `data/` folder (or `DATA_DIR`) on
persistent storage: it holds the SQLite database and uploaded photos. Set
`APP_URL` to your public address.

## What replaced what

| Base44 | Here |
| --- | --- |
| Entities (Project, Post, Comment, Message, ScanUsage, ScanCache, Base44Purchase) | SQLite in `data/ecoestate.db`, same access rules, read from `server/entities/*.jsonc` |
| Auth (email + code, password reset, Google) | `server/auth.js` |
| UploadPrivateFile / CreateFileSignedUrl | `server/files.js`, files in `data/uploads` |
| InvokeLLM | Claude (`ANTHROPIC_API_KEY`) in `server/integrations.js` |
| Google Maps connector | Google Maps Platform (`GOOGLE_MAPS_API_KEY`) |
| Backend functions | `server/functions/*` (original code, mounted at `/api/functions/<name>`) |
| `@base44/sdk` client | `src/api/base44Client.js` (same interface, so pages are unchanged) |

## Things to set up when you switch over

- **Users and data don't carry over.** Accounts and records live in Base44's
  database; export what you need from the Base44 dashboard. Users will need to
  sign up again (or use Google sign-in with the same email).
- **Payments:** Base44 connected Wix Payments for you. Add your own
  `WIX_CHECKOUT_*` keys, and point the Wix webhook at
  `<APP_URL>/api/functions/payments-webhook`.
- **Email:** set `SMTP_URL` (e.g. from Resend, Postmark, SendGrid) so
  verification codes are actually sent.
- **Admin:** list your email in `ADMIN_EMAILS` before you sign up.

## Costs per session

Every paid API call (Geocodio lookups, Resend emails, Anthropic tokens, Google
Maps images, RapidAPI) is logged with the browser session and user at list
price. See them with:

```bash
npm run costs
```

or, signed in as an admin, `GET /api/admin/usage`. Prices and free allowances
are in `server/usage.js`; totals are before free allowances. Everything else the
app uses (aerial imagery, building footprints, canopy maps, county parcel maps,
OpenStreetMap, Google sign-in) is free.

## Student unlock

A signed-in user with a verified school email (any `.edu`, or a domain in the
JetBrains/swot school directory) automatically gets the 3D Garden View, orbit
camera, walk-through and unlimited Full Auto Scans (`server/student.js`).

