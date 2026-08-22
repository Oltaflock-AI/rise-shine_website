/**
 * Why do result cards have no photos while the detail page does?
 *
 * The search page asks TBO for content for EVERY result in one HotelDetails
 * call (`hotelInfoBatch` → comma-joined codes); the detail page asks for one.
 * If TBO caps that list, the batch fails, `hotelInfoBatch` swallows it as
 * "content is cosmetic", and every card silently loses its image. This probe
 * walks the batch size up until TBO objects, and reports what it objects with.
 *
 * Usage: npx tsx --conditions=react-server scripts/hotel-image-probe.mts
 */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { hotelCodesByCity, hotelDetails } = await import("../src/lib/tbo-hotel-static");

const CITY = process.argv[2] ?? "115936"; // Delhi
const codes = (await hotelCodesByCity(CITY)).map((h) => h.code).filter(Boolean);
console.log(`City ${CITY}: ${codes.length} hotel codes in the static catalogue\n`);

const imagesOf = (raw: Record<string, unknown>) =>
  Array.isArray(raw.Images) ? raw.Images.length : 0;

for (const n of [1, 2, 5, 10, 20, 30, 50, 100, 200]) {
  if (n > codes.length) break;
  const batch = codes.slice(0, n);
  const started = Date.now();
  try {
    const raws = await hotelDetails(batch, { withRooms: false });
    const withImages = raws.filter((r) => imagesOf(r) > 0).length;
    console.log(
      `  ${String(n).padStart(3)} codes → ${String(raws.length).padStart(3)} returned · ` +
        `${withImages} with images · ${Date.now() - started}ms`,
    );
  } catch (e) {
    console.log(
      `  ${String(n).padStart(3)} codes → FAILED after ${Date.now() - started}ms · ` +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

// What a single hotel's content actually looks like — image count and shape.
console.log("\nSingle-hotel content shape:");
const [one] = await hotelDetails([codes[0]], { withRooms: true });
if (one) {
  console.log("  keys:", Object.keys(one).join(", "));
  console.log(`  HotelName: ${one.HotelName}`);
  console.log(`  Images: ${imagesOf(one)}`);
  if (Array.isArray(one.Images)) console.log(`  first: ${one.Images[0]}`);
  const rooms = one.Rooms;
  console.log(`  Rooms: ${Array.isArray(rooms) ? rooms.length : "absent"}`);
  if (Array.isArray(rooms) && rooms.length) {
    console.log("  room keys:", Object.keys(rooms[0] as object).join(", "));
    console.log("  room sample:", JSON.stringify(rooms[0]).slice(0, 400));
  }
}

// ── what does a "non-JSON response" actually contain? ────────────────────────
//
// `call()` reports only "non-JSON (HTTP 200)". Read the raw bytes so we can tell
// a truncated payload from an HTML error page — the two need opposite fixes.
const { tboFetch } = await import("../src/lib/tbo-fetch");
const base = (process.env.TBO_HOTEL_STATIC_URL || "http://api.tbotechnology.in/TBOHolidays_HotelAPI").replace(/\/+$/, "");
const auth =
  "Basic " +
  Buffer.from(
    `${process.env.TBO_HOTEL_STATIC_USERNAME}:${process.env.TBO_HOTEL_STATIC_PASSWORD}`,
  ).toString("base64");

async function raw(batch: string[]) {
  const res = await tboFetch(`${base}/HotelDetails`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "Accept-Encoding": "gzip" },
    body: JSON.stringify({ Hotelcodes: batch.join(","), Language: "EN", IsRoomDetailRequired: false }),
  });
  const text = await res.text();
  let parsed = true;
  try { JSON.parse(text); } catch { parsed = false; }
  return { status: res.status, bytes: text.length, parsed, head: text.slice(0, 160), tail: text.slice(-120) };
}

console.log("\nRepeatability — same batch size, five attempts each:");
for (const n of [50, 100, 150]) {
  const rows: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await raw(codes.slice(0, n));
    rows.push(r.parsed ? `ok/${(r.bytes / 1024).toFixed(0)}kB` : `BAD/${(r.bytes / 1024).toFixed(0)}kB`);
    if (!r.parsed) {
      console.log(`    ${n} codes · HTTP ${r.status} · ${r.bytes} bytes`);
      console.log(`      head: ${JSON.stringify(r.head)}`);
      console.log(`      tail: ${JSON.stringify(r.tail)}`);
    }
  }
  console.log(`  ${String(n).padStart(3)} codes → ${rows.join("  ")}`);
}

// ── per-room images: does RoomDetails carry any? ─────────────────────────────
console.log("\nRoomDetails shape (IsRoomDetailRequired: true):");
const [withRooms] = await hotelDetails([codes[0]], { withRooms: true });
const rd = withRooms?.RoomDetails;
if (!Array.isArray(rd) || !rd.length) {
  console.log("  RoomDetails:", JSON.stringify(rd)?.slice(0, 200) ?? "absent");
} else {
  console.log(`  ${rd.length} room types · keys: ${Object.keys(rd[0] as object).join(", ")}`);
  console.log("  sample:", JSON.stringify(rd[0]).slice(0, 400));
}

// ── can a live room rate be matched to a static room photo? ──────────────────
//
// Live room names come from Search/PreBook (`HotelRoomOffer.name`); the photos
// live on static `RoomDetails[].imageURL`. There is no shared id, so the only
// join is the name — this prints both sides for one real hotel so the overlap
// can be judged rather than assumed.
const { searchHotels } = await import("../src/lib/tbo-hotel");
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

const live = await searchHotels({
  checkInISO: iso(30),
  checkOutISO: iso(32),
  nationality: "IN",
  rooms: [{ adults: 2 }],
  hotelCodes: codes.slice(0, 40),
});
const offer = live.offers?.find((o) => (o.rooms?.length ?? 0) > 1);
if (!offer) {
  console.log("  no multi-room offer in this sample");
} else {
  console.log(`\n  Hotel ${offer.hotelCode} — ${offer.rooms.length} live rates:`);
  for (const r of offer.rooms.slice(0, 6)) console.log(`    live  · ${r.name}`);
  const [stat] = await hotelDetails([offer.hotelCode], { withRooms: true });
  const rooms = Array.isArray(stat?.RoomDetails) ? stat.RoomDetails : [];
  console.log(`  static RoomDetails: ${rooms.length}`);
  for (const r of rooms.slice(0, 6) as Record<string, unknown>[])
    console.log(`    static· ${r.RoomName}  [img: ${r.imageURL ? "yes" : "NO"}]`);
}
