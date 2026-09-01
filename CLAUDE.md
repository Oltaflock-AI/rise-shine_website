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
  voice-call-log (`0005`), callback-queue (`0006`), Cashfree column rename
  (`0007`) and saved traveller/address details (`0008`) schema. TBO remains canonical;
  Supabase is an account-facing mirror.
- **`voice-agent/`** — separate Next.js 15 app: a dashboard over the ElevenLabs
  conversation API. Its own package manifest; run it from that directory. It is
  excluded from this project's deploy by `.vercelignore`, so it never ships with
  the website; it deploys as its **own Vercel project at
  admin.riseandshinetravel.in**. The call data is read-only — the submit form,
  WhatsApp preview and outbound-call route were removed, and placing calls now
  belongs to `/request-a-call` (see **Voice** below). It also reads
  `callback_queue` (`/queue`) and `voice_calls` (CRM panel on leads) with the
  service-role key. Its one write surface is `/access`, the team list
  (`lib/access.ts` · `access-store.ts` → `dashboard_users` table, migration
  `0014` · `session.ts`). Sign-in is the dashboard's OWN
  (`lib/dashboard-auth.ts`): scrypt passwords, server-side sessions
  (`dashboard_sessions`), an attempt log (`dashboard_login_events`), 5-strike
  15-min lockout — deliberately NOT Supabase Auth, whose users are the site's
  customers. `DASHBOARD_AUTH_ENABLED=true` turns the gate on (unset locally =
  simulated admin, banner says so). Do not add a header- or query-supplied
  email to `emailFromSession()` — that is an impersonation hole wearing a
  login's clothes.

### The TBO booking layer (`src/lib/`) — server only

| File | Responsibility |
|------|----------------|
| `tbo.ts` | Auth token cache + **Search**; normalizes raw TBO results → `FlightOffer` (per-adult fares, de-dupe, cheapest-first). 10-min result cache. |
| `tbo-book.ts` | Booking flow: FareRule → FareQuote → SSR → **Book/Ticket** → GetBookingDetails. LCC = Ticket-only; non-LCC = Book→Ticket. |
| `tbo-validate.ts` | The whole TBO certification checklist: PAN/passport/GST, title normalization, special-fare seat+meal, duplicate guard, per-pax fare split. |
| `cashfree.ts` | Cashfree PG (server): Create Order, `confirmPaidOrder()` (the paid-and-bound gate), refunds, webhook HMAC. Wired but **not yet live** — needs keys + owner sign-off. |
| `booking-request.ts` | Parse/normalize an incoming booking body → `BookingRequest` (title normalization, casing). Shared by `/api/payment/order` and `/api/book`. |
| `payments-ledger.ts` | Reconciliation ledger writer — upserts the `payments` table from the webhook (service-role). |

API handlers are thin: `GET /api/flights` (search), `POST /api/quote` (FareQuote →
which fields the form needs), and `POST /api/book` (booking). The payment routes
(`/api/payment/order` and `/api/payment/webhook`) are a complete Cashfree integration
but stay inert until the keys are set — see **Payments** below. All are
`runtime = "nodejs"`, `dynamic =
"force-dynamic"`; book declares `maxDuration = 300`, order `120`.

**Those durations are aspirational.** The Vercel project is on the **Hobby** plan,
which caps every function at **60 seconds** regardless of a higher `maxDuration`, and
will not run Vercel Cron more often than daily. Assume 60s when reasoning about any
timeout, and drive sub-daily schedules from an external pinger (see **Voice**).

### Hotels

Hotel search joins TBO's static city/hotel catalogue (`tbo-hotel-static.ts`) with
live room pricing (`tbo-hotel.ts`). Checkout runs **PreBook** to re-price and discover
PAN/passport requirements, then calls the booking flow. The hotel Cashfree order,
verification, and refund path mirrors the flight one and is live-ready but keyless.
Post-booking detail, voucher, and cancellation calls live in `tbo-hotel-post.ts`.
Never retry Hotel Book after a timeout; recover by client reference.

