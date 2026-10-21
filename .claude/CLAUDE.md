# Al Qamar Hospital — project context for agents

Clinic operations and cash-ledger web app for **Al Qamar Hospital** (Pakistan). Money is PKR, the clinic day is
`Asia/Karachi`, and some printed material is in Urdu. Staff on one hospital network use it all day:
the front desk (OPD, tests, OT, emergency), the lab, the in-house pharmacy ("medical store") and management.
Internal names you will see: package `frontend`, cookie prefix `careledger_`.

@../AGENTS.md

**This Next.js version has breaking changes compared with your training data. Read
`node_modules/next/dist/docs/` before using a Next API you are not sure of.** `next dev` rewrites
`AGENTS.md` itself, so a diff there is expected. Route files (`route.ts`) may only export HTTP handlers;
put shared helpers in `lib/`.

## Stack

| Layer | What is used |
|---|---|
| Framework | Next.js 16.4 App Router (`app/`), React 19.3, TypeScript 5 (strict). `pages/` is empty. |
| UI | Chakra UI v3 (theme in `app/providers.tsx`) + Emotion, Tailwind v4 (only `app/globals.css`), Font Awesome icons, `react-toastify` for messages, `recharts` for charts |
| Data | Prisma 7 with the **MariaDB driver adapter** (`@prisma/adapter-mariadb`) against MySQL/MariaDB on InnoDB. `mariadb` is forced to 3.5.4 through `overrides` in `package.json` (security fix; the adapter pins 3.4.5). |
| Exports | `exceljs`, used only in `app/api/reports/export` and `app/api/medical-store/reports/export` |
| Unused dependencies | `pdf-lib`, `framer-motion` (not imported anywhere) |

## Commands

```bash
npm run dev        # predev: ensure-deps, then Turbopack (webpack on Linux)
npm run build      # wipes .next, prisma generate, next build --webpack; postbuild: apply-db-updates
npm run db:update  # apply-db-updates on its own (e.g. after uploading a .next built on a PC)
npm run lint       # eslint 9 + eslint-config-next. Baseline: 31 errors / 12 warnings already exist (mostly react-hooks/set-state-in-effect)
npx tsc --noEmit   # type-check; must stay clean
npm run db:seed    # tsx prisma/seed.ts: starter logins (only missing ones) + sample catalog/beds
npm run db:migrate # prisma migrate dev (developer PC only)
```

There is no test suite. To verify a change, type-check, build, and use the running app
(`/api/health` returns `{"status":"ok"}` when the database is reachable). `npm run build` deletes `.next`,
which breaks a running `next dev`; build into another folder with `NEXT_DIST_DIR=.next-build npx next build --webpack`
(and undo the paths Next then adds to `tsconfig.json`). For end-to-end checks, use a throwaway database
(`DB_NAME=clinicdb_test`, `prisma db push`, seed) and a second dev server on another port with its own
`NEXT_DIST_DIR`, rather than the developer's `clinicdb`.

## Layout

```
app/                     pages (all "use client") + app/api/** route handlers
  workspace-shell.tsx    sidebar nav per role, session check, forced password change, lab-result polling
  dashboard.tsx          management dashboard (rendered by app/page.tsx, which redirects LAB/store)
  operator-dashboard.tsx front-desk dashboard for OPERATOR (also rendered by app/page.tsx)
  dashboard-ui.tsx       shared dashboard pieces (KPI tile, panel, ranked bars, header, chart colours)
  use-polling.ts         polling hook: no overlap, pauses in hidden tabs, slows down after failures
  stat-card / table-pagination / date-input / ledger-date-filter   shared UI pieces
lib/                     server helpers (db, auth, roles, transactions, business rules)
prisma/schema.prisma     ~40 models; table/column names are snake_case via @map
prisma/migrations/       developer-PC migration history
scripts/                 CommonJS start-up helpers (not linted)
deploy/                  GoDaddy/cPanel hosting: schema.sql, create-admin.mjs, server.js, README
proxy.ts                 (Next 16's name for middleware) redirects to /login when the session cookie is absent
instrumentation.ts       sets TZ=Asia/Karachi when unset
req/                     client requirement notes, proposals, logos (reference only, not code)
MEDICAL-STORE.md         how the pharmacy module works, end to end
changes.md               design of the Admission (in-patient) module, with what was finally built (section 8)
```

## Roles and modules

`UserRole` = `OPERATOR | MANAGEMENT | LAB | MEDICAL_STORE` (`lib/roles.ts`). Every role lands on `/` after login:
management and operators get their dashboard there (`app/dashboard.tsx`, `app/operator-dashboard.tsx`), LAB and
MEDICAL_STORE are redirected to `/lab` and `/medical-store`. Nav is in `app/workspace-shell.tsx`:

