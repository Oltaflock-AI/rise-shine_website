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
/**
 * Decision weight, high first. The card shows three of these, and feed order
 * made that three arbitrary: one hotel led with "Lift · Safe · Laundry" and the
 * next with "Pool · WiFi · Restaurant", so the chips could not be compared
 * across a results page — and a fact you cannot compare is not information.
 * Ranked, every card leads with the same kind of fact.
 *
 * The ranking is what a leisure traveller actually chooses on: does breakfast
 * come with it, will the phone work, is there a pool, is it air-conditioned,
 * where does the car go. A lift and a safe are true of nearly every hotel on
 * the feed, so they are near-worthless as a differentiator and sit at the
 * bottom; they still show on the detail page, where the full list lives.
 */
const RULES: {
  key: string;
  label: string;
  icon: AmenityIconName;
  re: RegExp;
  /** 0-100, high first. Ties keep feed order. */
  weight: number;
}[] = [
  {
    key: "wifi",
    label: "Free WiFi",
    icon: "Wifi",
    re: /\b(wi-?fi|wireless internet|internet service)/,
    weight: 90,
  },
  {
    key: "kids-pool",
    label: "Children's pool",
    icon: "Baby",
    re: /children'?s? pool|kids'? pool/,
    weight: 44,
  },
  { key: "pool", label: "Swimming pool", icon: "Waves", re: /\bpool\b/, weight: 85 },
  { key: "breakfast", label: "Breakfast", icon: "Coffee", re: /breakfast/, weight: 95 },
  {
    key: "restaurant",
    label: "Restaurant",
    icon: "Utensils",
    re: /restaurant|dining|buffet|coffee shop/,
    weight: 70,
  },
  {
    key: "bar",
    label: "Bar",
    icon: "Martini",
    re: /\bbar\b|lounge|nightclub|pub\b/,
    weight: 45,
  },
  {
    key: "room-service",
    label: "Room service",
    icon: "BellRing",
    re: /room service|food can be delivered/,
    weight: 50,
  },
  {
    key: "tea",
    label: "Tea & coffee",
    icon: "Coffee",
    re: /coffee\/tea|tea\/coffee|kettle/,
    weight: 28,
  },
  {
    key: "tv",
    label: "Television",
    icon: "Tv",
    re: /\btele-?vision\b|\btv\b|flat-?screen|satellite channels|cable channels/,
    weight: 30,
  },
  {
    key: "laundry",
    label: "Laundry",
    icon: "WashingMachine",
    re: /laundry|dry clean|ironing|washing machine/,
    weight: 26,
  },
  {
    key: "gym",
    label: "Fitness centre",
    icon: "Dumbbell",
    re: /fitness|\bgym\b|health club|exercise/,
    weight: 60,
  },
  {
    key: "spa",
    label: "Spa & sauna",
    icon: "Flower2",
    re: /\bspa\b|sauna|steam room|massage|jacuzzi|hot tub|turkish bath/,
    weight: 55,
  },
  {
    key: "salon",
    label: "Hair salon",
    icon: "Scissors",
    re: /hair salon|beauty salon|barber/,
    weight: 16,
  },
  {
    key: "airport",
    label: "Airport transfer",
    icon: "Plane",
    re: /airport (transport|shuttle|transfer|pick)/,
    weight: 65,
  },
  {
    key: "parking",
    label: "Parking",
    icon: "CircleParking",
    re: /parking|valet|garage/,
    weight: 75,
  },
  {
    key: "aircon",
    label: "Air conditioning",
    icon: "Snowflake",
    re: /air.?condition|climate control/,
    weight: 80,
  },
  {
    key: "lift",
    label: "Lift",
    icon: "ArrowUpDown",
    re: /\belevator\b|\blift\b/,
    weight: 2,
  },
  {
    key: "frontdesk",
    label: "24-hour front desk",
    icon: "Clock",
    re: /24-?hour front desk|front desk \(24|24\/7 front desk/,
    weight: 6,
  },
  {
    key: "concierge",
    label: "Concierge",
    icon: "ConciergeBell",
    re: /concierge|tour desk|tours\/ticket|multilingual staff/,
    weight: 14,
  },
  {
    key: "luggage",
    label: "Luggage storage",
    icon: "Luggage",
    re: /luggage storage|baggage storage/,
    weight: 12,
  },
  {
    key: "safe",
    label: "In-room safe",
    icon: "Lock",
    re: /safe.?deposit|safety deposit|\bsafe\b/,
    weight: 4,
  },
  {
    key: "security",
    label: "24-hour security",
    icon: "ShieldCheck",
    re: /24-?hour security|cctv|security alarm|key card|smoke alarm|fire exting/,
    weight: 5,
  },
  {
    key: "business",
    label: "Business centre",
    icon: "Briefcase",
    re: /business cent|conference|meeting room|banquet|fax\/photocopying/,
    weight: 22,
  },
  {
    key: "money",
    label: "Currency exchange",
    icon: "Banknote",
    re: /currency exchange|atm|banking|cash machine/,
    weight: 20,
  },
  {
    key: "shops",
    label: "Shops on site",
    icon: "Store",
    re: /gift shop|newsstand|shopping on site|souvenir/,
    weight: 18,
  },
  {
    key: "garden",
    label: "Garden & terrace",
    icon: "Trees",
    re: /\bgarden\b|terrace|rooftop|\bbeach\b|sun deck/,
    weight: 34,
  },
  {
    key: "pets",
    label: "Pets allowed",
    icon: "PawPrint",
    re: /pets? allowed|pet.?friendly/,
    weight: 40,
  },
  {
    key: "accessible",
    label: "Accessible",
    icon: "Accessibility",
    re: /wheelchair|disabled guests|accessib/,
    weight: 38,
  },
  {
    key: "nonsmoking",
    label: "Non-smoking rooms",
    icon: "CigaretteOff",
    re: /non-?smoking/,
    weight: 10,
  },
  {
    key: "medical",
    label: "Medical assistance",
    icon: "HeartPulse",
    re: /first aid|doctor on call|medical/,
    weight: 24,
  },
  {
    key: "housekeeping",
    label: "Daily housekeeping",
    icon: "Sparkles",
    re: /housekeep|maid service|cleaning service/,
    weight: 8,
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
 * Recognised amenities first, ordered by decision weight (see RULES), then
 * anything unrecognised but presentable, capped at `max`.
 *
 * The weight ordering matters most where `max` is small: the results card
 * shows three, and those three have to be the same KIND of three on every
 * card or the guest cannot compare two hotels without opening both.
 */
export function curateAmenities(
  list: readonly string[] | undefined,
  max = 12,
): Amenity[] {
  const seen = new Set<string>();
  const known: (Amenity & { weight: number })[] = [];
  const extra: Amenity[] = [];

  for (const raw of list ?? []) {
    const text = (raw || "").trim();
    if (!text || NOISE.test(text.toLowerCase()) || COUNTER.test(text)) continue;

    const lower = text.toLowerCase();
    const rule = RULES.find((r) => r.re.test(lower));
    if (rule) {
      if (seen.has(rule.key)) continue;
      seen.add(rule.key);
      known.push({
        key: rule.key,
        label: rule.label,
        icon: rule.icon,
        weight: rule.weight,
      });
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

  // Stable: sort() is stable in Node/V8, so equal weights keep feed order.
  const ranked = known
    .sort((a, b) => b.weight - a.weight)
    .map(({ weight: _weight, ...a }) => a);
  return [...ranked, ...extra].slice(0, max);
}
