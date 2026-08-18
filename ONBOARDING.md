# Rise & Shine Travels — Developer Onboarding

**For: Adnan** · Last updated: 27 Jul 2026 · Companion doc: [ARCHITECTURE.html](ARCHITECTURE.html) (open in a browser — visual map of the same material)

---

## 1. What this actually is

Two things living in one Next.js app:

1. **A marketing site** for Rise & Shine Travels, a travel agency in Ahmedabad — packages, itineraries, services, enquiry forms.
2. **A real online travel agency (OTA)** — live flight and hotel search, booking and ticketing against **TBO (TekTravels)**, with **Cashfree Payments** taking real money.

The second part is why this codebase is careful in places that look paranoid. When a bug ships here, a customer is charged and does not get a ticket. Read §7 (Rules that will bite you) before you touch anything under `src/lib/tbo*` or `src/app/api/`.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · Supabase (auth + Postgres) · Vercel (hosting + cron).

> ⚠️ **Next.js 16 is not the Next.js in your memory or in most blog posts.** APIs and file conventions changed. Before writing framework-level code (routing, caching, middleware, params), check the bundled docs in `node_modules/next/dist/docs/`. This is a standing project rule — see `AGENTS.md`.

---

## 2. Get it running (15 minutes)

```bash
git clone <repo> && cd rise-shine-website
npm install
cp .env.local.example .env.local     # then fill in — see below
npm run dev                          # http://localhost:3000
```

**The site boots with an empty `.env.local`.** Every integration is feature-flagged by the presence of its keys, so nothing crashes — features just degrade:

| Missing keys | What happens |
|---|---|
| `TBO_*` | Flight/hotel search returns "unavailable"; marketing site is fully functional |
| `CASHFREE_*` | Flights refuse to book; hotels fall back to an unpaid Book on TBO's certification hosts only |
| `NEXT_PUBLIC_SUPABASE_*` | Auth + account pages are inert; `src/proxy.ts` becomes a no-op |
| `RESEND_API_KEY` | Confirmation/refund emails are silently skipped — bookings never fail on email |
| `GOOGLE_MAPS_API_KEY` | Testimonials fall back to static reviews in `src/data/`; hotel cards lose review scores |
| `ELEVENLABS_WEBHOOK_SECRET` | `/api/voice/webhook` returns 503 |

Get the real values from Khush. **Never commit `.env.local`.** `reference/` is git-ignored and holds live TBO credentials and certification evidence — never surface, paste, or commit anything from it.

### Verify your changes — always these three

```bash
npm run lint      # ESLint (some pre-existing errors in voice-agent/ — see §10)
npm test          # Vitest — money-path unit tests (tests/)
npm run build     # type-checks + static-generates. This is the real gate.
```

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit`, `npm test`, `npm run build` on every push/PR, plus lint non-blocking.

---

## 3. Where everything lives

```
src/
├── app/                       # routes — folder per page
│   ├── layout.tsx             # fonts, metadata, JSON-LD, AuthProvider, Header/Footer/WhatsApp
│   ├── api/                   # server-only route handlers (see §5)
│   ├── auth/callback/route.ts # Supabase email-confirm / OAuth code exchange
│   ├── flights/ hotels/ checkout/ account/ packages/ ...
│   └── sitemap.ts robots.ts
├── components/
│   ├── layout/  sections/  ui/  forms/  auth/  checkout/
├── data/                      # ALL COPY AND CONTENT. Edit here, not in components.
│   ├── site.ts                # single source of truth for NAP, phones, socials, nav, GSTIN
│   ├── catalog/               # tour packages, per category → catalog/index.ts
│   ├── itineraries/  airports.ts  hotel-cities.ts  testimonials.ts  services.ts
├── lib/                       # integrations + business logic (see §4)
└── proxy.ts                   # Next 16's renamed middleware — session refresh + route gating

supabase/migrations/           # 0001 auth/bookings · 0002 payments cols · 0003 ledger
                               # 0004 hotel cols · 0005 voice_calls