| Role | Pages |
|---|---|
| OPERATOR (front desk) | `/` dashboard (today only: counts, pending results, desk collection; API `app/api/dashboard/operator`), `/patients`, `/opd`, `/diagnostics` (tests billing), `/results`, `/admissions` (+ `/admissions/[id]`), `/ot`, `/emergency` |
| MANAGEMENT | `/` dashboard, `/doctors`, `/reports`, `/payouts`, `/employees`, `/expenses`, `/hospital-settings`, `/inventory`, `/rooms` (beds + admission technician fees), `/users` |
| LAB | `/lab`, `/lab/upload` (enter results), `/configuration` (test and price catalog with result templates) |
| MEDICAL_STORE | `/medical-store/**`: catalog, suppliers, supplier-payments, purchase, reorder, sell (POS; `?admissionId=` / `?otCaseId=` = in-patient credit mode), inpatients, day-closing, adjustments, stock-count, stock-history, expiry, returns/sale, returns/purchase, reports |

Others: `/login`, `/change-password`, `/profile`, `/dev` (developer console, see below).
MANAGEMENT is usually allowed on the other roles' APIs as well; check each route's `roleError` list.

Domain notes:
- **Patients** have an `mrNumber`. **OPD visits** get an `opdNumber` and a per-doctor daily token.
- **Diagnostics** modules are `LABORATORY`, `X-RAY`, `ULTRASOUND`, `ECG` and `ECO`. A `DiagnosticReceipt` holds items. Lab results are typed values from per-test parameter templates (`lib/lab-results.ts`, `lib/lab-template-library.ts`). The old PDF-upload columns are legacy and not read.
- **Doctor earnings**: `lib/doctor-share.ts` computes the OPD hospital/doctor split, OT doctor fees, admission visit fees (the doctor's separate admission split, on visited days of discharged stays), and per-module referral % on diagnostics.
- **OT cases**: line items, advances/part-payments, invoice, and discharge blocked while money is owed. A case with `admissionId` belongs to an admission: no payments or discharge on the OT page (the API refuses them), items only as Due.
  - New OT cases have no typed-in medicine fees (`otMedicineFee`/`homeMedicineFee` stay 0; old cases keep theirs). The store issues the medicine on credit to the OT case (`MedicineSale.otCaseId`), and OT discharge is refused until the store has marked it paid.
- **Admissions** (in-patients; rules in `lib/admission.ts`, API `app/api/admissions/**`):
  - Categories MEDICAL, SURGICAL, CRITICAL (also "suspicious"), NICU. Each may only use beds of certain `RoomBed.category` values (`allowedRoomCategories`); a manually entered room is always allowed.
  - Day rows (`AdmissionDay`: room, doctor fee, technician fee) are added on read by `accrueAdmissionDays`. A stay under 24 hours is 1 day; after that, every calendar date is charged. There is no scheduler; never add a cron for this.
  - The operator can mark a day "doctor did not arrive", which drops that day's doctor fee.
  - Status ADMITTED → INVOICED (charges stop at `invoicedAt`; REOPEN is allowed) → DISCHARGED, or CANCELLED.
  - Discharge needs the hospital balance at exactly 0 (an excess advance is handed back as a negative Payment) and no unsettled store credit.
- **Medical store**: medicines have packaging levels (`lib/medical-store-packaging.ts`). Stock lives in expiry-dated batches and sales draw first-expiry-first-out. Every movement is a `MedicineStockTransaction`. Details in `MEDICAL-STORE.md`.
  - In-patient medicine is a `MedicineSale` with `admissionId` or `otCaseId` (an OT case outside any admission), `purpose` (WARD/OT/HOME) and `creditStatus` UNSETTLED. It has no Payment until the store's "Mark paid" (`app/api/medical-store/inpatients`) creates it. `creditOwed`/`creditNet` in `lib/admission.ts` compute what is owed.
  - A return on an unsettled credit sale has `refundMode` CREDIT. It is excluded from cash refunds (`lib/store-refunds.ts`, day closing).
  - Store revenue (store dashboard, `lib/medical-store-report.ts`): counter sales count when sold. Credit sales count only once SETTLED, dated `settledAt`, and their CREDIT returns come off on that date.
- **Diagnostic receipts** come from the OPD tests counter (`opdVisitId`, paid on the spot) or from an admission (`admissionId`, action ORDER_TESTS: no payment, the total is on the admission's hospital bill, the referring doctor is the attending doctor). `opdVisitId` is therefore optional. The lab's result entry is the same for both.
- **Payments**: each `Payment` belongs to exactly one source (OPD / receipt / OT / emergency / medicine sale / admission). Use `lib/payment-source.ts` to label them; never re-derive this.
- **Employees/payouts**: salary cycle rules live in `lib/payment-cycle.ts` and are shared by both pages.

## How code is written here

**API route** (`app/api/<area>/route.ts`). Every handler starts with the same guard, because `proxy.ts`
only checks that a cookie exists and only on some paths:

```ts
const user = await getCurrentUser();
if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
if (denied) return denied;
```

- Relative imports (`../../../lib/db`); the `@/*` alias exists but is not used.
- Validate the body by hand (`await request.json().catch(() => null)`, `Number(...)`, `typeof ... === "string"`). Return `{ error: "Plain sentence for staff." }` with 400/403/404.
- Respond with plain JSON. Convert Prisma `Decimal` with `.toString()`; the client does the arithmetic.
- Mutations write an `auditLog` row (`action`, `entity`, `entityId`, `userId`, `afterJson`).
- Anything that takes a "next number" (tokens, receipt and OT numbers) runs inside `runTransaction` (`lib/transaction.ts`, retries on duplicate-key or deadlock) and uses the `DailySequence` table.
- Dynamic route params are a Promise: `context: { params: Promise<{ id: string }> }`.

**Page** (`app/<area>/page.tsx`): `"use client"`, data via `fetch("/api/...")`, errors through
`toast.error(data.error ?? "...")`, built from Chakra components and Font Awesome icons, with `TablePagination`
for lists. Live screens use `usePolling`, not `setInterval`. Put a `RefreshButton` (`app/refresh-button.tsx`) in the
header of dashboards and of lists other staff change. Never use `window.confirm`/`alert`: use `useConfirm()` from
`app/confirm-dialog.tsx` (`if (!(await confirm({ title, message }))) return;` and render its dialog once).

**Printing**: receipts, slips and lab reports are HTML strings written into `window.open(...)` and printed
on 80mm thermal paper (`@page { size: 80mm auto }`). Escape user values with the page's `escapeHtml`.

**Dates** (a common source of bugs):
- `@db.Date` columns (`visitDate`, `saleDate`, `expenseDate`, ...) compare in UTC. Wrap every boundary you query them with in `toDateColumnBoundary()` (`lib/date-range.ts`). `DateTime` columns don't need it.
- Show dates with `formatDate()` (dd/mm/yyyy) from `lib/format-date.ts`.
- "Today" means the clinic's day in Asia/Karachi.

Comment style: short "why" comments in plain English, written for the next maintainer.

## Auth

- Passwords are scrypt `salt:hash` (`lib/auth.ts` `hashPassword`/`verifyPassword`).
- The session is a random token in the `careledger_session` cookie. The DB `Session` table stores its sha256, and it expires after 8 hours.
- `mustChangePassword` (set for every newly created or reset account) sends the user to `/change-password`. This is enforced in `workspace-shell.tsx`.
- Login throttling is in memory (`lib/login-throttle.ts`): 5 failures lock the account for 15 minutes.
- Users are never deleted or renamed; they are only deactivated (`active=false`).
- **Never put real passwords or credentials in committed files.** Seed passwords come from `.env` (`SEED_*`).

## Database changes (production constraint)

Production is GoDaddy cPanel shared hosting. There, the schema is loaded by importing `deploy/schema.sql` in phpMyAdmin,
and **`prisma migrate` is not used**. A schema change therefore has to go into all four places:

1. `prisma/schema.prisma`
2. a new folder in `prisma/migrations/` (developer PCs)
3. `scripts/apply-db-updates.cjs`, as an idempotent, check-first step. It runs after `npm run build` (postbuild) and with `npm run db:update`, on Linux or anywhere when `AUTO_DB_UPDATES=true`, and never touches existing data. It no longer runs on every start.
4. `deploy/schema.sql` (for fresh installs)

Run `npx prisma generate` after editing the schema. `scripts/ensure-deps.cjs` repairs a broken
`node_modules` on the host and generates the Prisma client when it is missing.

## Environment (`.env`, gitignored)

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | App connection. Defaults: `localhost`, `3306`, `root`, empty, `clinicdb` |
| `DB_SSL` | `off`, `true` or `strict`. Production defaults to SSL without certificate checks; dev defaults to plain |
| `DATABASE_URL` | Prisma CLI only (`prisma.config.ts` uses a placeholder if unset) |
| `SEED_MANAGEMENT_PASSWORD`, `SEED_OPERATOR_PASSWORD`, `SEED_STORE_PASSWORD`, `SEED_LAB_PASSWORD` | `db:seed` starter logins (`management`, `operator`, `store`, `lab`) |
| `DEV_ACCESS_PASSWORD`, `ENABLE_DEV_CONSOLE` | `/dev` console. Off in production unless `ENABLE_DEV_CONSOLE=true` |
| `MYSQLDUMP_PATH`, `MYSQL_PATH` | Binaries for `/dev` backup and restore (written to `/backups`, gitignored) |
| `AUTO_DB_UPDATES`, `DEV_BUNDLER`, `NEXT_DIST_DIR`, `TZ`, `PORT` | Script and runtime switches described above |

A developer PC runs a local MySQL/MariaDB (WAMP) with database `clinicdb`. The `/dev` console can back up,
restore, wipe ("clean") the database and create a MANAGEMENT login. Its own HMAC cookie survives a wipe.

## Hosting

- `deploy/server.js` is the cPanel start file (production mode, TZ default).
- HTTPS is required because the session cookie is `secure` in production.
- `next.config.ts` sets security headers, `allowedDevOrigins` for GoDaddy's preview, and an optional `distDir`.
- Update process: see `deploy/README.md` ("Updating the app later").
