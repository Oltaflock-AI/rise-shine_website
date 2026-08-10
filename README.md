# Rise & Shine Travels — Website

Website for **Rise & Shine Travels** (Ahmedabad, est. 2011): an on-brand,
SEO-optimized marketing site **plus** a working travel-booking layer — live
flight search and an end-to-end flight booking flow powered by the **TBO
(TekTravels)** Air API, a real tour-package catalogue, and an enquiry pipeline
that lands leads in the agency's Google Sheet.

## Status at a glance

| Area | State |
|------|-------|
| Marketing site (home, about, services, contact, packages) | ✅ Built |
| Package catalogue — 11 real tours, day-by-day itineraries, category pages | ✅ Built |
| **Flight search** — live TBO staging (Authenticate → Search), real fares | ✅ Live (staging) |
| **Flight booking** — FareRule → FareQuote → SSR → Book → Ticket → GetBookingDetails | ✅ Built, staging — **prod certification pending** |
| Checkout — FareQuote-driven dynamic passenger form (asks for exactly what TBO requires) | ✅ Built |
| Auth — login / signup / account | ✅ **Supabase Auth** (email + password), server-verified sessions, RLS |
| Enquiry forms → agency Google Form / Sheet | ✅ Live |
| SEO — sitemap, robots, `TravelAgency` JSON-LD, legacy-URL 301s | ✅ Built |
| Legal — terms & conditions, refund policy (privacy policy referenced within terms) | ✅ Built |
| AI itinerary generator | 🔒 Reserved placeholder (`/itinerary`, noindex) |
| Hotels | 🚧 Data/UI groundwork; not wired to TBO booking |

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** — SSR/SSG, file-based routing, route handlers for the API layer
- **Tailwind CSS v4** — brand design tokens in `src/app/globals.css` (`@theme`)
- **next/font** — Roboto (UI/body) + Dancing Script (script accent)
- **lucide-react** — SVG icon set (no emoji)
- **TBO (TekTravels) Air API** — flight search + booking (server-only)
- Deploy target: **Vercel**

> **Next.js 16 note:** APIs and conventions differ from older majors. See
> `AGENTS.md` — read `node_modules/next/dist/docs/` before writing framework code.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (type-check + static generation)
npm start        # serve the production build
npm run lint     # eslint (next core-web-vitals + typescript)
```

### Environment (`.env.local`, git-ignored — never commit)

Copy `.env.local.example` → `.env.local` and fill in. The site still builds and
runs with these blank: auth and flight features simply degrade gracefully.

```bash
# Supabase — customer accounts (both keys are browser-safe; RLS protects data)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...   # server-only, for writing booking history later

# TBO — flight search + booking
TBO_CLIENT_ID=...        # TBO client id
TBO_USERNAME=...         # TBO API username
TBO_PASSWORD=...         # TBO API password
TBO_END_USER_IP=...      # IP whitelisted with TBO (defaults to a staging IP)
# TBO_BOOK_URL=...       # optional: override Book/Ticket URL if TBO provisions AirBook
```

TBO reference credentials + endpoint notes live in `reference/api-setup/` — **git-ignored**.

### Supabase setup (one-time)

1. Create a project (region **ap-south-1 / Mumbai** for India latency + residency).
2. **Project Settings → API** → copy the URL + anon key into `.env.local`.
3. Run `supabase/migrations/0001_init.sql` in the **SQL Editor** (creates
   `profiles`/`bookings`/`passengers`/`travellers`/`enquiries` + RLS + the
   auto-profile trigger). Or with the CLI: `supabase db push`.
4. **Auth → Providers → Email:** turn **off** "Confirm email" for instant
   login-after-signup (matches the current UX); leave it on and signup prompts
   the user to confirm via the emailed link (handled by `/auth/callback`).
5. **Auth → URL Configuration:** add your deploy origin(s) to redirect URLs.

## Routes

**Pages**
`/` · `/about` · `/services` · `/contact` · `/plan-my-trip` ·
`/packages` (+ `/packages/[category]` and `/packages/[category]/[slug]`) ·
`/flights` (live search results) · `/checkout` (booking) ·
`/login` · `/signup` · `/account` (demo auth) ·
`/terms` · `/refund-policy` · `/itinerary` (reserved) ·
plus `sitemap.xml`, `robots.txt`, `not-found`.

**API route handlers** (`src/app/api/`, all server-only, `runtime = "nodejs"`)
- `GET /api/flights` — live TBO search; accepts IATA codes **or** city/airport names
- `POST /api/quote` — FareRule + FareQuote; tells checkout which fields TBO demands
- `POST /api/book` — full booking flow (Book/Ticket up to 300s; `maxDuration = 300`)

## Project structure

```
src/
  proxy.ts             Next 16 "middleware": refreshes Supabase session, gates /account
  app/                 routes (folder-per-page) + layout, sitemap, robots, not-found
    api/               flights (search), quote (FareQuote), book (booking) — server only
    auth/callback/     exchanges the email-confirm / OAuth code for a session
  components/
    layout/            Header, HeaderAuth, Footer, WhatsAppFloat
    sections/          Hero, SearchBar, Marquee, PageHero, CTABand, Testimonials, …
    ui/                Button, Icon, PackageCard, FlightCard, LiveFare, Reveal, Counter, …
    forms/             ContactForm, PlanTripForm, shared controls
    auth/              AuthScreen, AccountView  (login/signup/account UI)
    checkout/          CheckoutView, BookingForm (TBO passenger form)
  lib/
    supabase/          browser + server Supabase clients (@supabase/ssr)
    auth.tsx           useAuth() provider — Supabase Auth, session + onAuthStateChange
    tbo.ts             TBO client — auth + Search, normalized fares (server only)
    tbo-book.ts        TBO booking flow: FareRule→FareQuote→SSR→Book→Ticket→GetBookingDetails
    tbo-validate.ts    every TBO certification-checklist validation + normalizers
    actions.ts         "use server" enquiry handler → Google Form
    googleForm.ts      Lead → Google Form field mapping
    cn.ts              className helper
  data/                ← EDIT CONTENT HERE
    site.ts            business info / NAP / nav (single source of truth)
    catalog/           11 real tour packages (domestic / international / cruise)
    itineraries/       lighter itinerary content
    packages.ts services.ts testimonials.ts accreditations.ts content.ts
    airports.ts airlineLogos.ts