**The static-IP proxy truncates large responses.** `TBO_PROXY_URL` drops the
socket part-way through anything much over ~1 MB. `HotelDetails` returns ~21 kB
per hotel, so asking for a whole result page in one call was a 3–4 MB response
that failed **5 times in 12** through the proxy and 0 in 12 without it — and
because `hotelInfoBatch` swallowed the error, ~40% of hotel searches rendered
with no photos at all and nothing in the logs. It now chunks at
`INFO_CHUNK = 25` (~500 kB), retries each chunk once, and **logs** a chunk that
still fails. Keep the chunk small and keep the log; a silent catch here hid this
for weeks. Per-room content (`hotelInfoWithRooms`) is single-hotel only for the
same reason — `RoomDetails` alone is 0.63 MB on a large hotel.

**TBO's photo URLs have a doubled slash** — `https://www.tboholidays.com//imageresource.aspx?img=…`
Next's dev optimizer accepts that; **Vercel's returns `400
INVALID_IMAGE_OPTIMIZE_REQUEST`** for every one, so photos render locally and
are blank in production even when the markup is right. `normaliseImageUrl`
collapses runs of slashes in the PATH only: the scheme's `//` and the query are
left alone, because the `img=` token is base64 containing `/` and `+` and stops
resolving if re-encoded. Checking that photo URLs appear in the HTML does NOT
prove they render — fetch the `/_next/image?url=…` and look at the status.

**The hotel content feed needs curating, not printing.** Three helpers do it,
all pure and tested: `hotel-amenities.ts` (651 distinct facility strings per
city, one pool arriving four ways, a third of it pandemic boilerplate → iconed
categories), `hotel-description.ts` (the description is HTML whose `<strong>`
runs are real section headings — parse them, never `dangerouslySetInnerHTML`),
and `hotel-cancellation.ts`. Cards lead with TBO's own `Image` (singular), NOT
`Images[0]` — the array is upload-ordered and often opens on a corridor. `Map`
and `Attractions` drive the location panel.

**Cancellation rows are WINDOWS, not dates.** Each `CancelPolicies` row opens a
window that runs until the next row's date. Printing the rows verbatim showed a
guest checking in on the 23rd "From 21-08-26: No charge" — a free window that
had already closed, i.e. a refund promise the site could not keep. Always go
through `cancellationWindows()`, which pairs each row with its end, drops the
lapsed ones and marks the one containing now.

**The HotelBE post-booking family needs the HOTEL agency's token, not the flight one.**
`GetBookingDetail` / `GenerateVoucher` / `SendChangeRequest` used to borrow
`getAuthToken()` from `lib/tbo.ts`. That was right until 11-Aug-2026, when the flight
credentials moved to production: from then on we minted a LIVE token (agency 63641) and
presented it to the CERTIFICATION HotelBE, which owns our hotel bookings (agency 58394).
It answers `ErrorCode 6 · "Invalid Token"` — and the retry-on-6 re-authenticates with the
same live credentials, so it fails twice and gives up. The whole post-booking family was
dead for three weeks, which is why TBO could not verify the voucher, the 120-second
BookingDetail re-read, or cancellation. `tbo-hotel-post.ts` now authenticates with
`TBO_HOTEL_BE_*` (certification: `Sharedapi.tektravels.com`, ClientId `ApiIntegrationNew`,
the `TBO_HOTEL_*` login), falling back to the flight token when unset. **Whenever the two
stacks are on different agencies, they need different tokens** — the shared helper's name
makes that easy to miss.

**SendChangeRequest is not slow.** The 180-second 504s logged in August were that auth
fault wearing a timeout's clothes. With the right token it answers in **under a second**
with a `ChangeRequestId`. `ChangeRequestStatus` then sits at `2` (InProgress) for a while —
TBO completes cancellations in their back office, so the booking flips to `Cancelled` later.
Don't read InProgress as a failure. `scripts/cancel-cert-run.mts` runs the whole flow and
writes a masked log; `scripts/cancel-status-check.mts` re-reads one.

