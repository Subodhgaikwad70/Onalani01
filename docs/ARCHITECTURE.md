# Onalani — Architecture & Operations Guide

This document describes how the Onalani vacation-rental marketplace is structured: runtime layers, authentication, data access, major feature domains, integrations, and local operations.

---

## 1. Purpose & product shape

Onalani is a **single Next.js application** that exposes:

- **Guest** flows: discovery, listing detail, booking quote → checkout (Stripe), trips, messaging, wishlists, credits, complaints.
- **Admin** / **Super Admin** flows: platform-owned catalog (properties, listings, calendar), bookings inbox, guest messaging, marketplace KPIs, complaints, refunds, credits, taxonomies, users, audit log. (`super_admin` is functionally equivalent to `admin` in code.)

All persistent business state lives in **PostgreSQL (Supabase)** with **Row Level Security (RLS)**; the app uses Supabase **Auth** for identity and JWT/session cookies for browser requests.

---

## 2. Technology stack

| Layer | Choice |
|--------|--------|
| Framework | **Next.js** (App Router, React Server Components where applicable) |
| UI | **React**, **Tailwind CSS**, **shadcn/ui** (Radix primitives), **Lucide** icons |
| Client data | **TanStack React Query** (`fetch` to same-origin `/api/*`) |
| Forms / validation | **react-hook-form**, **Zod** (shared with API parsing where applicable) |
| Auth & DB | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) |
| Payments | **Stripe** (PaymentElement; direct charges to the platform account) |
| PMS / availability | **Beds24** (optional; calendar cache + webhooks) |
| Email | **Resend** (optional; notifications) |

Refer to `package.json` for exact dependency versions.

---

## 3. High-level request flow

```text
Browser
  │
  ▼
Next.js (App Router)
  │
  ├─► src/proxy.ts (edge proxy; matcher-limited)
  │     • Refreshes Supabase session cookies when configured
  │     • Enforces coarse role gates on /account, /admin and matching /api/* prefixes
  │
  ├─► Route Handlers (src/app/api/**/route.ts)
  │     • requireAuth / requireRole (lib/auth/guards.ts)
  │     • createSupabaseServerClient() — user-scoped DB (respects RLS)
  │     • createSupabaseAdmin() — service role for privileged reads/writes (server-only)
  │
  └─► Pages & layouts (src/app/**)
        • Server Components: server Supabase client + redirects
        • Client Components: React Query + browser Supabase session context
```

**Important:** `proxy.ts` is a **first line of defense**, not the only authorization layer. Every sensitive Route Handler should still call `requireAuth` / `requireRole` (or equivalent checks), because internal callers or future route changes must not rely on the proxy alone.

---

## 4. Repository layout (conceptual)

| Path | Role |
|------|------|
| `src/app/` | App Router: pages, layouts, Route Handlers (`route.ts`) |
| `src/app/(marketing)/` | Public marketing + discovery (`/`, `/search`, `/properties`, `/listings/...`) |
| `src/app/(account)/account/` | Guest hub (`/account/*`) |
| `src/app/(admin)/admin/` | Admin console (`/admin/*`) — catalog, calendar, inbox, bookings, settings |
| `src/app/auth/` | Auth UI (`/auth/login`, signup, OTP, reset, callback) |
| `src/app/checkout/`, `src/app/bookings/` | Checkout & confirmation (outside segment groups; APIs still enforce auth) |
| `src/components/` | Shared UI: `ui/` (shadcn), feature folders (`booking/`, `host/`, `messaging/`, etc.) |
| `src/components/providers.tsx` | QueryClient, Supabase session listener, Toaster, TooltipProvider |
| `src/lib/` | Auth, API helpers, Supabase factories, pricing engine, Stripe, Beds24 cache, format helpers |
| `src/proxy.ts` | Edge proxy: session refresh + role-based URL/API gating |
| `supabase/migrations/` | Ordered SQL migrations (schema, RLS, triggers, publications) |
| `scripts/seed-dev-data.ts` | Optional dev seed via **service role** |

---

## 5. Authentication & authorization

### 5.1 Identity

