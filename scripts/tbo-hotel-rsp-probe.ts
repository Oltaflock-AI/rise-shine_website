/**
 * Read-only probe: does the hotel Search RS actually carry
 * RecommendedSellingRate (B2C RSP) and Supplements, and under which node name?
 *
 * Uses TBO's own sample HotelCodes from the certification sheet. Search only —
 * no PreBook, no Book, nothing that touches inventory or money.
 */
import { readFileSync } from "node:fs";
import { ProxyAgent, fetch as undiciFetch } from "undici";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const base = (process.env.TBO_HOTEL_URL || "https://affiliate.tektravels.com/HotelAPI").replace(/\/+$/, "");
const user = process.env.TBO_HOTEL_USERNAME || process.env.TBO_USERNAME || "";
const pass = process.env.TBO_HOTEL_PASSWORD || process.env.TBO_PASSWORD || "";
const proxy = process.env.TBO_PROXY_URL?.trim();
const agent = proxy ? new ProxyAgent(proxy) : undefined;

const RSP_CODES =
  "1000084,1000027,1000089,1000171,1000167,1000302,1000198,1000538,1000648,1000937,1000957,1000847,1000872,1001049,1001056,1001143,1001122,1001046,1463986,1491912";
const SUPPLEMENT_CODES =
  "1376565,1345318,1345320,1200255,1128760,1250333,1078234,1347149,1358855,1345321,1108025,1356271,1267547";

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 864e5).toISOString().slice(0, 10);
}

async function search(label: string, hotelCodes: string) {
  const body = {
    CheckIn: iso(30),
    CheckOut: iso(32),
    HotelCodes: hotelCodes,
    GuestNationality: "IN",
    PaxRooms: [{ Adults: 2, Children: 0, ChildrenAges: null }],
    ResponseTime: Math.min(23, Math.max(5, Math.ceil(hotelCodes.split(",").length / 5))),
    IsDetailedResponse: true,
    Filters: {},
  };
  const r = await undiciFetch(`${base}/Search`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify(body),
    ...(agent ? { dispatcher: agent } : {}),
  });
  const j = (await r.json()) as {
    Status?: { Code?: number; Description?: string };
    HotelResult?: Array<{ HotelCode?: string; Currency?: string; Rooms?: Record<string, unknown>[] }>;
  };

  console.log(`\n=== ${label} — HTTP ${r.status} · Status ${j.Status?.Code} ${j.Status?.Description ?? ""} ===`);
  const hotels = j.HotelResult ?? [];
  console.log(`hotels priced: ${hotels.length}`);

  const keys = new Set<string>();
  let withRsp = 0;
  let withSupp = 0;
  let rooms = 0;
  let sample: Record<string, unknown> | undefined;
  for (const h of hotels) {
    for (const room of h.Rooms ?? []) {
      rooms++;
      for (const k of Object.keys(room)) keys.add(k);
      if (room.RecommendedSellingRate != null || room.RecommendedSellingPrice != null) {
        withRsp++;
        sample ??= room;
      }
      if (room.Supplements != null) withSupp++;
    }
  }
  console.log(`rooms: ${rooms} · carrying an RSP node: ${withRsp} · carrying Supplements: ${withSupp}`);
  console.log("room keys seen:", [...keys].sort().join(", "));
  const withSupplement = hotels.flatMap((h) => h.Rooms ?? []).find((r) => Array.isArray(r.Supplements) && (r.Supplements as unknown[]).length);
  if (withSupplement) {
    console.log("sample room with Supplements/RoomPromotion:", JSON.stringify(
      {
        Name: withSupplement.Name,
        TotalFare: withSupplement.TotalFare,
        Inclusion: withSupplement.Inclusion,
        RoomPromotion: withSupplement.RoomPromotion,
        Supplements: withSupplement.Supplements,
        BeddingGroup: withSupplement.BeddingGroup,
        WithTransfers: withSupplement.WithTransfers,
      },
      null,
      2,
    ).slice(0, 1800));
  }
  if (sample) {
    console.log("sample RSP room:", JSON.stringify(
      {
        BookingCode: sample.BookingCode,
        TotalFare: sample.TotalFare,
        RecommendedSellingRate: sample.RecommendedSellingRate,
        RecommendedSellingPrice: sample.RecommendedSellingPrice,
      },
      null,
      2,
    ));
  }
}

async function main() {
  await search("RSP sample codes", RSP_CODES);
  await search("Supplement sample codes", SUPPLEMENT_CODES);
}
main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
