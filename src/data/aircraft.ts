/**
 * IATA aircraft codes → the name a passenger recognises.
 *
 * TBO sends `Segments[].Craft` as a bare code — "7M8", "32N", "788". A code
 * tells a traveller nothing; the type tells them whether they are on a
 * widebody for six hours or a turboprop for one.
 *
 * Deliberately partial: it covers what actually flies the routes we sell, and
 * an unknown code falls back to the code itself rather than to a guess.
 */
const AIRCRAFT: Record<string, string> = {
  // Airbus narrowbody
  "319": "Airbus A319",
  "320": "Airbus A320",
  "32A": "Airbus A320",
  "32N": "Airbus A320neo",
  "321": "Airbus A321",
  "32Q": "Airbus A321neo",
  "32S": "Airbus A321",
  // Airbus widebody
  "330": "Airbus A330",
  "332": "Airbus A330-200",
  "333": "Airbus A330-300",
  "339": "Airbus A330-900neo",
  "351": "Airbus A350-1000",
  "359": "Airbus A350-900",
  "388": "Airbus A380",
  // Boeing narrowbody
  "737": "Boeing 737",
  "738": "Boeing 737-800",
  "739": "Boeing 737-900",
  "73H": "Boeing 737-800",
  "7M8": "Boeing 737 MAX 8",
  "7M9": "Boeing 737 MAX 9",
  // Boeing widebody
  "744": "Boeing 747-400",
  "772": "Boeing 777-200",
  "773": "Boeing 777-300",
  "77W": "Boeing 777-300ER",
  "787": "Boeing 787 Dreamliner",
  "788": "Boeing 787-8 Dreamliner",
  "789": "Boeing 787-9 Dreamliner",
  "78X": "Boeing 787-10 Dreamliner",
  // Regional
  AT7: "ATR 72",
  AT5: "ATR 42",
  DH8: "Bombardier Dash 8",
  E90: "Embraer 190",
  E75: "Embraer 175",
  CR9: "Bombardier CRJ900",
};

/** "7M8" → "Boeing 737 MAX 8"; an unknown code comes back unchanged. */
export function aircraftName(code: string | undefined): string {
  const c = (code || "").trim().toUpperCase();
  if (!c) return "";
  return AIRCRAFT[c] ?? c;
}