- Users authenticate through **Supabase Auth** (email/password, OTP flows per `/api/auth/*`).
- Sessions are stored in **HTTP-only cookies** managed by `@supabase/ssr` on the server and refreshed via the proxy when env keys are present.

### 5.2 Roles

- Canonical roles: **`guest`**, **`admin`**, **`super_admin`** (`profiles.role` enum + JWT `app_metadata.role`).
- `isAdminRole()` treats both `admin` and `super_admin` as staff for guards and RLS helpers (`public.is_admin()`).
- API/session helpers read the JWT claim first (`readRoleFromUser` in `src/lib/auth/session.ts`); profile rows should stay in sync when roles change (admin tooling / service role).

### 5.3 Route protection

| Area | Minimum role (proxy + typical API guard) |
|------|------------------------------------------|
| `/account/*`, `/api/guests/me/*` | Authenticated (treated as **guest** tier minimum) |
| `/admin/*`, `/api/admin/*` | **admin** or **super_admin** |

Non-matched routes (e.g. `/checkout`, `/bookings/...`, `/auth/*`) are **not** listed in the proxy matcher; they rely on **Route Handler** auth and UI redirects.

### 5.4 Database authorization

- **RLS** on almost all tables: policies reference `auth.uid()`, `public.is_admin()`, `public.is_listing_owner(...)`, etc.
- Server Route Handlers normally use the **user-scoped** Supabase client so RLS applies automatically.
- **Service role** (`SUPABASE_SERVICE_ROLE_KEY`) is restricted to server code paths that must bypass RLS (search aggregation, webhooks, admin-only bulk operations, seed scripts).

---

## 6. Data & domain model (conceptual)

The schema is defined incrementally under `supabase/migrations/`. Major pillars:

| Domain | Tables / concepts (non-exhaustive) |
|--------|-----------------------------------|
| Identity | `auth.users`, `profiles`, `notification_preferences` |
| Catalog | `properties`, `listings`, `amenities`, `categories`, joins (`listing_*`), photos, fees, pricing rules |
| Discovery | `listing_views`, `recently_viewed`, `saved_searches`, FTS `search_vector` on listings |
| Pricing / cache | `availability_cache`, `price_cache`, `calendar_blocks`, `listing_calendar_day_overrides` |
| Bookings | `bookings`, `booking_holds`, `booking_requests`, `cancellation_policies`, payment ledger |
| Monetization | Stripe intents/charges; `credit_*`, `promo_*`, platform fee (`PLATFORM_FEE_BPS`) |
| Trust & safety | `complaints`, `user_suspensions`, `admin_audit_log`, etc. |
| Messaging | `conversations`, `messages`, attachments; Realtime publication on selected tables |

Booking pricing logic is centralized in `src/lib/bookings/pricing.ts` and reused by quote + create-booking flows.

---

## 7. API surface (patterns)

- **JSON** request/response; errors typically `{ error: { message, details? } }`.
- **Client helpers:** `src/lib/api/client.ts` (`apiGet`, `apiPost`, `apiPatch`, …) throw `ApiError` on non-OK responses.
- Many list/detail pages use **direct `fetch`** with `credentials: "include"` and React Query keys scoped per feature.

Representative Route Handler groups:

- `/api/auth/*` — login, signup, logout, OTP, password reset
- `/api/search`, `/api/listings/*`, `/api/properties` (as applicable) — discovery & detail
- `/api/bookings/*`, `/api/bookings/quote` — holds, quotes, creates, cancel, pay-intent
- `/api/conversations/*`, `/api/guests/me/*` — guest-scoped “me” APIs
- `/api/admin/*` — catalog CRUD, calendar, storage uploads, dashboard, complaints, refunds, credits, taxonomies, users search, audit
- `/api/webhooks/*` — Stripe, Beds24
- `/api/cron/*` — scheduled jobs (protected by `CRON_SECRET` where implemented)

---

## 8. Frontend architecture

### 8.1 Global shell

- Root layout wraps the tree with **`Providers`** (`QueryClientProvider`, `SupabaseSessionProvider`, toasts, tooltips).
- Segment layouts add **navigation**: marketing header, account sidebar, admin console nav.

