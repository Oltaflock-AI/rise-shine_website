# TBO flight ancillaries — what we can sell, and when

**Researched 22 Aug 2026 against live production credentials. Parked, not built.**

Parked by decision on the day, not by a blocker. `riseandshinetravel.in` is live
on Vercel and Cashfree works end to end on it, so this work *could* earn from the
day it ships — the reason to wait is sequencing and cost, not readiness. This file
exists so the research does not have to be redone.

(`riseandshinetravel.com` is a separate matter: still the old 2021 site, still
carrying the company's Microsoft 365 email.)

Reproduce any number below with:

```sh
npx tsx --conditions=react-server scripts/ssr-probe.mts
```

The `--conditions=react-server` flag is required — `src/lib/tbo-fetch.ts` imports
`server-only`, which throws outside a Server Component unless that export
condition resolves it to the empty module.

## What TBO offers before booking

The `SSR` method (Air/search URL, after FareRule + FareQuote) returns the full
catalogue. Live sample, IndiGo 6E 6470 DEL→NMI:

| Family | Options | Free | Paid |
|---|---|---|---|
| `SeatDynamic` | 233 | 27 | 206 · ₹400–₹1,500 |
| `MealDynamic` | 10 | 1 | 9 · ₹200–₹650 |
| `Baggage` | 11 | 1 | 10 · ₹2,100–₹28,000 |
| `SpecialServices` | 1 | 0 | Priority check-in ₹470 |

Seats arrive as a real map — `RowNo`, `SeatNo`, `SeatType` (window/aisle/middle),
`AvailablityType`, `CraftType: A321-232`. Meals carry airline names, e.g. `VGAN`
"Vegan meal and beverage(veg)".

**GDS is a different response shape, not a smaller one.** Air India 2678 DEL→BOM
returns `Meal` (flat `[{Code, Description}]`, no price) instead of `MealDynamic`,
133 seats (22 free, 111 paid ₹350–₹1,300), and no `Baggage` or `SpecialServices`
array at all. TBO's docs are explicit that non-LCC meal and seat are *indicative*:
"Non LCC airlines do not provide online confirmation for the meal and seat option
selected by the customer."

**SSR must follow FareQuote.** Called straight off Search it answers
`5: Your session (TraceId) is expired` seconds after a successful search — the
itinerary was never opened. The certification logs show the same ordering.

### What we do with it today

`bookFlight()` calls SSR, then `pickFreeBaggage` / `pickFreeMeal` /
`pickFreeSeats` (`src/lib/tbo-validate.ts`). Each takes the first `Price === 0`
row, and seats only when the fare sets `isseatmandatory`. Every paid row above is
fetched and discarded. That is deliberate — free SSRs are a certification
requirement — but it means none of this inventory is sellable today.

## What TBO offers after ticketing

TBO calls it **Air Amendment**: "Air Amendment is to buy baggage, meal or seat
after Ticket is created." Two calls, both on the **Air/search URL**:

1. `SSR` with a **`BookingId`** — not TraceId/ResultIndex — returns what can still
   be bought for that booking.
2. `TicketReIssue` with `TraceId`, `BookingId` and an `SSR[]` array of
   `{ PaxId, Baggage[] }`.

Verified reachable on our credentials: both answer `2: Invalid BookingId` /
`3: TraceId cannot be null`, i.e. the method exists and validated the field.
**Not verified end to end** — that needs a real ticketed BookingId.

Documented restrictions:

- **LCC only** — IndiGo, SpiceJet, Akasa, Air India Express, AirAsia, Jazeera,
  FlyDubai. Not Air India, not Vistara.
- Baggage, meal and seat only. Special services (priority check-in) excluded.
- Baggage already bought at booking cannot be repurchased through amendment.
- The Booking URL rejects both methods with `This method is not accessible
  through Booking URL`.

### The method surface, measured

TBO answers an unknown method with an IIS 404 page and a real one with HTTP 200
plus its own error object, so the status code alone maps the API.

Exists: `SSR`, `TicketReIssue`, `UpdateSSR`, `GetCancellationCharges`,
`SendChangeRequest`, `GetChangeRequestStatus`, `ReleasePNRRequest`.

Does not exist (404): `AddSSR`, `SSRUpdate`, `BookSSR`, `SeatMap`, `GetSeatMap`,
`UpdateBooking`, `AddOn`, `AncillaryServices`.

`UpdateSSR` also takes a `BookingId` but is absent from TBO's public doc site;
the documented pair is `SSR` + `TicketReIssue`.

## If this is picked up later

The live site already takes real money, so the only question is build cost.
Recommended order was **meals and extra baggage first, seat map second**. Meals
and baggage are a priced list per passenger per segment — two `<Select>`s on the
passenger card. The seat map is aircraft geometry, availability states, per-pax
assignment and a mobile layout for a 6-across cabin: roughly ten times the work
for perhaps twice the revenue.

Three things must be right whichever is built:

- **The ancillary total must go into the Cashfree `bind` hash.** It currently
  covers the itinerary only. Add priced SSRs without touching it and a customer
  can pay a fare-only order and present it against fare + seats + meals.
- **Charge exactly what TBO tickets.** TBO adds the SSR price to the fare at
  Ticket; if the Cashfree order and the Ticket request disagree, the ledger will
  not reconcile.
- **Ask TBO whether selling SSRs needs a re-certification pass.** Flights were
  certified on 4 Aug 2026 against a free-SSR-only flow, and this changes the
  shape of the Ticket request.

Refunds need no change — the auto-refund path refunds the *payment* amount, which
already includes any ancillary charge.

## Known landmine

`pickFreeMeal(SSR.MealDynamic ?? SSR.Meal)` cannot read the GDS shape.
`MealDynamic` is `[segment][option]`; the GDS `Meal` is a flat
`[{Code, Description}]`, so the inner `Array.isArray(seg)` check fails and the
function returns `[]`. Harmless today — GDS meals are indicative and no GDS fare
sets `ismealmandatory` — but it silently selects nothing if that ever changes.
