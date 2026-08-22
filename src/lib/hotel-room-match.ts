/**
 * Matching a live room RATE to the static catalogue's description of that room.
 *
 * The two halves come from different TBO APIs and share no identifier:
 *
 *   content ← static `HotelDetails.RoomDetails[]`
 *             `{ RoomId, RoomName, RoomSize, RoomDescription, imageURL }`
 *   rate    ← live `Search`/`PreBook` rooms
 *             `{ bookingCode, name, totalFare, ... }`
 *
 * `RoomId` never appears on the live side, so the only join available is the
 * name — and the two sides do not write names identically. A rate carries bed
 * counts and supplier suffixes the catalogue omits:
 *
 *   live   "Deluxe Double or Twin Room,1 King Bed"
 *   static "Deluxe, Double or Twin Room with King Bed"
 *
 * So the join is by COVERAGE of the catalogue name, not by symmetric
 * similarity — see `roomNameCoverage` for why Dice scores that pair 0.33 and
 * gets it wrong. An unmatched rate simply shows no extra detail: showing the
 * WRONG room's description is worse than showing none, because the guest is
 * choosing what they will sleep in.
 *
 * NOTE ON PHOTOS: `imageURL` exists in TBO's schema but is empty on every room
 * of every hotel on our static account — 6,879 rooms across 23 hotels in three
 * cities returned not one URL. `image` is carried here so per-room photos light
 * up automatically if TBO ever populates it, but nothing should be built on the
 * assumption that it is there.
 *
 * Pure and dependency-free: `tests/hotel-room-match.test.ts` covers it.
 */

/** Words that carry no distinguishing meaning between one room type and another. */
const NOISE = new Set([
  "room",
  "rooms",
  "bed",
  "beds",
  "bedroom",
  "with",
  "and",
  "the",
  "a",
  "an",
  "of",
  "in",
  "or",
  "size",
  "sqm",
  "sqft",
  "ft",
  "view",
  "only",
  "free",
  "including",
  "included",
  "inclusive",
  "breakfast",
  "board",
  "rate",
  "plan",
  "non",
  "refundable",
  "nonrefundable",
  "cancellation",
  "guest",
  "guests",
  "person",
  "persons",
  "adult",
  "adults",
  "night",
  "nights",
  "occupancy",
]);

/**
 * Lower-case, strip punctuation and parenthetical/suffix noise, and drop the
 * filler words above. Digits are KEPT — "1 King" and "2 Twin" are genuinely
 * different rooms and must not collapse onto each other.
 */
export function normaliseRoomName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE.has(w))
    .join(" ")
    .trim();
}

function tokens(name: string): Set<string> {
  return new Set(normaliseRoomName(name).split(" ").filter(Boolean));
}

/**
 * How much of the CATALOGUE name the rate name accounts for.
 *
 * Symmetric similarity (Dice, Jaccard) is the wrong tool: a rate name is
 * routinely padded with promotions the catalogue never mentions —
 *
 *   live      "AVANI Room, Early Check-In and Late Check-Out, Rooftop Pool Access,1 King Bed"
 *   catalogue "Avani Room with King Bed"
 *
 * — which is a correct pairing that Dice scores 0.33, because it counts the six
 * promo tokens against it. Coverage asks the question that actually matters:
 * is every distinguishing word of the catalogue room present in the rate?
 *
 * `matched` is returned alongside so a caller can prefer the most SPECIFIC
 * covered entry: "avani" and "avani king" both cover fully against the rate
 * above, and only the second one describes the right bed.
 */
export function roomNameCoverage(
  rateName: string,
  catalogueName: string,
): { coverage: number; matched: number } {
  const rate = tokens(rateName);
  const cat = tokens(catalogueName);
  if (!rate.size || !cat.size) return { coverage: 0, matched: 0 };
  let matched = 0;
  for (const t of cat) if (rate.has(t)) matched++;
  return { coverage: matched / cat.size, matched };
}

/**
 * Nearly every catalogue token must appear in the rate name. Below this the
 * pairing is a guess, and a guess shows the guest the wrong bed.
 */
export const ROOM_MATCH_COVERAGE = 0.9;

/**
 * A single shared word is not identification — "Room (AVANI)" covers fully
 * against every AVANI rate while describing none of them in particular. Two
 * matched tokens is the floor, unless the names normalise to exactly the same
 * thing, which is identification by definition.
 */
export const ROOM_MATCH_MIN_TOKENS = 2;

/** The catalogue's description of one room type, normalised. */
export type RoomContent = {
  name: string;
  size?: string;
  description?: string;
  /** Empty in practice — see the note above. */
  image?: string;
};

/**
 * The catalogue entry that best describes `rateName`, or undefined when nothing
 * scores well enough. Ties go to the first candidate, which is the order TBO
 * returns rooms in.
 */
export function matchRoomContent(
  rateName: string,
  rooms: readonly RoomContent[] | undefined,
): RoomContent | undefined {
  if (!rateName || !rooms?.length) return undefined;
  const rateNorm = normaliseRoomName(rateName);
  if (!rateNorm) return undefined;

  let best:
    { room: RoomContent; matched: number; coverage: number } | undefined;
  for (const room of rooms) {
    if (!room.name) continue;
    // An entry with neither a size nor a description has nothing to add.
    if (!room.size && !room.description && !room.image) continue;

    const { coverage, matched } = roomNameCoverage(rateName, room.name);
    if (coverage < ROOM_MATCH_COVERAGE) continue;
    if (
      matched < ROOM_MATCH_MIN_TOKENS &&
      normaliseRoomName(room.name) !== rateNorm
    )
      continue;

    // Most specific wins; coverage breaks a tie between equally specific names.
    if (
      !best ||
      matched > best.matched ||
      (matched === best.matched && coverage > best.coverage)
    ) {
      best = { room, matched, coverage };
    }
  }
  return best?.room;
}