tests/                         # vitest — booking-request, cashfree webhook HMAC, tbo-validate
scripts/                       # fetch-hotel-cities.mjs · flight-cert.mts (certification runner)
voice-agent/                   # SEPARATE app in the same repo. .vercelignore'd, never deployed
reference/                     # GIT-IGNORED — live creds + TBO certification evidence
```

**Content rule:** if you're changing words, prices, phone numbers, or tour details, the change belongs in `src/data/`. Components read data; they don't own it.

---

## 4. The `src/lib/` layer — what each file owns

Everything TBO/Cashfree/Supabase-admin is **server-only** (most import `"server-only"`, which throws if bundled into a client component).

### Flights (TBO)

| File | Owns |
|---|---|
| `tbo.ts` | Auth token cache + **Search**. Normalizes raw TBO results → `FlightOffer` (per-adult fares, de-dupe, cheapest-first). 10-minute result cache. |
| `tbo-book.ts` | The booking flow: FareRule → FareQuote → SSR → **Book/Ticket** → GetBookingDetails. LCC = Ticket-only; non-LCC = Book→Ticket. Owns timeouts + timeout recovery. |
| `tbo-validate.ts` | TBO's whole certification checklist: PAN/passport/GST rules, title normalization, special-fare seat+meal, duplicate guard, per-pax fare split. |
| `tbo-fetch.ts` | One wrapper: routes every TBO call through an optional static-IP forward proxy (`TBO_PROXY_URL`). |

### Hotels (TBO — different hosts, different auth)

| File | Owns |
|---|---|
| `tbo-hotel-static.ts` | **Static data** API (Basic auth, *static-data* creds): CountryList, CityList, TBOHotelCodeList, HotelDetails. |
| `tbo-hotel.ts` | **Search + PreBook** (Basic auth, *agency* creds). PreBook is the hotel analogue of FareQuote. |
| `tbo-hotel-book.ts` | **Book** + guest validation + recovery-by-reference if Book times out. |
| `tbo-hotel-post.ts` | Post-booking: GetBookingDetail, GenerateVoucher, Cancel, cancel-status polling. |

### Money, identity, notification

| File | Owns |
|---|---|
| `cashfree.ts` | Create order, `confirmPaidOrder()` (server-side Get Order — the browser gets no signed receipt), refund, webhook HMAC. Raw REST + `node:crypto` — **no SDK**. |
| `payments-ledger.ts` | Writes the `payments` reconciliation table from the webhook (service-role). |
| `booking-request.ts` | Parses/normalizes an incoming booking body → `BookingRequest`. Shared by `/api/payment/order` and `/api/book` so both see identical input. |
| `booking-history.ts` | Mirrors confirmed flight/hotel bookings into `bookings` + `passengers` for the account page. |
| `email.ts` | Resend transport + all HTML templates (confirmations, refund notices). |
| `alerts.ts` | `alertOps()` — money-critical ops alerts. Always `console.error`, emails when configured. |
| `supabase/client.ts` · `server.ts` · `admin.ts` | Browser client · server client (async `cookies()`, `getUser()`) · service-role client. |
| `auth.tsx` | `useAuth()` — the stable `{ user, ready, login, signup, logout }` API over the browser client. |
| `rate-limit.ts` | Per-IP fixed-window limiter for the expensive public routes. In-memory, not distributed. |
| `flags.ts` | `AUTH_DISABLED = true` — sign-in is currently switched off (§8). |

### Support

`google-reviews.ts` (live Google reviews for testimonials) · `hotel-ratings.ts` (Places review scores on hotel cards) · `hotel-city-search.ts` · `googleForm.ts` + `actions.ts` (enquiry forms → the agency's Google Form; this is the lead pipeline) · `elevenlabs-webhook.ts` + `voice-calls.ts` (voice agent CRM) · `analytics.ts` (GA4 funnel) · `format-date.ts` · `recent-searches.ts` · `cn.ts`.

---

## 5. API surface

All handlers are thin — they parse, rate-limit, delegate to `lib/`, and shape the response. All are `runtime = "nodejs"`, and everything that touches TBO is `dynamic = "force-dynamic"`.

### Flights

| Method | Route | Purpose | Notes |
|---|---|---|---|
| `GET` | `/api/flights` | Search | `?from=&to=&depart=&return=&adults=&trip=&max=` — from/to accept IATA or city name. Rate limit 20/min. CDN `s-maxage=1800`. |
| `POST` | `/api/quote` | FareRule + FareQuote | Returns `flags` telling the form which fields TBO demands (PAN/passport/GST/seat/meal). Rate limit 15/min. |
| `POST` | `/api/payment/order` | **Validate, then open a Cashfree order** | Runs the FULL pre-ticket flow before charging. `maxDuration = 120`. |
| `POST` | `/api/book` | Verify payment → ticket | `maxDuration = 300`. Auto-refunds if ticketing fails after capture. |
| `POST` | `/api/payment/webhook` | Cashfree server-to-server events | HMAC over the **raw** body. Writes the `payments` ledger. |

### Hotels

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/hotels/cities` | Destination autocomplete (static dataset, CDN-cached) |
| `POST` | `/api/hotels` | Search priced rooms — pass `hotelCodes` or a `cityCode` (first 100 hotels) |
| `POST` | `/api/hotels/quote` | PreBook — re-price + return validation rules |
| `POST` | `/api/hotels/payment/order` | PreBook + guest validation + Cashfree order |
| `POST` | `/api/hotels/book` | Verify payment → Book. Auto-refunds on failure |
| `POST` | `/api/hotels/cancel` | Cancel / poll cancellation. **Auth required + ownership checked** against the account mirror |

