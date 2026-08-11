/**
 * Guest nationalities offered in the hotel search (ISO-3166-1 alpha-2).
 *
 * TBO India's rule, restated on the certification sheet (Portal checkpoint 6):
 *   • DOMESTIC (Indian) stays  — every nationality is allowed.
 *   • INTERNATIONAL stays      — Indian nationality only; TBO returns no
 *     availability for any other nationality, so we stop before searching.
 *
 * India stays first: it is the default and the only one valid worldwide.
 */
export type Nationality = { code: string; label: string };

export const NATIONALITIES: Nationality[] = [
  { code: "IN", label: "India" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "AU", label: "Australia" },
  { code: "BD", label: "Bangladesh" },
  { code: "BT", label: "Bhutan" },
  { code: "CA", label: "Canada" },
  { code: "CN", label: "China" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "FR", label: "France" },
  { code: "GB", label: "United Kingdom" },
  { code: "ID", label: "Indonesia" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "KE", label: "Kenya" },
  { code: "LK", label: "Sri Lanka" },
  { code: "MY", label: "Malaysia" },
  { code: "NL", label: "Netherlands" },
  { code: "NP", label: "Nepal" },
  { code: "NZ", label: "New Zealand" },
  { code: "OM", label: "Oman" },
  { code: "PH", label: "Philippines" },
  { code: "QA", label: "Qatar" },
  { code: "RU", label: "Russia" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "SG", label: "Singapore" },
  { code: "TH", label: "Thailand" },
  { code: "US", label: "United States" },
  { code: "ZA", label: "South Africa" },
];

const BY_CODE = new Map(NATIONALITIES.map((n) => [n.code, n]));

/** Normalize a URL/form value to a supported ISO-2 nationality (default IN). */
export function normalizeNationality(raw?: string | null): string {
  const code = (raw ?? "").trim().toUpperCase();
  return BY_CODE.has(code) ? code : "IN";
}

export function nationalityLabel(code: string): string {
  return BY_CODE.get(normalizeNationality(code))?.label ?? "India";
}

/**
 * TBO's nationality rule. `destinationCountry` is the stay's ISO-2 country
 * ("" when unknown — treated as domestic so we never block on missing data).
 */
export function nationalityAllowed(nationality: string, destinationCountry?: string): boolean {
  const dest = (destinationCountry ?? "").trim().toUpperCase();
  if (!dest || dest === "IN") return true;
  return normalizeNationality(nationality) === "IN";
}
