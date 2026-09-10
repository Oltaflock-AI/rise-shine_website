-- Booking intents — the durable record of a checkout between "order opened"
-- and "ticket issued or money returned".
--
-- Before this, the passenger payload for a paid order lived ONLY in the
-- customer's browser tab. If that tab closed after Cashfree captured the money
-- and before /api/book answered — a phone dying, a network drop, a customer
-- closing the popup — nothing on the server could finish the ticket or give the
-- money back. The hourly ledger-orphan alert would eventually tell a human, and
-- the human would refund by hand. A second "please try again" click, meanwhile,
-- re-ran Book with the same paid order and could ticket twice.
--
-- One row per Cashfree order, written by /api/payment/order with the parsed
-- booking request, claimed compare-and-swap by /api/book (so two submits of the
-- same order cannot both ticket), and swept by /api/cron/settle-intents, which
-- completes a paid-but-unclaimed booking while its TraceId still lives and
-- refunds it once it does not.
--
-- Service-role only. `request` holds passport and PAN fields; the cron blanks it
-- once a row is settled and old enough that nothing can still need it.

create table if not exists public.booking_intents (
  -- Our Cashfree order id (rsf… / rsh…). One order, one intent.
  order_id        text primary key,
  kind            text not null check (kind in ('flight', 'hotel')),
  -- The itinerary hash the order was tagged with (flightBind / hotelBind).
  bind            text not null,
  user_id         uuid references auth.users (id) on delete set null,
  amount_inr      numeric(12, 2) not null,
  email           text,
  -- awaiting_payment → paid → ticketing → ticketed
  --                                    ↘ refunded | refund_failed
  --                  ↘ expired (never paid)
  status          text not null default 'awaiting_payment',
  -- The parsed booking request, enough to run the booking flow without a browser.
  request         jsonb not null,
  -- The final BookingResult, so a repeated /api/book for the same order can
  -- answer with what already happened instead of booking again.
  result          jsonb,
  cf_payment_id   text,
  -- When the webhook (or a re-read) proved the money moved.
  paid_at         timestamptz,
  -- When a worker took the row into 'ticketing'. A claim far older than the
  -- booking function's own limit means that worker died mid-flight.
  claimed_at      timestamptz,
  claimed_by      text,
  attempts        integer not null default 0,
  settled_at      timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists booking_intents_status_idx
  on public.booking_intents (status, created_at);

alter table public.booking_intents enable row level security;
-- No policies on purpose: the service role bypasses RLS, everyone else is denied.

comment on table public.booking_intents is
  'Checkout state between Cashfree order and ticket. Service-role only; drives idempotent /api/book and the settle cron.';
