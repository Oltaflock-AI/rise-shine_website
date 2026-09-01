/** Read-only: current TBO status of the 8 certification bookings. */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnvLocal } from "./load-env.mjs";
loadEnvLocal();

const agent = process.env.TBO_PROXY_URL ? new ProxyAgent(process.env.TBO_PROXY_URL) : undefined;
const ip = process.env.TBO_END_USER_IP || "115.112.175.13";
const BE = (process.env.TBO_HOTEL_BE_URL || "https://HotelBE.tektravels.com/hotelservice.svc/rest").replace(/\/+$/, "");
const AUTH = "http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate";

async function post(url: string, body: unknown, ms = 200_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const started = Date.now();
  try {
    const r = await undiciFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: ctl.signal,
      ...(agent ? { dispatcher: agent } : {}),
    });
    return { status: r.status, ms: Date.now() - started, text: await r.text() };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, text: `ERR ${(e as Error).message}` };
  } finally { clearTimeout(t); }
}

const a = await post(AUTH, {
  ClientId: "ApiIntegrationNew",
  UserName: process.env.TBO_HOTEL_USERNAME,
  Password: process.env.TBO_HOTEL_PASSWORD,
  EndUserIp: ip,
});
const token = JSON.parse(a.text).TokenId as string;
console.log("token acquired · agency", JSON.parse(a.text).Member?.AgencyId);

const IDS = [2165897, 2165898, 2165899, 2165900, 2165903, 2165913, 2165906, 2165917];
for (const id of IDS) {
  const r = await post(`${BE}/GetBookingDetail`, { EndUserIp: ip, TokenId: token, BookingId: id });
  let line = `HTTP ${r.status}`;
  try {
    const R = JSON.parse(r.text).GetBookingDetailResult;
    line = `ResponseStatus ${R.ResponseStatus} · Status ${R.Status} · ${R.HotelBookingStatus} · voucher ${R.VoucherStatus} · conf ${R.ConfirmationNo} · ${R.HotelName ?? ""} · in ${R.CheckIn ?? "?"}`;
  } catch { line += " " + r.text.slice(0, 120); }
  console.log(String(id).padEnd(9), line);
}
