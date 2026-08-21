# Phase 2 — internal notes (not for Rise & Shine)

Client-facing document: `Rise-and-Shine-Phase-2-Proposal.pdf` (source: `phase-2-whatsapp-email.html`).

## What's priced

The client document is deliberately number-led and short — three pages, mostly diagrams.
The persuasion carriers are: the red 0 / 3 / 15 min / 3 weeks strip, the fill-in-your-own-
figures worksheet (B = 0 follow-ups is the only number we assert), and the red urgency band.
₹65,000 one-time · ₹10,000/month. Half up front, half at go-live. Ex-GST.
Meta's per-message charges are billed to the agency directly — we pass through at cost,
so the retainer is not carrying a variable cost we can't control.

## Why the build fits ₹65k
Phase 1 already paid for the parts that usually make this expensive:
- Resend email pipeline is written and wired into the booking/refund paths (`src/lib/email.ts`)
  — it just needs a key and a verified sending domain.
- Cashfree already sends us `PAYMENT_USER_DROPPED_WEBHOOK`. The abandonment signal arrives
  today and is unused — the recovery engine is built on an event we already receive.
- `callback_queue` (migration 0006) is a working claim-and-dispatch scheduler that cannot
  double-send. Same pattern schedules WhatsApp; the third recovery step just enqueues a callback.
- Supabase already holds accounts, bookings, passengers, payments — segments have real data.

Net new work: WhatsApp Cloud API integration + templates, coupon engine + popup, campaign
console, reporting screen. That is genuinely a 2–3 week build on top of Phase 1.

## Deliberate omissions
- **No performance projections anywhere.** The break-even table is arithmetic only
  (₹10,000 ÷ margin per booking). Do not let anyone add a "recover 15% of abandoned carts"
  line — we have no data and it would poison the relationship at month two.
- Two-way conversational WhatsApp agent is explicitly *not* in this scope. That is Phase 3
  and is where the next fee sits.

## Things to hold firm on in the conversation
- **The discount rule.** A % off air fare can exceed the margin on the ticket. The doc
  recommends a fixed-rupee cap on packages/hotels/service fee. If they insist on % off fare,
  get it in writing that it was their call.
- **The phone number is one-way.** Once 8866010022 goes on the WhatsApp Business Platform it
  cannot be used in the handset app again. Confirm they understand before we submit.
- **Meta verification is the schedule risk**, not our build. Papers must go in on day one, or
  the three weeks becomes four and it looks like our slip.
- WhatsApp is currently hidden across the site (`site.phone.whatsappEnabled === false`)
  because the number isn't registered. Phase 2 is what flips that on properly.

## What the market will actually bear (Aug 2026 read)

Realistic ceiling for a 3-person Ahmedabad agency: **₹90k–₹1.2L one-time + ₹12–15k/month**.
Hard stall point around ₹1.5L one-time.

- ₹1 lakh is the psychological wall for Indian SMB software. Under it the owner signs; over
  it, it becomes a "project" with comparison quotes and a stretched payment schedule.
- Their anchor will be AiSensy / Interakt / Wati — ₹1–5k/month plus ₹15–50k setup from some
  agency. Our whole defence is that no WhatsApp SaaS reseller can send a real PNR, catch a
  real drop-off at the payment page, or validate a coupon at checkout. Say it in the room or
  we get compared to a ₹3,000/month tool.
- **Recommended ask: ₹85,000 one-time + ₹12,000/month**, with ₹65k/₹10k held back as the
  concession. With the loyalty module in scope, ₹65k is still on the cheap side.
- The lever that buys ₹15k/month is bundling Meta's message cost up to a cap. SMBs hate a
  variable bill from a foreign company more than they hate ₹5k extra.
- Do **not** offer revenue share on recovered bookings — three months of attribution
  arguments with people who won't read a dashboard.
- Worth weighing: they're more valuable as a reference case and a resellable template than as
  a maximum-extraction client.

The PDF prints ₹65,000 + ₹10,000 (raised from ₹60k, 21 Aug). Repricing again is a one-line
change in `phase-2-whatsapp-email.html` plus a re-render.

## Negotiation room
₹60k/₹10k is already the floor Khush set. If they push, cut scope rather than price —
drop Module D (campaigns to the existing list) to ₹48k + ₹8k, and sell it back later once
the recovery numbers are visible in their own report. The loyalty module is the other
severable piece — it is the cleanest thing to trade for holding the price.