### Other

| Method | Route | Purpose |
|---|---|---|
| `POST`/`GET` | `/api/voice/webhook` | ElevenLabs post-call events → `voice_calls`. `GET` is a health check |
| `GET` | `/api/cron/reconcile` | Weekly ledger-vs-bookings digest. Vercel cron `30 3 * * 1`, `Bearer CRON_SECRET` |
| `GET` | `/auth/callback` | Supabase code exchange, open-redirect-safe |

### Response conventions

- Everything returns `{ ok: boolean, ... }`.
- **`422`** = caller's fault, a validation rule failed (`{ error, rule }`) — the form can fix this and retry.
- **`502`** = supplier/upstream failure — not the customer's fault.
- **`402`** = payment required / not captured. **`429`** = rate limited (`Retry-After` header). **`503`** = that integration isn't configured.

Note the search pages (`/flights`, `/hotels`) **do not** call these API routes — they're server components that call `lib/` directly and stream results inside a keyed `<Suspense>`. The API routes exist for client-side needs (checkout, autocomplete, live fares, cancellation).

---

## 6. The two flows that matter

### Flight booking — capture, then fulfil

```
Browser                     Our server                        TBO / Cashfree
────────────────────────────────────────────────────────────────────────────
search  ──────────────────► /flights (server component) ────► Search
                                                              ↳ TraceId (15-min life)
"Book"  ──────────────────► POST /api/quote ────────────────► FareRule → FareQuote
                            ↳ flags: PAN? passport? GST?
fill the form
"Pay"   ──────────────────► POST /api/payment/order
                            ↳ validateBooking():
                               FareRule → FareQuote →
                               all checklist validations →
                               SSR → duplicate guard        ← nothing charged yet
                            ↳ createOrder(FareQuote total)  ──► Cashfree order
                               + order_tags.bind = this fare      ↳ payment_session_id
Cashfree popup opens (cashfree.js v3) → customer pays        ──► payment SUCCESS
done    ──────────────────► POST /api/book  { payment: { orderId } }
                            ↳ confirmPaidOrder(): Get Order  ──► order_status PAID?
                               + bind tag matches this fare?     (the browser's own
                               + a SUCCESS payment row?           result is never trusted)
                            ↳ bookFlight() ──────────────────► Book → Ticket
                               ├ ok   → mirror to `bookings`, email confirmation
                               └ fail → REFUND automatically, alert ops, email customer
```

**Why this shape:** the order amount is TBO's re-priced FareQuote total, never a number from the browser. `bookFlight` and `validateBooking` share `prepareBooking`, so the pre-charge checks and the ticketing checks are literally the same code — a booking TBO would reject fails *before* the card is charged.

`/api/payment/webhook` runs in parallel and independently: even if the customer closes the tab the instant they pay, the money movement lands in the `payments` ledger. `/api/cron/reconcile` compares that ledger against `bookings` weekly and emails anything captured with no booking on record.

### Hotel booking

Same shape, different supplier calls: `PreBook` replaces FareQuote as the authoritative re-price and the source of the validation rules; `Book` replaces Book→Ticket. One extra rule we learned during certification: **TBO enforces PAN on every international hotel booking even when the rate's `ValidationInfo` doesn't flag it** — so `/api/hotels/quote` force-sets `panMandatory` whenever the destination country isn't `IN`.

---

## 7. Rules that will bite you if you ignore them

