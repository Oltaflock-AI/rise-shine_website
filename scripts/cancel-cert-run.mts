/**
 * Produce the Cancel evidence TBO asked for: SendChangeRequest (RequestType 4)
 * → GetChangeRequestStatus → GetBookingDetail, with the full request and
 * response of every step, credentials masked.
 *
 * Uses the SAME auth the site now uses (HotelBE agency credentials) — the point
 * being that the flight token it used to borrow is rejected by HotelBE.
 *
 *   npx tsx scripts/cancel-cert-run.mts <bookingId>
 */
import { writeFileSync } from "node:fs";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnvLocal } from "./load-env.mjs";
loadEnvLocal();

const agent = process.env.TBO_PROXY_URL ? new ProxyAgent(process.env.TBO_PROXY_URL) : undefined;
const ip = process.env.TBO_END_USER_IP || "115.112.175.13";
const BE = (process.env.TBO_HOTEL_BE_URL || "https://HotelBE.tektravels.com/hotelservice.svc/rest").replace(/\/+$/, "");
const AUTH = (process.env.TBO_HOTEL_BE_AUTH_URL || "http://Sharedapi.tektravels.com/SharedData.svc/rest").replace(/\/+$/, "");

const steps: unknown[] = [];

async function post(label: string, url: string, body: Record<string, unknown>, ms = 240_000) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  let httpStatus = 0, text = "", err = "";
  try {
    const r = await undiciFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: ctl.signal,
      ...(agent ? { dispatcher: agent } : {}),
    });
    httpStatus = r.status;
    text = await r.text();
  } catch (e) {
    err = (e as Error).message;
  } finally { clearTimeout(t); }
  const elapsed = +((Date.now() - started) / 1000).toFixed(1);
  let parsed: unknown = undefined;
  try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
  const masked = { ...body } as Record<string, unknown>;
  for (const k of ["Password", "UserName", "ClientId", "TokenId"]) if (k in masked) masked[k] = "***";
  steps.push({
    step: label, url, elapsedSeconds: elapsed,
    request: masked,
    response: parsed ?? { httpStatus, error: err || undefined, body: text.slice(0, 400) },
    httpStatus,
  });
  console.log(`${label} → HTTP ${httpStatus} in ${elapsed}s`);
  return parsed as Record<string, any> | undefined;
}

const bookingId = Number(process.argv[2]);
if (!bookingId) throw new Error("usage: cancel-cert-run.mts <bookingId>");

const a = await post("Authenticate", `${AUTH}/Authenticate`, {
  ClientId: process.env.TBO_HOTEL_BE_CLIENT_ID,
  UserName: process.env.TBO_HOTEL_BE_USERNAME || process.env.TBO_HOTEL_USERNAME,
  Password: process.env.TBO_HOTEL_BE_PASSWORD || process.env.TBO_HOTEL_PASSWORD,
  EndUserIp: ip,
});
const TokenId = a?.TokenId as string;
console.log("agency:", a?.Member?.AgencyId);
if (!TokenId) throw new Error("no token");

const before = await post("GetBookingDetail (before cancel)", `${BE}/GetBookingDetail`, { EndUserIp: ip, TokenId, BookingId: bookingId });
console.log("  status before:", before?.GetBookingDetailResult?.HotelBookingStatus);

const cr = await post("SendChangeRequest (RequestType 4 = cancellation)", `${BE}/SendChangeRequest`, {
  EndUserIp: ip, TokenId, BookingId: bookingId, RequestType: 4,
  Remarks: "API certification - cancel method evidence",
});
const R = cr?.HotelChangeRequestResult;
console.log("  ChangeRequestId:", R?.ChangeRequestId, "· status:", R?.ChangeRequestStatus, "· err:", R?.Error?.ErrorMessage);

if (R?.ChangeRequestId) {
  for (let i = 1; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    const st = await post(`GetChangeRequestStatus (poll ${i})`, `${BE}/GetChangeRequestStatus`, {
      EndUserIp: ip, TokenId, ChangeRequestId: R.ChangeRequestId,
    });
    const S = st?.HotelChangeRequestStatusResult;
    console.log(`  poll ${i}: ChangeRequestStatus ${S?.ChangeRequestStatus} · refund ${S?.RefundedAmount} · charge ${S?.CancellationCharge}`);
    if (S?.ChangeRequestStatus === 3 || S?.ChangeRequestStatus === 4) break;
  }
}

const after = await post("GetBookingDetail (after cancel)", `${BE}/GetBookingDetail`, { EndUserIp: ip, TokenId, BookingId: bookingId });
console.log("  status after:", after?.GetBookingDetailResult?.HotelBookingStatus);

const out = `/Users/khush/Downloads/tbo-cancel-log-${bookingId}.json`;
writeFileSync(out, JSON.stringify({
  purpose: "Cancel method evidence - SendChangeRequest (RequestType 4)",
  bookingId,
  generatedAt: new Date().toISOString(),
  note: "Credentials masked. Auth is the HotelBE agency (58394), not the flight agency.",
  steps,
}, null, 1));
console.log("\nwrote", out);