supabase/migrations/   0001_init.sql — accounts schema + RLS (run in Supabase)
public/brand/          logo (red + white), favicons, OG image
reference/             source material + TBO live creds/notes — git-ignored, NOT deployed
```

## Editing content

Copy/data is centralized in `src/data/` — no component changes needed:

- **Business info / contact / nav** → `src/data/site.ts`
- **Tour packages** (real itineraries) → `src/data/catalog/` (per-category files, wired in `catalog/index.ts`)
- **Services, testimonials, stats, accreditations** → their files in `src/data/`

## How the booking layer works

1. **Search** (`lib/tbo.ts`): caches a TBO auth token, POSTs a Search, normalizes
   raw results into `FlightOffer`s (per-adult fares, de-duped fare classes,
   cheapest-first). Results cache for 10 min — under TBO's 15-min `TraceId` window.
2. **Quote** (`/api/quote` → `quoteFare`): runs FareRule + FareQuote so the
   checkout form can ask for **exactly** the fields TBO requires (PAN, passport,
   GST, mandatory seat/meal) instead of guessing, and surface price changes.
3. **Book** (`/api/book` → `bookFlight`): validates passengers, applies free
   SSR (baggage/meal/seat), guards against duplicate bookings, runs the LCC
   (Ticket-only) or non-LCC (Book→Ticket) path, and — critically — on a timeout
   **never re-books**; it recovers via GetBookingDetails to avoid double charges.

`tbo-validate.ts` encodes TBO's full certification checklist (ErrorCode-6 token
refresh matched by *code* not message, TraceId expiry, title normalization,
PAN/passport/GST rules, special-fare seat+meal, duplicate guard). Reference:
<https://apidoc.tektravels.com/flight/apivalidation.aspx>.

## Before production launch

- **TBO:** complete production certification and switch endpoints/creds from staging.
  Creds are `TBO_CLIENT_ID` / `TBO_USERNAME` / `TBO_PASSWORD` / `TBO_END_USER_IP`;
  endpoints are `TBO_AUTH_URL` / `TBO_AIR_URL` (flights), `TBO_BOOK_URL`,
  `TBO_HOTEL_URL`, `TBO_HOTEL_STATIC_URL`, `TBO_HOTEL_BE_URL` — all config, no code.
  Production creds are IP-whitelisted and Vercel has no fixed egress IP, so
  `TBO_PROXY_URL` must point at the static-IP forward proxy before they will work.
- **Set `PAYMENTS_REQUIRED=true` in the same change that installs live TBO creds.**
  Without it, an absent or half-set Razorpay key pair silently re-enables the
  direct-ticket path — which against live credentials issues real tickets on real
  agency credit for free. With it, the booking routes fail closed instead.
- **Auth:** real now — Supabase Auth (email + password) with server-verified
  sessions and RLS. `useAuth()` (in `lib/auth.tsx`) is unchanged for consumers;
  add OAuth providers / password reset when needed. Persisting booking history to
  the `bookings` table (server-side, service-role key) is the next wiring step.
- **Payments:** Razorpay is built but not switched on — no keys, so nothing charges.
  Bookings currently ticket on TBO's staging credit. Turning it on needs keys plus
  sandbox, failure-path and webhook testing and reconciliation sign-off.
- **Business data:** verify `TODO`s in `src/data/site.ts` (GSTIN, socials, reviews URL, domain `url`).
- **Images:** marketing photos load from Unsplash (allowed in `next.config.ts`).
  Localize into `public/` for full performance control.

## SEO

Per-page metadata, canonical URLs, `TravelAgency` JSON-LD (`app/layout.tsx`),
generated `sitemap.ts` / `robots.ts`, and permanent 301/308 redirects from the
old `riseandshinetravel.com` `.html` tour URLs to the new catalogue pages
(`next.config.ts`, `LEGACY_TOUR_REDIRECTS`).
