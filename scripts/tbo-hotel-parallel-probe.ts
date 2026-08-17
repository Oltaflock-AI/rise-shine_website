/**
 * Read-only probe: are our city-search batches actually leaving in parallel?
 *
 * TBO's 17-Aug portal verification says the 100-code chunks arrive "with a gap
 * of a few seconds in every request". The page fires them with Promise.all, so
 * if they serialise it happens below us — in the HTTP dispatcher or in the
 * static-IP forward proxy. This times each batch's start and finish so the two
 * cases are distinguishable:
 *
 *   parallel   → every start offset ~0ms, total ~= slowest batch
 *   serialised → start offsets step up, total ~= sum of batches
 *
 * Run direct:          npx tsx scripts/tbo-hotel-parallel-probe.ts
 * Run through proxy:   TBO_PROXY_URL=http://user:pass@host:port npx tsx ...
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

/** Dubai — a city with enough hotels to need several batches. */
const CITY_CODE = process.env.PROBE_CITY || "115936";
const BATCHES = Number(process.env.PROBE_BATCHES || 5);

function iso(days: number): string {
  return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
}

async function hotelCodes(): Promise<string[]> {
  const r = await undiciFetch(`${(process.env.TBO_HOTEL_STATIC_URL || "").replace(/\/+$/, "")}/TBOHotelCodeList`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.TBO_HOTEL_STATIC_USERNAME ?? ""}:${process.env.TBO_HOTEL_STATIC_PASSWORD ?? ""}`,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ CityCode: CITY_CODE, IsDetailedResponse: "false" }),
    ...(agent ? { dispatcher: agent } : {}),
  });
  const j = (await r.json()) as { Hotels?: Array<{ HotelCode?: string }> };
  return (j.Hotels ?? []).map((h) => String(h.HotelCode)).filter(Boolean);
}

async function searchBatch(i: number, codes: string[], t0: number) {
  const started = Date.now() - t0;
  const r = await undiciFetch(`${base}/Search`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify({
      CheckIn: iso(30),
      CheckOut: iso(32),
      HotelCodes: codes.join(","),
      GuestNationality: "IN",
      PaxRooms: [{ Adults: 2, Children: 0, ChildrenAges: null }],
      ResponseTime: 23,
      IsDetailedResponse: false,
      Filters: {},
    }),
    ...(agent ? { dispatcher: agent } : {}),
  });
  const j = (await r.json()) as { Status?: { Code?: number }; HotelResult?: unknown[] };
  const ended = Date.now() - t0;
  console.log(
    `batch ${i + 1}: sent at +${started}ms, response at +${ended}ms (${ended - started}ms) · ` +
      `${codes.length} codes · status ${j.Status?.Code} · ${j.HotelResult?.length ?? 0} hotels`,
  );
}

async function main() {
  console.log(`transport: ${proxy ? "PROXY " + proxy.replace(/\/\/[^@]*@/, "//***@") : "direct"}`);
  const all = await hotelCodes();
  console.log(`city ${CITY_CODE}: ${all.length} hotel codes from static data`);
  const chunks: string[][] = [];
  for (let i = 0; i < Math.min(all.length, BATCHES * 100); i += 100) chunks.push(all.slice(i, i + 100));

  const t0 = Date.now();
  await Promise.all(chunks.map((codes, i) => searchBatch(i, codes, t0)));
  console.log(`TOTAL ${Date.now() - t0}ms for ${chunks.length} batches`);
  console.log(
    "Parallel if every 'sent at' is ~+0ms and TOTAL is close to the slowest single batch;\n" +
      "serialised if the 'sent at' offsets step up and TOTAL is close to their sum.",
  );
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
