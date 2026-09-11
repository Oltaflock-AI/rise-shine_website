/**
 * Does the static-IP proxy still drop large responses?
 *
 * The VPS proxy (`TBO_PROXY_URL`) used to close the socket part-way through
 * anything much over ~1 MB — HotelDetails for a whole result page failed 5
 * times in 12 through it and 0 in 12 without it. This probe repeats that
 * exact measurement so a proxy change can be judged by the number that
 * mattered, not by "curl works".
 *
 * Usage (from the project root; .env.local supplies TBO creds):
 *   npx tsx --conditions=react-server scripts/proxy-truncation-probe.mts
 *   TBO_PROXY_URL=http://u:p@host:8889 npx tsx --conditions=react-server scripts/proxy-truncation-probe.mts
 *   TBO_PROXY_URL= npx tsx --conditions=react-server scripts/proxy-truncation-probe.mts  # direct, no proxy
 *
 * Optional: ROUNDS (default 12), CODES (default 150 — ~3 MB), CITY (default
 * Delhi, 115936).
 */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { hotelCodesByCity, hotelDetails } = await import("../src/lib/tbo-hotel-static");

const ROUNDS = Number(process.env.ROUNDS ?? 12);
const CODES = Number(process.env.CODES ?? 150);
const CITY = process.env.CITY ?? "115936";
const via = process.env.TBO_PROXY_URL?.trim()
  ? process.env.TBO_PROXY_URL.replace(/\/\/.*@/, "//<creds>@")
  : "direct (no proxy)";

const codes = (await hotelCodesByCity(CITY)).map((h) => h.code).filter(Boolean).slice(0, CODES);
console.log(`Via ${via}\n${codes.length} codes × ${ROUNDS} rounds, IsRoomDetailRequired=false\n`);

let failed = 0;
for (let i = 1; i <= ROUNDS; i++) {
  const started = Date.now();
  try {
    const raws = await hotelDetails(codes, { withRooms: false });
    const bytes = JSON.stringify(raws).length;
    console.log(
      `  round ${String(i).padStart(2)}: ok   · ${raws.length} hotels · ${(bytes / 1e6).toFixed(2)} MB · ${Date.now() - started} ms`,
    );
  } catch (e) {
    failed++;
    console.log(
      `  round ${String(i).padStart(2)}: FAIL · ${Date.now() - started} ms · ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
console.log(`\n${failed}/${ROUNDS} failed via ${via}`);
process.exitCode = failed ? 1 : 0;