### 8.2 Server vs client

- **Server Components** load safe, cache-friendly data and enforce redirects (`redirect("/auth/login?next=…")`) when unauthenticated.
- **Client Components** own interactive UI: infinite search, booking wizard, Stripe Elements, messaging realtime, admin tables.

### 8.3 Realtime

- Browser Supabase client (`src/lib/supabase/browser.ts`) subscribes to channels for messaging/notifications where enabled in migrations.
- Ensure Supabase project has Realtime enabled for the published tables.

---

## 9. External integrations

### 9.1 Stripe

- **Guest checkout:** PaymentElement uses `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; server uses `STRIPE_SECRET_KEY`.
- **Platform charges:** PaymentIntents are created on the platform Stripe account (no Connect).
- **Webhooks:** `/api/webhooks/stripe` validates `STRIPE_WEBHOOK_SECRET` and confirms bookings on `payment_intent.succeeded`.

### 9.2 Beds24 (optional)

- If `BEDS24_API_TOKEN` is set, availability/price cache can be refreshed from Beds24 (`src/lib/beds24/*`).
- Without Beds24 room IDs, listings can still use **base price** + manually seeded `availability_cache` / `price_cache` for demos.

### 9.3 Email (optional)

- Resend + `NOTIFICATION_FROM_EMAIL` for transactional messages where wired (`src/lib/email/resend.ts`).

### 9.4 Storage

- Uploads use signed URLs from `/api/admin/storage/upload-url` into buckets such as `listing-photos`, `complaint-attachments`, `message-attachments` (create buckets + policies in Supabase Dashboard).

---

## 10. Configuration & secrets

See **`.env.example`** for the authoritative variable list. Minimum for local dev:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to the client)

Optional but common:

- Stripe keys + webhook secret  
- `APP_BASE_URL` (links in emails)  
- `CRON_SECRET`, Beds24, Resend  

---

## 11. Database operations

### Apply migrations

Use Supabase CLI from the repo root (after linking the project):

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

Alternatively run migration SQL files in timestamp order via the Supabase SQL Editor (more error-prone).

**Note:** This repo’s migration history was rewritten to remove the multi-host model. For an existing database that already applied older migrations, use a fresh `supabase db reset` locally rather than replaying history on production.

### Dev fixtures

```bash
npm run seed:dev
```

Requires service role in env; creates demo users and catalog/booking fixtures when the demo property slug is absent. See comments in `scripts/seed-dev-data.ts`.

---

## 12. Build, quality, and deployment notes

- **Production build:** `npm run build`
- **Lint:** `npm run lint` — the repo may enforce strict React compiler/lint rules; fix errors before treating CI as green.
- **Image domains:** Remote images allowed in `next.config.ts` (`remotePatterns`); Supabase/storage URLs may require additional patterns or plain `<img>` where used.

---

## 13. Extension points & caveats

- **Maps / bbox search:** Infrastructure exists (`/api/search` bbox param); UI map is optional/future.
- **i18n:** UI copy is English-first; formatting helpers in `src/lib/format.ts` respect profile preferences where wired.
- **Full admin CRUD:** Some admin resources are “create + list” oriented; expanding edit/delete requires matching PATCH/DELETE Route Handlers and RLS-safe updates.
- **Role elevation:** Changing `profiles.role` must be paired with `auth.admin.updateUserById` (`setProfileRole` in `session.ts`) so JWT claims stay consistent.

---

## 14. Quick navigation map

| User | Primary URLs |
|------|----------------|
| Guest | `/`, `/search`, `/listings/[slug]`, `/listings/[slug]/book`, `/checkout/[bookingId]`, `/account/*` |
| Admin / Super Admin | `/admin`, `/admin/properties`, `/admin/listings/[id]`, `/admin/calendar`, `/admin/inbox`, `/admin/bookings`, `/admin/complaints`, `/admin/users`, `/admin/audit` |

This document is intended to onboard engineers and operators; for API contract details, prefer reading the corresponding `route.ts` files and Zod schemas under `src/lib/**/schemas.ts`.
