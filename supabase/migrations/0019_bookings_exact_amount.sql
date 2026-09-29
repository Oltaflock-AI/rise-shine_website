-- The amount actually paid, to the paisa.
--
-- `amount_paid_inr` and `fare_inr` are INTEGER (0001/0002), and the hotel book
-- route rounded before writing, so "My bookings" showed ₹35,718 for a TotalFare
-- of 35,718.26. TBO's portal rule is exact fares, unrounded, everywhere. A new
-- column rather than a type change: 0018's customer_directory view reads the
-- integer columns, and Postgres refuses to retype a column a view depends on.
--
-- Backfilled from booking_intents, which has held the exact order amount
-- (numeric(12,2)) since 0017. Rows older than that stay NULL and the page falls
-- back to the integer columns.

alter table public.bookings
  add column if not exists amount_paid numeric(12, 2);

update public.bookings b
   set amount_paid = i.amount_inr
  from public.booking_intents i
 where i.order_id = b.cf_order_id
   and b.amount_paid is null;