**Two PreBook nodes do not sit where they read like they should.** `RateConditions`
is on `HotelResult[0]` and `ValidationInfo` is on the RESPONSE ROOT — neither is on
`Rooms[0]`, where both were being read. Because the reads were optional-chained they
returned empty rather than throwing, so for weeks the room and book pages told the
guest "no additional rate conditions for this rate" while TBO's own log showed ten,
and `panMandatory` / `passportMandatory` / `paxName*Length` all silently fell back to
defaults. Verified live on hotel 1012683 (2026-09-01); `scripts/rate-conditions-probe.mts`
re-checks both levels. Room-level reads are kept as fallbacks.

**`RateConditions` rows are entity-escaped supplier HTML.** A row arrives as
`CheckIn Instructions: &lt;ul&gt;&lt;li&gt;…` — printed as text the guest reads the
escapes. `hotel-rate-conditions.ts` unescapes, splits on the list/paragraph tags and
strips the rest to plain text (never `dangerouslySetInnerHTML`), grouping each row
under its own heading. It deliberately does NOT re-cut a comma-joined run: splitting
on commas turned "a credit card, debit card, or cash deposit may be required" into
three separate promises, and a rate condition is a contract term.

**A rate's `ValidationInfo` may NARROW the name-length range but never widen it.**
TBO's API rule is 2–25 per field; a rate answers 1–50. `validateHotelPax` takes the
tighter of the two, so nothing we accept is something Book rejects. Passport details
ride ONLY when `PassportMandatory` is true — TBO's log review flagged us for sending
them otherwise.

**TBO returns no per-room photographs.** `RoomDetails[].imageURL` is in the
schema and empty on every room of every hotel on our account (6,879 rooms across
23 hotels, three cities, checked 2026-08-22). The room list shows `RoomSize` and
`RoomDescription` instead, matched to each live rate by name — see
`src/lib/hotel-room-match.ts`, which joins on **coverage of the catalogue name**,
not symmetric similarity, because a rate name carries promotions the catalogue
never mentions. Don't build anything that assumes a room photo exists.

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

### Flight ancillaries (seats · meals · extra baggage)

TBO exposes a full paid catalogue — a live IndiGo domestic leg returns 233 seats
(206 paid, ₹400–₹1,500), 9 paid meals and 10 paid bag options — and `bookFlight()`
deliberately discards all of it: `pickFree*` takes only the ₹0 row, because free
SSRs are a certification requirement and paid ones are not wired to the payment
amount. Selling any of it means putting the ancillary total into the Cashfree
`bind` hash, which today covers the itinerary only.

Post-ticket add-ons exist too (TBO's "Air Amendment": `SSR` with a `BookingId`,
then `TicketReIssue`), LCC-only. Researched and **parked** on 2026-08-22 —
findings, live numbers and the re-run script are in
`platform_docs/tbo-flight-ancillaries.md` (`scripts/ssr-probe.mts`).

### Fields TBO sends that the pages now use

`scripts/unused-fields-probe.mts` diffs every raw response against the code and
lists what we receive and never read. Re-run it after any TBO version bump.

Where things live matters and is not obvious:

| Field | Lives on | Used for |
|---|---|---|
| `FareClassification` | flight **result** | fare badge, with TBO's own colour as a tint |
| `NoOfSeatAvailable` | flight **segment**, not the result | "3 seats left" — the tightest leg wins |
| `SmartChoiceRanking` · `NonStopFirstRanking` | result | the "Recommended" sort |
| `Craft` · `AirportName` · `StopPoint` | segment | aircraft type, airport names, technical stops |
| `HotelFees` | HotelDetails | "Charges at the hotel" |
| `WithTransfers` · `PackageFare` | hotel **room** | rate chips |

**Never display the agency's economics.** `CommissionEarned`, `IncentiveEarned`,
`PLBEarned`, `TdsOn*`, `ChargeBU`, `PGCharge`, `AgentCommission`, `NetTax` all
arrive on live responses and belong in the same locked drawer as `NetAmount`.

**`SmartChoiceRanking` is not price-ordered.** On a live 472-result DEL-BOM
search its top pick was ₹760 above the cheapest non-stop of the same duration,
so it is its own sort option, never folded into our "Best". Both rankings are
dense 1..N, 1 = best.

