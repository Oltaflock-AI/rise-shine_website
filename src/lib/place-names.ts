/**
 * TBO's place names are a mix of current and superseded ones.
 *
 * Its hotel city list carries "Mumbai/Bombay, Maharashtra" — the modern name
 * and the one it replaced, joined by a slash — and its flight responses return
 * `AirportName: "Calcutta"` for CCU while correctly calling the city Kolkata.
 * Some entries also arrive padded ("Navi Mumbai ").
 *
 * Showing a traveller "Bombay" in 2026 reads as a stale database, so display
 * names go through here. Only the value SHOWN is changed: search codes, request
 * payloads and anything sent back to TBO keep TBO's own strings, because the
 * supplier is the authority on its own identifiers.
 *
 * Pure and dependency-free: `tests/place-names.test.ts` covers it.
 */

/** Superseded → current. Lower-cased keys; only unambiguous renames. */
const FORMER: Record<string, string> = {
  bombay: "Mumbai",
  calcutta: "Kolkata",
  madras: "Chennai",
  poona: "Pune",
  baroda: "Vadodara",
  trivandrum: "Thiruvananthapuram",
  pondicherry: "Puducherry",
  allahabad: "Prayagraj",
  gurgaon: "Gurugram",
};

/**
 * TBO writes an alias as "Current/Former" (occasionally the other way round).
 * Keep the current name and drop the alias — but only when one side is a known
 * former name of the other, so a genuine compound like "Baden/Wien" survives.
 */
function resolveAlias(part: string): string {
  if (!part.includes("/")) return part;
  const bits = part
    .split("/")
    .map((b) => b.trim())
    .filter(Boolean);
  if (bits.length !== 2) return part;
  const [a, b] = bits;
  if (FORMER[b.toLowerCase()]) return a; // "Mumbai/Bombay" → "Mumbai"
  if (FORMER[a.toLowerCase()]) return b; // "Bombay/Mumbai" → "Mumbai"
  return part;
}

/**
 * The name to put in front of a traveller. Handles TBO's padding, its
 * "Current/Former" aliases, and bare superseded names.
 *
 * Suffixes are preserved: "Mumbai/Bombay, Maharashtra" → "Mumbai, Maharashtra",
 * because the region is what tells two same-named towns apart.
 */
export function displayPlaceName(raw: string | undefined): string {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  return text
    .split(",")
    .map((part, i) => {
      const p = resolveAlias(part.trim());
      // Only the leading component is a place we rename; a trailing "Maharashtra"
      // or "India" must be left exactly as it is.
      if (i > 0) return p;
      const modern = FORMER[p.toLowerCase()];
      return modern ?? p;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * An airport's name, with the same treatment. TBO returns "Calcutta" as the
 * name of CCU, so an itinerary line otherwise reads "Kolkata · Calcutta".
 */
export function displayAirportName(raw: string | undefined): string {
  return displayPlaceName(raw);
}