These are not style preferences. Each one exists because it broke, or would break, real money.

1. **Never import `tbo*.ts`, `cashfree.ts`, `supabase/admin.ts`, `alerts.ts`, or `email.ts` from a client component.** They read credentials from `process.env`. Reach them only through `/api/*` or from server components.
2. **TraceId expires 15 minutes after Search.** The search cache TTL is 10 minutes — deliberately under it. Don't lengthen it; a stale TraceId fails at Book.
3. **Match TBO errors by `ErrorCode`, never by message text.** Code `6` = invalid token → refresh and retry once. This is TBO's explicit checklist rule.
4. **Book/Ticket are NEVER auto-retried.** On timeout, recover via `GetBookingDetails` (`recoverFromTimeout`, polls 20× at 12s). Re-booking double-charges. Hotels recover by `clientReferenceNo`.
5. **The charged amount always comes from the supplier's re-price** (FareQuote / PreBook), never from the request body.
6. **Never ticket before confirming payment server-side.** Cashfree hands the browser no signed receipt, so `/api/book` re-reads the order from Cashfree and requires `order_status === "PAID"`, a matching `order_tags.bind`, and a `SUCCESS` payment row. Nothing the client sends is evidence.
7. **If fulfilment fails after capture, refund immediately.** If the refund itself fails, `alertOps()` must fire — a failed refund can never be a console line nobody reads.
8. **On the server, verify the session with `supabase.auth.getUser()`, never `getSession()`.** `getUser()` re-validates the token against Supabase.
9. **Keep `useAuth()`'s shape stable** — `{ user: {name, email}, ready, login, signup, logout }`. Header, AuthScreen and AccountView all depend on it.
10. **Only server code with the service-role key writes `bookings`.** Client writes go through RLS; RLS gives users read-only access to their own rows.
11. **Next 16 renamed `middleware` → `proxy`.** The file is `src/proxy.ts`, it exports `proxy()`, and it runs on the Node.js runtime. Do not create a `middleware.ts`.
12. **Webhook signatures are computed over the RAW body.** Read `req.text()` and verify before parsing — re-serializing the JSON changes the bytes and breaks the HMAC. Applies to both Cashfree and ElevenLabs. Cashfree additionally signs `x-webhook-timestamp + body` and encodes base64, not hex.
13. **Webhook status codes are an API.** A DB write failure returns `500` so the sender retries; a bad signature or unknown event is terminal and gets `4xx`/`200`.
14. **Best-effort side effects are `await`ed before responding.** On serverless the instance can freeze the moment you return, so fire-and-forget writes get killed. Wrap them in try/catch so they can never fail a paid booking.
15. **All user-facing dates go through `formatDate()`** (`src/lib/format-date.ts`) — DD-MM-YY. No raw ISO strings in UI.
16. **Keep `LEGACY_TOUR_REDIRECTS` in `next.config.ts` in sync with catalogue slugs.** Those 308s preserve the old site's search rankings.

---

## 8. Current state — things that surprise people

- **Sign-in is switched OFF.** `src/lib/flags.ts` → `AUTH_DISABLED = true`. TBO's portal verification required booking to work without an account. Flipping it back to `false` restores the header auth UI, the `/login` + `/signup` screens and the checkout gate — no other code changes. Auth itself (Supabase, RLS, proxy gating) is fully built and working underneath.
- **Certification is done.** All 7 TBO flight cases and all 8 hotel cases were ticketed/confirmed on the test environment; evidence lives in `reference/`. Some of those logs deliberately contain *failed* supplier attempts alongside the successful recovery — that's the point, they prove the recovery path.
- **TBO whitelists caller IPs in production, and Vercel has no fixed egress IP.** Hence `TBO_PROXY_URL` — when set, every TBO call routes through a static-IP forward proxy. Unset in dev/staging.
- **`voice-agent/` is a separate app in the same repo and is never deployed** (`.vercelignore`). The ElevenLabs webhook deliberately lives on the marketing site, because that's the only deployed app with a public HTTPS URL and service-role Supabase access. Nearly all the repo's lint errors are inside `voice-agent/`, not `src/`.
- **`bookings` is a *mirror*, not the source of truth.** TBO owns bookings; we mirror confirmed ones so the account page has something to show. Guest bookings (no session) are never mirrored — which is why the reconciliation digest says "verify by hand" instead of crying fraud.
- **The enquiry forms post to the agency's Google Form** (`lib/googleForm.ts`). That's the entire lead pipeline. No CRM, no email — marked TODO.

