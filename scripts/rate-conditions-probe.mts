/**
 * Read-only probe: where does RateConditions actually live in the Search and
 * PreBook responses? TBO's 1-Sep-2026 log screenshot shows the node present
 * while our page reports none, so find the level we are reading at.
 * Search + PreBook only — nothing that holds inventory or money.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const base = (process.env.TBO_HOTEL_URL || "https://affiliate.tektravels.com/HotelAPI").replace(/\/+$/, "");
const user = process.env.TBO_HOTEL_USERNAME || process.env.TBO_USERNAME || "";
const pass = process.env.TBO_HOTEL_PASSWORD || process.env.TBO_PASSWORD || "";
const proxy = process.env.TBO_PROXY_URL?.trim();
const agent = proxy ? new ProxyAgent(proxy) : undefined;

const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

async function call<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
  const r = await undiciFetch(`${base}/${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "Accept-Encoding": "gzip" },
    body: JSON.stringify(body),
    ...(agent ? { dispatcher: agent } : {}),
  });
  return { status: r.status, json: (await r.json()) as T };
}

/** Every JSON path at which a key named `name` appears. */
function findPaths(node: unknown, name: string, path = "$"): Array<{ path: string; value: unknown }> {
  const out: Array<{ path: string; value: unknown }> = [];
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...findPaths(v, name, `${path}[${i}]`)));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === name) out.push({ path: `${path}.${k}`, value: v });
      out.push(...findPaths(v, name, `${path}.${k}`));
    }
  }
  return out;
}

const CODES = (process.argv[2] || "1012683,1088049").split(",");

for (const code of CODES) {
  console.log("\n" + "=".repeat(90));
  console.log("HOTEL", code);
  const { status, json } = await call<any>("Search", {
    CheckIn: iso(30),
    CheckOut: iso(32),
    HotelCodes: code,
    GuestNationality: "IN",
    PaxRooms: [{ Adults: 2, Children: 0, ChildrenAges: null }],
    ResponseTime: 10,
    IsDetailedResponse: true,
    Filters: {},
  });
  console.log(`Search HTTP ${status} · Status ${json?.Status?.Code} ${json?.Status?.Description ?? ""}`);
  const hr = json?.HotelResult?.[0];
  if (!hr) { console.log("no HotelResult"); continue; }
  console.log("Search HotelResult keys:", Object.keys(hr).join(", "));
  console.log("Search Room[0] keys   :", Object.keys(hr.Rooms?.[0] ?? {}).join(", "));
  const sRC = findPaths(json, "RateConditions");
  console.log(`Search RateConditions occurrences: ${sRC.length}`);
  for (const h of sRC.slice(0, 3)) console.log("  ", h.path, "→", JSON.stringify(h.value).slice(0, 160));

  const bookingCode = hr.Rooms?.[0]?.BookingCode;
  if (!bookingCode) { console.log("no BookingCode"); continue; }
  const pb = await call<any>("PreBook", { BookingCode: bookingCode, PaymentMode: "Limit" });
  console.log(`\nPreBook HTTP ${pb.status} · Status ${pb.json?.Status?.Code} ${pb.json?.Status?.Description ?? ""}`);
  console.log("PreBook ROOT keys        :", Object.keys(pb.json ?? {}).join(", "));
  const phr = pb.json?.HotelResult?.[0];
  if (phr) {
    console.log("PreBook HotelResult keys :", Object.keys(phr).join(", "));
    console.log("PreBook Room[0] keys     :", Object.keys(phr.Rooms?.[0] ?? {}).join(", "));
  }
  const pRC = findPaths(pb.json, "RateConditions");
  console.log(`PreBook RateConditions occurrences: ${pRC.length}`);
  for (const h of pRC) console.log("  ", h.path, "→", JSON.stringify(h.value).slice(0, 400));
}

// ── Second pass: full RateConditions + where ValidationInfo actually sits ──
{
  const code = CODES[0];
  const s = await call<any>("Search", {
    CheckIn: iso(30), CheckOut: iso(32), HotelCodes: code, GuestNationality: "IN",
    PaxRooms: [{ Adults: 2, Children: 0, ChildrenAges: null }],
    ResponseTime: 10, IsDetailedResponse: true, Filters: {},
  });
  const bc = s.json?.HotelResult?.[0]?.Rooms?.[0]?.BookingCode;
  const pb = await call<any>("PreBook", { BookingCode: bc, PaymentMode: "Limit" });
  console.log("\n\n### ValidationInfo occurrences");
  for (const h of findPaths(pb.json, "ValidationInfo")) console.log("  ", h.path, "→", JSON.stringify(h.value));
  console.log("\n### Full RateConditions rows");
  const rc = pb.json?.HotelResult?.[0]?.RateConditions ?? [];
  rc.forEach((r: string, i: number) => console.log(`  [${i}] ${r}`));
}
