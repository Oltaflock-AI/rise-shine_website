# Runbook — when a customer's money and their ticket disagree

**Audience:** whoever gets the page. Written so agency staff can follow it on
the phone with Khush. Written 12-Sep-2026.

The site is built so that money is never *lost*, only *stuck*: every rupee is
either a ticket, a refund, or one of the rows below waiting for a person. This
page is what that person does. **Nothing here is "try booking again".**

## The one rule

**Never re-run Book/Ticket by hand for an order that already paid.** TBO may
have ticketed the first attempt even when it answered with a timeout. A second
Book issues a second ticket for the same money. Every step below starts with
*look at TBO first*.

## Where to look

| Question | Where |
|---|---|
| What state is the order in? | Supabase → `booking_intents`, filter `order_id` (in the alert) |
| Did Cashfree take the money? | Cashfree dashboard → Orders → order id. `PAID` = yes. |
| Did TBO issue a ticket? | TBO agency portal (agency 63641 flights / 58394 hotels) → search by PNR or client reference; or `GetBookingDetails` by `BookingId` |
| What did the site already do? | Vercel → Logs → search the order id. Every step logs it. |
| Who is the customer? | admin.riseandshinetravel.com → Customers, or the `email` in the alert |

`booking_intents.status` meanings:

| status | means | who acts |
|---|---|---|
| `awaiting_payment` | order opened, not paid | nobody — cron expires it at 16 min |
| `paid` | money in, ticket not started | cron tickets it within 12 min of Search, else refunds |
| `ticketing` | site is inside Book/Ticket now | wait; cron escalates if >8 min |
| `ticketed` | done, ticket sent | nobody |
| `refunded` | done, money sent back | nobody |
| `refund_failed` | money in, no ticket, refund REJECTED | **you — Section A** |
| `escalated` | site could not tell what TBO did | **you — Section B** |
| `expired` | never paid | nobody |

## Section A — `URGENT: … refund FAILED — settle manually`

Money captured, no ticket, and Cashfree refused the automatic refund.

1. Cashfree dashboard → order → check there is no refund already in
   `PENDING`/`SUCCESS`. If there is, it succeeded after the alert — stop, mark
   the intent `refunded` in Supabase, mail the customer.
2. Check TBO for the PNR anyway (client reference = order id). If a ticket
   exists, **do not refund** — send the customer the ticket instead
   (Section B step 4).
3. No ticket → refund by hand in Cashfree → Refunds → amount = the
   **payment** amount in the alert (not the order amount; offers can make them
   differ, and Cashfree rejects a refund above the payment).
4. If Cashfree still refuses: Cashfree support with the order id. Common
   causes: settlement already paid out to the bank (refund from balance),
   or a UPI payment older than the refund window.
5. Update `booking_intents` → `status = refunded`, `last_error` = what you did.
6. Email the customer from info@ — the template is in `lib/email.ts`
   (`refundNoticeEmail`); plain text is fine.

## Section B — `URGENT: … checkout needs a human` / `flight timeout NOT recovered`

Site claimed the row, called TBO, and after 4–8 minutes still cannot say
whether a ticket exists. Money is captured.

1. **Wait 5 more minutes.** TBO's queue clears; most of these resolve.
2. TBO portal → search by client reference (= `order_id`) or the passenger
   name + date. Alternatively `GetBookingDetails` with the `BookingId`/`PNR`
   in the alert if one was captured.