---

## 9. Database (Supabase Postgres)

| Table | Written by | Notes |
|---|---|---|
| `profiles` | trigger on `auth.users` | RLS: owner read/insert/update |
| `travellers` | user | Saved passenger details. RLS: owner all |
| `bookings` | **service-role only** | Flight *and* hotel (`kind` column, migration 0004). Mirrors PNR/BookingId/status/fare + Cashfree ids. RLS: owner read |
| `passengers` | service-role | Per-booking pax + ticket numbers. RLS: read via owned booking |
| `enquiries` | user | RLS: owner read/insert |
| `payments` | **webhook, service-role** | Reconciliation ledger keyed by `cf_payment_id`. `captured \| failed \| refunded` |
| `voice_calls` | voice webhook, service-role | Keyed by `conversation_id`. Audio in the private `voice-call-audio` bucket |

Migrations are plain SQL in `supabase/migrations/`, applied in order. `bookings.status` uses TBO's itinerary status codes (`5` = ticketed, `6` = cancellation requested).

---

## 10. Working here

**Conventions**
- TypeScript strict. Icons from `lucide-react` — **no emoji** in the UI.
- Class names composed with `cn()` (`src/lib/cn.ts`).
- Business info comes from `src/data/site.ts` — never hardcode a phone number or address.
- Comments explain *why*, not *what*. Look at the header comment on `tbo-book.ts` for the house style: it names the constraint and the evidence.

**Before you open a PR**
1. `npm run build` passes (this type-checks).
2. `npm test` passes — if you touched anything in the money path, add a test.
3. New lint errors in `src/` = fix them. Pre-existing ones in `voice-agent/` = leave them.
4. If you changed an env var, update `.env.local.example` **and** its explanatory comment.

**Good first tasks to get oriented**
- Add a tour package in `src/data/catalog/` and see it appear at `/packages/<category>/<slug>`.
- Trace one request end to end: `/flights?from=AMD&to=GOI` → `src/app/flights/page.tsx` → `lib/tbo.ts` → the TBO response shape → `FlightCard`.
- Read `tests/tbo-validate.test.ts`, then read `src/lib/tbo-validate.ts` alongside TBO's checklist: <https://apidoc.tektravels.com/flight/apivalidation.aspx>.
- Hit `GET /api/voice/webhook` on production — it's a health check and tells you whether the secret is configured.

**Where to look things up**
- `CLAUDE.md` — the condensed architecture rules (this doc's parent).
- `AGENTS.md` — the Next.js 16 warning.
- `README.md` — setup, routes, project structure.
- `node_modules/next/dist/docs/` — the framework docs for the exact version installed. Trust these over anything online.
- TBO flight API: <https://apidoc.tektravels.com/> · Cashfree: <https://www.cashfree.com/docs/api-reference/payments/latest/overview> · Supabase: <https://supabase.com/docs>

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **TBO / TekTravels** | The supplier. Their API is the actual inventory — flights, hotels, ticketing. |
| **TraceId** | TBO's search-session id. Every later call quotes it. Dies 15 minutes after Search. |
| **ResultIndex** | Identifies one fare within a search result. TraceId + ResultIndex = "this specific fare". |
| **LCC** | Low-cost carrier. LCC fares ticket in one step; non-LCC book first, then ticket. |
| **FareQuote** | TBO re-prices the fare and tells you what it requires (PAN, passport, GST, seat, meal). Authoritative. |
| **PreBook** | The hotel equivalent of FareQuote. |
| **SSR** | Special Service Request — baggage, meals, seats. |
| **PNR** | The airline's booking reference. |
| **Capture** | The money has actually moved. With Cashfree this is `order_status === "PAID"`, confirmed server-side. We only ticket after that. |
| **RLS** | Row Level Security — Postgres policies that decide which rows a signed-in user can see. |
| **Certification** | TBO's live test-environment checklist that must pass before production credentials are issued. Done for both flights and hotels. |

---

## Ask before you guess

If something in the payment or ticketing path looks wrong, ask before changing it. Most of the odd-looking code there is odd because a supplier or a payment gateway behaved badly once, and the comment above it usually says so. Everywhere else — components, content, styling, the marketing site — dive straight in.
