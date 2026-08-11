@AGENTS.md

# Rise & Shine Travels — agent guide

Marketing site + real **TBO (TekTravels) flight and hotel booking** for an
Ahmedabad travel agency. **Next.js 16 App Router, React 19, TypeScript, Tailwind
v4.** Deploy target: Vercel. `@/*` → `src/*`.

`AGENTS.md` (imported above) is binding: **Next.js 16 has breaking changes vs.
older majors — check `node_modules/next/dist/docs/` before writing framework code.**

## Architecture

- **`src/app/`** — routes (folder-per-page) + `layout.tsx` (fonts, metadata, JSON-LD,
  `AuthProvider`, Header/Footer/WhatsApp). `api/` holds server-only route handlers.
- **`src/components/`** — `layout/` · `sections/` · `ui/` · `forms/` · `auth/` · `checkout/`.
- **`src/lib/`** — the TBO integration + auth + form actions (see below).
- **`src/data/`** — **all copy/content lives here.** Change content by editing data,
  not components.
- **`supabase/migrations/`** — account, passenger, payment-ledger, hotel-booking,
  voice-call-log (`0005`) and callback-queue (`0006`) schema. TBO remains canonical;
  Supabase is an account-facing mirror.
- **`voice-agent/`** — separate Next.js 15 app: a dashboard over the ElevenLabs
  conversation API. Its own package manifest; run it from that directory. It is
  excluded from this project's deploy by `.vercelignore`, so it never ships with
  the website. The call data is read-only — the submit form, WhatsApp preview and
  outbound-call route were removed, and placing calls now belongs to
  `/request-a-call` (see **Voice** below). Its one write surface is `/access`, the
  team list (`lib/access.ts` · `access-store.ts` · `session.ts`). Sign-in is not
  built, so `getViewer()` stands in as an admin and the page says so; the
  capability checks behind it are real and already return 401/403. Do not add a
  header- or query-supplied email to `emailFromSession()` — that is an
  impersonation hole wearing a login's clothes.

### The TBO booking layer (`src/lib/`) — server only

| File | Responsibility |
|------|----------------|
| `tbo.ts` | Auth token cache + **Search**; normalizes raw TBO results → `FlightOffer` (per-adult fares, de-dupe, cheapest-first). 10-min result cache. |
| `tbo-book.ts` | Booking flow: FareRule → FareQuote → SSR → **Book/Ticket** → GetBookingDetails. LCC = Ticket-only; non-LCC = Book→Ticket. |
| `tbo-validate.ts` | The whole TBO certification checklist: PAN/passport/GST, title normalization, special-fare seat+meal, duplicate guard, per-pax fare split. |
| `razorpay.ts` | Dormant payment scaffold: Razorpay REST calls, HMAC verification, capture checks, and refunds. Project owners confirm payments are **not implemented/live**. |
| `booking-request.ts` | Parse/normalize an incoming booking body → `BookingRequest` (title normalization, casing). Shared by `/api/payment/order` and `/api/book`. |
| `payments-ledger.ts` | Reconciliation ledger writer — upserts the `payments` table from the webhook (service-role). |

API handlers are thin: `GET /api/flights` (search), `POST /api/quote` (FareQuote →
which fields the form needs), and `POST /api/book` (booking). Payment-shaped routes
(`/api/payment/order` and `/api/payment/webhook`) are scaffolding only; do not present
them as a working integration. All are `runtime = "nodejs"`, `dynamic =
"force-dynamic"`; book declares `maxDuration = 300`, order `120`.

**Those durations are aspirational.** The Vercel project is on the **Hobby** plan,
which caps every function at **60 seconds** regardless of a higher `maxDuration`, and
will not run Vercel Cron more often than daily. Assume 60s when reasoning about any
timeout, and drive sub-daily schedules from an external pinger (see **Voice**).

### Hotels

Hotel search joins TBO's static city/hotel catalogue (`tbo-hotel-static.ts`) with
live room pricing (`tbo-hotel.ts`). Checkout runs **PreBook** to re-price and discover
PAN/passport requirements, then calls the booking flow. The hotel Razorpay order,
capture, and refund code is dormant scaffolding, not an implemented payment system.
Post-booking detail, voucher, and cancellation calls live in `tbo-hotel-post.ts`.
Never retry Hotel Book after a timeout; recover by client reference.

**Rules TBO's portal verification enforces — don't "tidy" these away:**

- **Show `TotalFare`, never `NetAmount`.** NetAmount is TBO's charge to the agency
  and belongs only in the Book RQ. The one permitted adjustment is the B2C floor at
  `RecommendedSellingRate`. Fares are displayed **unrounded** (2 dp) everywhere.