3. Three outcomes:
   - **Ticketed (status Ticketed/Confirmed, TicketNumber present)** → the
     customer has a ticket and no email. Go to step 4.
   - **Booked but not ticketed (non-LCC: PNR exists, no ticket)** → call TBO
     ops (`ops@tbo.com`, or the agency's account manager) to ticket or release
     the PNR. Do not call Ticket from our side by hand.
   - **Nothing at TBO** → no ticket was issued. Refund in Cashfree (Section A
     step 3), mark `refunded`, mail the customer.
4. Ticket exists → mail the customer the PNR + ticket number, and write the
   booking into `bookings` (admin dashboard has no write surface; do it in
   Supabase from the intent's `request` + TBO's response). Mark the intent
   `ticketed`.
5. Write one line in the intent's `last_error` saying what you found. The
   next person reading the row needs it.

## Section C — `DOWN: Captured payments with no booking` (`ledger_orphans`)

A row in `payments` is `captured` for over an hour and no `bookings` row
carries its `cf_payment_id`. Since 12-Sep-2026 this only fires when that is
literally true — a database timeout fires `supabase_rest` instead.

1. `booking_intents` for the same `order_id`. Almost always the row is
   `refunded` or `escalated` and Section A/B already applies.
2. No intent row at all → the order predates migration 0017, or the write
   failed. Treat as Section B from step 2.

## Section D — everything else red

| check | means | do |
|---|---|---|
| `tbo_proxy` | VPS 64.227.157.194 unreachable | DigitalOcean console → droplet power/billing. Then `platform_docs/tbo-proxy-managed-fallback.md` if it is not back in 1 h. |
| `tbo_search` red, `tbo_proxy` green | TBO down or IP de-whitelisted | Check the TBO portal by hand. If the portal works, mail `apiintegrationteam@tbo.com` with the IP. |
| `tbo_quote` | FareQuote failing | Same as above; usually TBO. |
| `cashfree_auth` | keys rejected | Cashfree dashboard → API keys. Rotated keys must go into Vercel env + redeploy. |
| `supabase_rest` / `supabase_auth` | database slow or down | Supabase dashboard → project → Restart. If it repeats: compute add-on (Micro). Site refuses new orders while this is red, money is not at risk. |
| `callback_queue` | leads not being called | Vercel → Crons → `callback-queue` running? `ELEVENLABS_*` env present? |
| `email_auth` | Resend key dead | Resend dashboard. **Every alert after this one is Sentry-only** until fixed. |
| `config` | an env var vanished | Vercel → Settings → Environment Variables. The alert names it. |

## Stopping the bleeding

`BOOKING_PAUSED=flights` (or `hotels`, `all`) in Vercel env + redeploy stops
new orders in ~2 minutes and puts a "call us" strip on the site. Search still
works. Use it the moment two customers hit the same fault. Orders already open
are refunded by the settle cron.

## What is NOT a false alert

- Every non-money check needs **two consecutive failing runs** (10 min)
  before it mails. A single blip is stored as `suspect` in `ops_health` and
  never mentioned. So a `DOWN:` mail means it was broken for two probes.
- Money checks (`ledger_orphans`) alert on the first run — they are already
  windowed by an hour.
- `Recovered:` mails are email-only; they never reach Sentry.

## Alert routing (what pages vs. what mails)

Every alert mails `ALERT_EMAIL` and reaches Sentry with a `tier` tag
(`lib/alert-tier.ts`, pinned by `tests/alert-tier.test.ts`):

- `tier:page` — Sections A, B, C. Sentry rule should send SMS/phone.
- `tier:alert` — Section D. Email/Slack.
- `tier:info` — recoveries, auto-refunds that settled. Nothing.

Sentry rule setup (one-time, dashboard): Alerts → Create → Issues →
"tags.tier equals page" → action: notify via SMS integration / PagerDuty free
tier / the Sentry mobile app push. Sentry's own email is a fourth channel and
should stay on for `tier:alert`.

## After every incident

- One paragraph in this file's history section below: date, order id, what
  TBO had, what you did. Twenty of these are worth more than any monitor.
- If a step here was wrong or missing, fix the step.

## History

- 12-Sep-2026 — five overnight `ledger_orphans` pages were database timeouts,
  not orphans. No money involved. Fixed by giving read failures their own
  check (`supabase_rest`). Supabase project restarted; Micro compute if it
  repeats.