**TBO's place names are part current, part historical.** Its hotel city list
says "Mumbai/Bombay, Maharashtra" and its flight responses call CCU "Calcutta"
while calling the city Kolkata. Display names go through
`displayPlaceName` / `displayAirportName` (`lib/place-names.ts`); codes and
anything sent BACK to TBO keep TBO's own strings, and search still matches the
raw name so "Bombay" finds Mumbai.

### Multi-city flights — supported by TBO, not built here

TBO's `JourneyType 3` accepts N `Segments` and returns a **single through-fare
covering every leg** (one `ResultIndex`, one `Fare`, `Segments` holding one group
per leg). Verified live on our own credentials 2026-08-22 — 3-leg domestic,
open-jaw and international all return results; the same legs sent as
`JourneyType 1` fail with `Invalid segment length.`, so the field is doing the
work. `JourneyType 4` (AdvanceSearch) is **not** enabled for us.

Parked, not shipped, because `rawSearch` builds at most 2 segments and both
`mapResult` and `quoteDetails` read `Segments[0]` only — enabling the search
without widening those would show leg 1 while charging the whole itinerary.
Findings, the shape and the build scope: `platform_docs/tbo-multicity.md`
(`scripts/multicity-probe.mts`).

### Payments — Cashfree (`src/lib/cashfree.ts` + `/api/payment/*`)

**Cashfree Payments (PG)** is the only gateway. Production keys are set in Vercel
(`CASHFREE_APP_ID` + `CASHFREE_SECRET_KEY` + `CASHFREE_ENV=production`, 18 Aug 2026),
but they are inert until this code is deployed. Local runs on sandbox keys. Before real
customers: sandbox end-to-end, failure-path and abandoned-popup testing, webhook payload
version set in the dashboard, domain whitelisted, and reconciliation sign-off.

Four things bite anyone who assumes a conventional gateway shape:

- **The browser gets no signed receipt.** `cashfree.checkout()` resolves with
  `paymentDetails`, but it is unsigned client data and proves nothing. The ONLY
  confirmation is the server re-reading the order — `confirmPaidOrder()` does Get Order
  (+ Get Payments) and requires `order_status === "PAID"`. Never gate on the client.
- **Amounts are rupees with 2 dp, not paise.** No ×100 anywhere.
- **We mint `order_id`** (`newOrderId()`, unique per Create Order), and **refunds are
  per order** (`POST /orders/{order_id}/refunds`), not per payment id.
- **Orders carry a `bind` tag** — a hash of the itinerary (`flightBind`/`hotelBind`).
  The book routes recompute it and refuse an order paid for something else. Without
  it, a customer could pay ₹1 on one order and present it against any booking.

The browser loads `sdk.cashfree.com/js/v3/cashfree.js` via `lib/cashfree-checkout.ts`
(our own types — the npm SDK ships none) and opens a `_modal` popup on the
`payment_session_id`. There is **no publishable key**; nothing secret reaches the client.

After checkout resolves the client always calls the book route, **even on
`result.error`** — a customer who pays and then closes the popup must still get their
ticket rather than a "cancelled" message and a silent charge.

The REST API is pinned to **`2026-01-01`** (`CASHFREE_API_VERSION` overrides). Webhook
payloads are versioned **separately**, per endpoint in the dashboard — set that to
`2026-01-01` too. On this version `payment_amount` can be less than `order_amount`
(offers, surcharge), so `confirmPaidOrder()` returns the **payment** amount: that is
what gets refunded, mirrored and emailed. Cashfree rejects a refund above the
transaction amount, so the order total is the wrong number everywhere downstream.

Webhooks (`/api/payment/webhook`) are signed
`base64(HMAC-SHA256(x-webhook-timestamp + RAW body))` with the **API secret** — there
is no separate webhook secret. Read `req.text()`; re-serializing rewrites `170.00` →
`170` and every signature fails. Events: `PAYMENT_SUCCESS_WEBHOOK`,
`PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`, `REFUND_STATUS_WEBHOOK`.

With no keys, `/api/payment/order` returns `503` and flights refuse to book (there is
no unpaid flight path). Hotels still fall back to an unpaid Book, but **only** on TBO's
certification hosts — `src/lib/tbo-env.ts` fails closed against live hosts.