- **`Filters.NoOfRooms` is never sent** — TBO wants the full room feed (0 behaviour).
  The results card trims to the cheapest room on our side, after the response.
- **A city search fans out in parallel** ≤100-code batches (`CITY_SEARCH_CODE_CEILING`),
  never one truncated request. `/hotels` does this itself; it does not call `/api/hotels`.
- **Guest nationality is collected, not assumed.** Any nationality for stays in India;
  Indian nationality only for international stays (`src/data/nationalities.ts`), and
  Book must carry the same value Search used.
- **Search RS already carries `Supplements` and `RoomPromotion`** (verified live against
  TBO's sample codes) — they render on the room page. `RateConditions` are PreBook-only,
  so `RoomRateDetails` PreBooks on demand when the guest expands a rate.
- **After a confirmed Book, GetBookingDetail is re-read 120 s later**, never sooner —
  TBO's systems only settle by then (`BookingDetailCheck` → `/api/hotels/booking-detail`,
  ownership-checked). The voucher page renders that response.
- `RecommendedSellingRate` is **absent** on the current credentials, including on TBO's
  own RSP sample codes (`scripts/tbo-hotel-rsp-probe.ts` re-checks this) — the B2C feed
  has to be enabled on TBO's side before the floor can ever apply.

### Voice (ElevenLabs) — two halves that are easy to confuse

| Direction | Trigger | Lib | Route | Table |
|---|---|---|---|---|
| **Outbound** — place a call | `/request-a-call` form | `callback-queue.ts`, `elevenlabs-outbound.ts`, `callback-actions.ts` | `/api/cron/callback-queue` | `callback_queue` (`0006`) |
| **Inbound** — record a call | ElevenLabs post-call webhook | `voice-calls.ts`, `elevenlabs-webhook.ts` | `/api/voice/webhook` | `voice_calls` (`0005`) |

`voice_calls` is the CRM record of calls that **already happened**; `callback_queue` is
the work queue of calls **still to place**. A lead flows queue → dial → webhook, so it
appears in both. Join on `callback_queue.phone` = `voice_calls.lead_phone`.

The form never dials — it parks a row with a `due_at` and returns. The 60s function cap
makes an in-request wait impossible for a ~2 minute callback, and a queue additionally
survives a redeploy between submit and dial. Do not "simplify" it into an inline delay.
Because Hobby cannot run per-minute cron, `/api/cron/callback-queue` is deliberately
**not** in `vercel.json`; an external pinger calls it with `Authorization: Bearer
$CRON_SECRET`, the same secret `/api/cron/reconcile` uses.

Double-dialling is prevented structurally, not by convention: a partial unique index
allows one outstanding callback per number, and the dispatcher claims rows
compare-and-swap style so overlapping drains cannot both take a lead.

`ELEVENLABS_AGENT_ID` serves both halves — it selects the agent to dial with, and
filters the workspace-wide webhook down to our agent's events. **It has no default
anywhere, on purpose.** A stale hardcoded id previously broke outbound (`Document with
id … not found`) *and* silently made the webhook drop every real event as
`other-agent` while returning 200. Read the current id from ElevenLabs; never trust a
checked-in one.

#### Telephony sits outside this repo

Nothing here configures the phone network. The code sends only `agent_id`,
`agent_phone_number_id` and `to_number`; ElevenLabs resolves the SIP trunk from the
phone number id at call time. So **changing trunk settings needs no redeploy**, and no
code change can fix a telephony fault.

The trunk is Vobiz. Two separate trunks live in that account and their SIP domains are
easy to confuse, because each is the trunk's own uuid prefix:

| Trunk | SIP domain | Credential |
|---|---|---|
| Rise-Shine | `f5151e00.sip.vobiz.ai` | `rise-shine` |
| Sarthak-Singapore | `81804573.sip.vobiz.ai` | `sarthakmiracle` |

Pointing ElevenLabs at the wrong one authenticates a valid username against a trunk
that has never heard of it, producing an endless `407 Proxy Authentication Required`
loop and a conversation that fails with `max auth retry attempts reached for SIP
invite` — zero duration, zero credits, no SIP Call SID. That exact misconfiguration
cost a day on 2026-08-04. Full diagnosis in `platform_docs/elevenlabs.md`.

### Payments (`src/lib/razorpay.ts` + `/api/payment/*`)

