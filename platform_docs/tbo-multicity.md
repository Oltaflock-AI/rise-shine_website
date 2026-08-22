# Multi-city flights (TBO `JourneyType 3`) — supported, not built

Verified live against our production credentials on **2026-08-22** with
`scripts/multicity-probe.mts`:

```
npx tsx --conditions=react-server scripts/multicity-probe.mts
```

## What TBO answered

| Search (`JourneyType`, `Segments`) | Response |
|---|---|
| `3` · DEL→BOM→BLR→DEL (3 legs) | `ResponseStatus 1`, 600 results |
| `3` · open-jaw DEL→BOM, BLR→DEL | `ResponseStatus 1`, 585 results |
| `3` · intl BOM→DXB→SIN→BOM | `ResponseStatus 1`, 462 results |
| `1` · same 3 legs (control) | Error 3 · `"Invalid segment length."` |
| `4` (AdvanceSearch) · 3 legs | Error 25 · `No Result Found` — not enabled for us |

The control matters: it proves the JourneyType is what unlocks the extra legs,
rather than TBO silently reading `Segments` and ignoring the field.

## The result shape — this is the part that decides the work

A multi-city result is **one through-fare covering every leg**, not a leg-by-leg
pick:

```
ResultIndex OB1[TBO]rNFWC7YWVovHAzd2hJSnnjqlXWl2c3gX
  IsLCC true · Source 6 · PublishedFare ₹21290 · OfferedFare ₹20207.69
  Segments groups: 3
    leg 0: 6E6218 DEL→BOM 2026-08-30T06:05
    leg 1: 6E5323 BOM→BLR 2026-09-02T01:10
    leg 2: 6E836  BLR→DEL 2026-09-06T05:05
  FareBreakdown rows: 1
```

So it is *simpler* than a round trip at booking time — one `ResultIndex`, one
fare, one Book. There is no outbound/inbound pairing to do.

## Why it is not a flag flip

Every consumer of a search result reads **leg group zero only**:

- `src/lib/tbo.ts` `rawSearch` builds 1–2 segments and maps `JourneyType` to
  `1`/`2`/`5` — never `3`.
- `src/lib/tbo.ts` `mapResult` → `r.Segments?.[0]`.
- `src/lib/tbo-book.ts` `quoteDetails` → `quoted.Segments?.[0]`.
- `FlightSearch` is `{ outbound, inbound }` — two arrays, no room for N legs.

Ship multi-city without changing those and a card shows DEL→BOM while charging
the whole 3-leg fare. That is a wrong price on screen, i.e. a TBO certification
failure, not a cosmetic bug.

## Scope when we build it (~1–2 days)

1. Offer model carries `legs: Segment[][]` instead of a flat segment list.
2. Segment builder takes an array of legs; `JourneyType` becomes `3` at ≥3 legs
   or on an open jaw. Leg count ceiling is still unprobed — TBO caps somewhere.
3. Results card and checkout render N legs.
4. Search form grows an "add flight" row.
5. Book/Ticket needs **no** change — it rides `ResultIndex` + `TraceId`.

## Interim, zero API work

`/plan-my-trip` already posts to the agency's Google Form. Adding "Multi-city"
to its journey-type options captures the lead while the search UI is unbuilt.