`cashfreeConfigured` is one GLOBAL flag, and that bit TBO's portal verifier: the live
FLIGHT keys (18-Aug-2026) put a real payment page in front of hotel bookings that are
still on the certification host, stalling every Book-side checkpoint behind it.
`src/lib/tbo-verification.ts` + `/api/hotels/verification?token=…` opens a cookie-scoped
no-payment session for them. It is inert unless `TBO_VERIFICATION_TOKEN` is set AND
`tboHotelIsLive()` is false, so it can never give away a live room, and flights never
consult it. **Delete the env var once hotel certification is signed off.**

**`cashfreeConfigured` vs `cashfreePaymentsLive` — do not swap these.** The first means
"keys present, so run the payment gate"; the second means "the money is real"
(configured *and* `CASHFREE_ENV=production`). The live-host guards in `tbo-env.ts` take
the **second**. Sandbox keys satisfy the first, and sandbox keys against live TBO would
issue a real ticket — or hold a real hotel room — for play money. The two identifiers
are one word apart at the call site and swapping them fails silently, so
`tests/tbo-env.test.ts` pins the distinction.

Ledger columns are `cf_*`. `supabase/migrations/0007_cashfree.sql` renames the legacy
ones that migrations `0002`/`0003` created; run it before enabling the webhook.

Cashfree's **Secure ID / VRS** APIs (PAN, GSTIN, bank verification) are a *separate
product* with separate credentials — nothing here uses them.

### Auth (`src/lib/supabase/` + `src/lib/auth.tsx`)