Project owners confirm that **payments are not implemented**. The repository contains
a Razorpay-shaped prototype: order creation, signature helpers, capture checks,
refund branches, a webhook, and ledger migrations. Treat these as dummy/dormant code,
not as evidence that checkout has been integrated or validated end to end.

With Razorpay keys absent, `/api/payment/order` returns `503` and the client deliberately
falls back to `/api/book` without a payment. Therefore the current usable path can book
against TBO staging/agency credit without charging a customer. Do not add Razorpay keys
or enable this scaffold without explicit owner approval, sandbox testing, failure-path
testing, webhook verification, and financial reconciliation sign-off.

### Auth (`src/lib/supabase/` + `src/lib/auth.tsx`)

**Supabase Auth** (email + password). `lib/supabase/client.ts` = browser client
(singleton, anon key), `server.ts` = server client (async `cookies()`, has
`getUser()`). `lib/auth.tsx` wraps the browser client behind the stable
`useAuth()` API (`user`/`ready`/`login`/`signup`/`logout`) so Header/AuthScreen/
AccountView are untouched. `src/proxy.ts` (Next 16's renamed middleware) refreshes
the session and gates `/account`. `app/auth/callback/route.ts` exchanges the
email-confirm/OAuth code. Schema + RLS: `supabase/migrations/0001_init.sql`.

## Rules that will bite you if ignored

- **Never import `tbo*.ts` from a client component.** They read credentials from
  `process.env` and call TBO server-side. Reach them only through `/api/*`.
- **TraceId expires 15 min after Search.** The search cache TTL (10 min) is
  deliberately under that. Don't lengthen it — a stale TraceId fails at Book.
- **Match TBO errors by `ErrorCode`, not message text** (esp. code 6 = invalid
  token → refresh + retry once). This is the checklist's explicit rule.
- **Book/Ticket are NEVER auto-retried.** On timeout, recover via
  `GetBookingDetails` (`recoverFromTimeout`), never re-book — a retry double-charges.
- **Auth is Supabase, but keep `useAuth()`'s shape stable** — consumers depend on
  `{ user:{name,email}, ready, login, signup, logout }`. On the **server**, verify
  with `supabase.auth.getUser()`, never `getSession()`. Client writes must respect
  RLS; only server code with the service-role key may write `bookings`.
- **Next 16 renamed `middleware` → `proxy`.** The file is `src/proxy.ts`, exports
  `proxy()`, runs on the **Node.js** runtime (edge unsupported). Don't recreate a
  `middleware.ts`. Confirm framework conventions in `node_modules/next/dist/docs/`.
- **Enquiry forms** post server-side to the agency's Google Form (`lib/actions.ts`
  + `lib/googleForm.ts`) — that's the lead pipeline. Transactional booking/refund
  email is separate and uses Resend via `lib/email.ts`.

## Conventions

- **TypeScript strict.** Icons via `lucide-react` (no emoji). Classes via `cn()` (`lib/cn.ts`).
- **Business info is single-source in `src/data/site.ts`** (NAP, phones, socials, nav,
  reviews) — consumed by header, footer, contact, and layout JSON-LD.
- **Tour packages** live in `src/data/catalog/` (per-category files → `catalog/index.ts`);
  add/edit tours there. Legacy `.html` tour URLs 301 to catalogue pages via
  `LEGACY_TOUR_REDIRECTS` in `next.config.ts` — keep those in sync when slugs change.
- **Env** (`.env.local`, git-ignored; template in `.env.local.example`):
  Supabase public + service-role keys; TBO flight, hotel static, and hotel booking
  credentials; optional `TBO_PROXY_URL`; dormant Razorpay placeholders; ElevenLabs
  (webhook secret, agent id, plus API key + phone number id for outbound); Resend,
  Google Places, GA4, and `CRON_SECRET`. Use the template as the authoritative list.
  Features degrade without credentials; no secrets in code or commits.
- **`reference/` is git-ignored** and holds live TBO creds/notes — never surface or commit it.

## Verify changes

Use the Node 22 CI baseline (`.github/workflows/ci.yml`). Run `npm test`,
`npx tsc --noEmit`, and `npm run build`; run `npm run lint` too, but CI currently
treats pre-existing lint errors as non-blocking. Vitest discovers `tests/**/*.test.ts`;
current tests cover booking parsing, isolated Razorpay HMAC helpers, TBO validation
rules, and callback-queue phone handling. There are no end-to-end payment tests and no
live-call tests. The production build intentionally succeeds without external-service
credentials.

If a rename leaves `tsc` complaining about a module under `.next/types/`, that is a
stale generated route type, not your code — `rm -rf .next` and re-run.
