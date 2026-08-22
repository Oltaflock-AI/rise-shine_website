/**
 * TBO facility strings → a short, iconed, de-duplicated amenity list.
 *
 * The raw feed is not a list of amenities, it is every phrase every supplier
 * ever wrote. A single Dubai hotel returns 651 distinct strings, and one pool
 * arrives as "Outdoor pool", "Swimming pool", "outdoor pool (all year)" and
 * "Number of outdoor pools - 1" — so a naive de-dupe on the raw text shows the
 * guest the same fact four times. A third of the feed is pandemic-era boilerplate
 * ("use of cleaning chemicals that are effective against coronavirus") that tells
 * a traveller nothing in 2026.
 *
 * So each string is matched to a CATEGORY, and the category is what renders —
 * once, with its own icon. Anything unrecognised but presentable is kept after
 * the known ones, because a real amenity we have not seen before is still worth
 * showing; anything matching the noise patterns is dropped outright.
 *
 * Pure and dependency-free (icon NAMES, not components, so this stays testable
 * and importable from anywhere): `tests/hotel-amenities.test.ts` covers it.
 */

/** Lucide icon names — resolved to components by `AmenityIcon`. */
export type AmenityIconName =
  | "Wifi"
  | "Waves"
  | "Utensils"
  | "Coffee"
  | "Tv"
  | "WashingMachine"
  | "Dumbbell"
  | "CircleParking"
  | "Plane"
  | "Martini"
  | "PawPrint"
  | "Baby"
  | "Accessibility"
  | "Lock"
  | "ShieldCheck"
  | "Briefcase"
  | "Banknote"
  | "Luggage"
  | "ConciergeBell"
  | "BellRing"
  | "Sparkles"
  | "Trees"
  | "CigaretteOff"
  | "Snowflake"
  | "ArrowUpDown"
  | "Flower2"
  | "Scissors"
  | "Store"
  | "Clock"
  | "HeartPulse"
  | "Check";

export type Amenity = { key: string; label: string; icon: AmenityIconName };

/**
 * Order matters: the FIRST rule that matches wins, so specific patterns sit
 * above general ones ("children's pool" before "pool", "airport shuttle"
 * before "parking"). Patterns run against the lower-cased string.
 */