**Supabase Auth** (email + password). `lib/supabase/client.ts` = browser client
(singleton, anon key), `server.ts` = server client (async `cookies()`, has
`getUser()`). `lib/auth.tsx` wraps the browser client behind the stable
`useAuth()` API (`user`/`ready`/`login`/`signup`/`logout`) so Header/AuthScreen/
AccountView are untouched. `src/proxy.ts` (Next 16's renamed middleware) refreshes
the session and gates `/account`. `app/auth/callback/route.ts` exchanges the
email-confirm/OAuth code. Schema + RLS: `supabase/migrations/0001_init.sql`.

### Saved details (repeat bookings)

`travellers` + `saved_addresses` (`0008`) are PREFILL CONVENIENCES, nothing more.
They are written server-side **only after a confirmed ticket**
(`lib/travel-profile.ts`, called from `/api/book` beside `saveBookingHistory`) and read
in the browser under RLS (`lib/saved-details.ts`) to drive the checkout pickers. A
customer editing or deleting a saved row must never touch `bookings`/`passengers` —
that is the record of who actually flew, and TBO stays canonical above it.

The structured address travels as the payload's own `billing` block, NOT inside the
TBO request: TBO's Passenger object has no state or PIN field, so the form folds those
into `AddressLine2`. Parsing that string back out is guesswork, hence the side channel.
`parseBookingRequest` ignores `billing` on purpose — nothing about ticketing depends
on it.

Names are always an explicit pick; only the most recent address auto-applies. A
wrong auto-filled name is a wasted ticket, a wrong address is a corrected field.

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
- **Baggage and fare rules are contract terms, not decoration.** The allowance shown
  for an itinerary is the WEAKEST leg (`weakestAllowance`), a blank allowance reads
  "check with airline" rather than 0, and `MiniFareRules` rows render verbatim. TBO
  reports baggage on `Segments[].Baggage` for some suppliers and only in
  `FareBreakdown[].SegmentDetails[]` for others — read both. Checkout re-reads all of
  it from the confirmed FareQuote, never from the search card.
- **`FareRuleDetail` is third-party HTML.** It reaches the browser only through
  `sanitizeFareRuleHtml` (`lib/fare-rules.ts`, allowlist — tags in, all attributes out
  bar table spans). Never render it raw, never swap in a blocklist.
- **Enquiry forms** deliver through `lib/lead-delivery.ts`, never by calling the
  Google Form directly. It posts server-side to the agency's Google Form
  (`lib/googleForm.ts`) — the lead pipeline — and falls back to emailing
  `ALERT_EMAIL` when that fails. The fallback is not defensive padding: the form
  is the agency's, not ours, and on 01-Sep-2026 its "Collect email addresses"
  setting was switched to **Verified**, which makes `formResponse` demand a
  signed-in Google session. Every server POST answered `401` and `GET`
  redirected to `accounts.google.com/ServiceLogin`, so /contact and
  /plan-my-trip refused every enquiry and the /request-a-call mirror went
  silently missing. A same-host `3xx` from Google is a success; a redirect to
  `accounts.google.com` is the sign-in wall and must count as a failure.
  Transactional booking/refund email is separate and uses Resend via
  `lib/email.ts`.

## Conventions

- **TypeScript strict.** Icons via `lucide-react` (no emoji). Classes via `cn()` (`lib/cn.ts`).
- **Buttons and form controls are shared, not hand-rolled.** Every CTA is
  `ui/Button.tsx` (`primary` · `navy` · `ghost` · `light` · `danger`, `sm`/`md`);
  `buttonClass()` is there for the rare host that must own the element. Every
  input, select and date field is `ui/form-controls.tsx` — `controlClass`,
  `<Select>`, `<DateField>`, `controlLabelClass` — re-exported from
  `forms/controls.tsx` so the enquiry forms and the checkouts cannot drift.
  `<Select>` keeps the native element (correct picker on every phone, free
  keyboard support) and only swaps the OS chevron for a lucide one; `<DateField>`
  overlays an invisible `<input type="date">` on DD-MM-YY text, because a native
  date renders in the browser's locale and would break the site-wide date rule.
  Don't re-style a bare `<select>`/`<input>` inline — reach for these.
- **Search dates default to TOMORROW**, and the return/check-out default hangs
  off the departure the traveller picked, never off today — a return prefilled
  from today lands *before* an outbound that came in on the URL. Server-side,
  `defaultDates()` measures "tomorrow" in `Asia/Kolkata` (`todayInIndiaISO`),
  because Vercel runs UTC 5h30m behind India and a naive `new Date()` + 1 day
  resolves to today in IST for every request between 18:30 and 24:00 UTC.
  `tests/default-dates.test.ts` pins that boundary.
- **Titles are stored upper-case, shown cased.** TBO only accepts `MR`/`MRS`/
  `MS`/`MSTR`, so the `<option>` value stays the code and `TITLE_LABEL` supplies
  the "Mr" the traveller reads. Don't "fix" the display by changing the value.
- **Business info is single-source in `src/data/site.ts`** (NAP, phones, socials, nav,
  reviews) — consumed by header, footer, contact, and layout JSON-LD.
- **Tour packages** live in `src/data/catalog/` (per-category files → `catalog/index.ts`);
  add/edit tours there. Legacy `.html` tour URLs 301 to catalogue pages via
  `LEGACY_TOUR_REDIRECTS` in `next.config.ts` — keep those in sync when slugs change.
- **Env** (`.env.local`, git-ignored; template in `.env.local.example`):
  Supabase public + service-role keys; TBO flight, hotel static, and hotel booking
  credentials; optional `TBO_PROXY_URL`; Cashfree app id/secret/env; ElevenLabs
  (webhook secret, agent id, plus API key + phone number id for outbound); Resend,
  Google Places, GA4, and `CRON_SECRET`. Use the template as the authoritative list.
  Features degrade without credentials; no secrets in code or commits.
- **`reference/` is git-ignored** and holds live TBO creds/notes — never surface or commit it.

## Verify changes

Use the Node 22 CI baseline (`.github/workflows/ci.yml`). Run `npm test`,
`npx tsc --noEmit`, and `npm run build`; run `npm run lint` too, but CI currently
treats pre-existing lint errors as non-blocking. Vitest discovers `tests/**/*.test.ts`;
current tests cover booking parsing, isolated Cashfree webhook HMAC, TBO validation
rules, and callback-queue phone handling. There are no end-to-end payment tests and no
live-call tests. The production build intentionally succeeds without external-service
credentials.

If a rename leaves `tsc` complaining about a module under `.next/types/`, that is a
stale generated route type, not your code — `rm -rf .next` and re-run.