const RULES: {
  key: string;
  label: string;
  icon: AmenityIconName;
  re: RegExp;
}[] = [
  {
    key: "wifi",
    label: "Free WiFi",
    icon: "Wifi",
    re: /\b(wi-?fi|wireless internet|internet service)/,
  },
  {
    key: "kids-pool",
    label: "Children's pool",
    icon: "Baby",
    re: /children'?s? pool|kids'? pool/,
  },
  { key: "pool", label: "Swimming pool", icon: "Waves", re: /\bpool\b/ },
  { key: "breakfast", label: "Breakfast", icon: "Coffee", re: /breakfast/ },
  {
    key: "restaurant",
    label: "Restaurant",
    icon: "Utensils",
    re: /restaurant|dining|buffet|coffee shop/,
  },
  {
    key: "bar",
    label: "Bar",
    icon: "Martini",
    re: /\bbar\b|lounge|nightclub|pub\b/,
  },
  {
    key: "room-service",
    label: "Room service",
    icon: "BellRing",
    re: /room service|food can be delivered/,
  },
  {
    key: "tea",
    label: "Tea & coffee",
    icon: "Coffee",
    re: /coffee\/tea|tea\/coffee|kettle/,
  },
  {
    key: "tv",
    label: "Television",
    icon: "Tv",
    re: /\btele-?vision\b|\btv\b|flat-?screen|satellite channels|cable channels/,
  },
  {
    key: "laundry",
    label: "Laundry",
    icon: "WashingMachine",
    re: /laundry|dry clean|ironing|washing machine/,
  },
  {
    key: "gym",
    label: "Fitness centre",
    icon: "Dumbbell",
    re: /fitness|\bgym\b|health club|exercise/,
  },
  {
    key: "spa",
    label: "Spa & sauna",
    icon: "Flower2",
    re: /\bspa\b|sauna|steam room|massage|jacuzzi|hot tub|turkish bath/,
  },
  {
    key: "salon",
    label: "Hair salon",
    icon: "Scissors",
    re: /hair salon|beauty salon|barber/,
  },
  {
    key: "airport",
    label: "Airport transfer",
    icon: "Plane",
    re: /airport (transport|shuttle|transfer|pick)/,
  },
  {
    key: "parking",
    label: "Parking",
    icon: "CircleParking",
    re: /parking|valet|garage/,
  },
  {
    key: "aircon",
    label: "Air conditioning",
    icon: "Snowflake",
    re: /air.?condition|climate control/,
  },
  {
    key: "lift",
    label: "Lift",
    icon: "ArrowUpDown",
    re: /\belevator\b|\blift\b/,
  },
  {
    key: "frontdesk",
    label: "24-hour front desk",
    icon: "Clock",
    re: /24-?hour front desk|front desk \(24|24\/7 front desk/,
  },
  {
    key: "concierge",
    label: "Concierge",
    icon: "ConciergeBell",
    re: /concierge|tour desk|tours\/ticket|multilingual staff/,
  },
  {
    key: "luggage",
    label: "Luggage storage",
    icon: "Luggage",
    re: /luggage storage|baggage storage/,
  },
  {
    key: "safe",
    label: "In-room safe",
    icon: "Lock",
    re: /safe.?deposit|safety deposit|\bsafe\b/,
  },
  {
    key: "security",
    label: "24-hour security",
    icon: "ShieldCheck",
    re: /24-?hour security|cctv|security alarm|key card|smoke alarm|fire exting/,
  },
  {
    key: "business",
    label: "Business centre",
    icon: "Briefcase",
    re: /business cent|conference|meeting room|banquet|fax\/photocopying/,
  },
  {
    key: "money",
    label: "Currency exchange",
    icon: "Banknote",
    re: /currency exchange|atm|banking|cash machine/,
  },
  {
    key: "shops",
    label: "Shops on site",
    icon: "Store",
    re: /gift shop|newsstand|shopping on site|souvenir/,
  },
  {
    key: "garden",
    label: "Garden & terrace",
    icon: "Trees",
    re: /\bgarden\b|terrace|rooftop|\bbeach\b|sun deck/,
  },
  {
    key: "pets",
    label: "Pets allowed",
    icon: "PawPrint",
    re: /pets? allowed|pet.?friendly/,
  },
  {
    key: "accessible",
    label: "Accessible",
    icon: "Accessibility",
    re: /wheelchair|disabled guests|accessib/,
  },
  {
    key: "nonsmoking",
    label: "Non-smoking rooms",
    icon: "CigaretteOff",
    re: /non-?smoking/,
  },
  {
    key: "medical",
    label: "Medical assistance",
    icon: "HeartPulse",
    re: /first aid|doctor on call|medical/,
  },
  {
    key: "housekeeping",
    label: "Daily housekeeping",
    icon: "Sparkles",
    re: /housekeep|maid service|cleaning service/,
  },
];

/**
 * Pandemic-era operational boilerplate and bookkeeping lines. These are real
 * strings from the feed; none of them helps someone choose a hotel.
 */
const NOISE =
  /coronavirus|covid|physical distancing|safety protocols|sanitiz|sanitis|disinfect|hand sanitizer|cleaning chemicals|in accordance with local authority|securely covered|shared stationery|cashless payment|invoice provided|process in place to check health|option to cancel any cleaning|guest accommodation is|screening|temperature check/;

/** Bare counters and fragments — "Number of outdoor pools - 1". */
const COUNTER = /^\s*(number of|total number)/i;

/**
 * Recognised amenities first (feed order preserved within that), then anything
 * unrecognised but presentable, capped at `max`.
 */
export function curateAmenities(
  list: readonly string[] | undefined,
  max = 12,
): Amenity[] {
  const seen = new Set<string>();
  const known: Amenity[] = [];
  const extra: Amenity[] = [];

  for (const raw of list ?? []) {
    const text = (raw || "").trim();
    if (!text || NOISE.test(text.toLowerCase()) || COUNTER.test(text)) continue;

    const lower = text.toLowerCase();
    const rule = RULES.find((r) => r.re.test(lower));
    if (rule) {
      if (seen.has(rule.key)) continue;
      seen.add(rule.key);
      known.push({ key: rule.key, label: rule.label, icon: rule.icon });
      continue;
    }

    // Unknown: keep it only if it reads like a label rather than a sentence.
    if (text.length < 3 || text.length > 28 || text.split(/\s+/).length > 4)
      continue;
    const key = `x:${lower}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push({
      key,
      label: text[0].toUpperCase() + text.slice(1),
      icon: "Check",
    });
  }

  return [...known, ...extra].slice(0, max);
}
