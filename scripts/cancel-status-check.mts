/** Re-read a change request + its booking, and append the result to the log. */
import { readFileSync, writeFileSync } from "node:fs";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnvLocal } from "./load-env.mjs";
loadEnvLocal();
const agent = process.env.TBO_PROXY_URL ? new ProxyAgent(process.env.TBO_PROXY_URL) : undefined;
const ip = process.env.TBO_END_USER_IP || "115.112.175.13";
const BE = (process.env.TBO_HOTEL_BE_URL || "https://HotelBE.tektravels.com/hotelservice.svc/rest").replace(/\/+$/, "");
const AUTH = (process.env.TBO_HOTEL_BE_AUTH_URL!).replace(/\/+$/, "");

async function post(url: string, body: Record<string, unknown>) {
  const r = await undiciFetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), ...(agent ? { dispatcher: agent } : {}),
  });
  return { httpStatus: r.status, json: JSON.parse(await r.text()) as any };
}

const [bookingId, changeRequestId] = process.argv.slice(2).map(Number);
const a = await post(`${AUTH}/Authenticate`, {
  ClientId: process.env.TBO_HOTEL_BE_CLIENT_ID,
  UserName: process.env.TBO_HOTEL_BE_USERNAME || process.env.TBO_HOTEL_USERNAME,
  Password: process.env.TBO_HOTEL_BE_PASSWORD || process.env.TBO_HOTEL_PASSWORD,
  EndUserIp: ip,
});
const TokenId = a.json.TokenId;
const st = await post(`${BE}/GetChangeRequestStatus`, { EndUserIp: ip, TokenId, ChangeRequestId: changeRequestId });
const bd = await post(`${BE}/GetBookingDetail`, { EndUserIp: ip, TokenId, BookingId: bookingId });
const S = st.json.HotelChangeRequestStatusResult;
const B = bd.json.GetBookingDetailResult;
console.log("ChangeRequestStatus:", S?.ChangeRequestStatus, "· refund:", S?.RefundedAmount, "· charge:", S?.CancellationCharge);
console.log("HotelBookingStatus :", B?.HotelBookingStatus, "· Status:", B?.Status);

const p = `/Users/khush/Downloads/tbo-cancel-log-${bookingId}.json`;
const log = JSON.parse(readFileSync(p, "utf8"));
log.steps.push(
  { step: "GetChangeRequestStatus (final re-check)", url: `${BE}/GetChangeRequestStatus`, request: { EndUserIp: ip, TokenId: "***", ChangeRequestId: changeRequestId }, response: st.json, httpStatus: st.httpStatus },
  { step: "GetBookingDetail (final re-check)", url: `${BE}/GetBookingDetail`, request: { EndUserIp: ip, TokenId: "***", BookingId: bookingId }, response: bd.json, httpStatus: bd.httpStatus },
);
log.outcome = {
  changeRequestId,
  changeRequestStatus: S?.ChangeRequestStatus,
  changeRequestStatusMeaning: { 0: "NotSet", 1: "Pending", 2: "InProgress", 3: "Processed", 4: "Rejected" }[S?.ChangeRequestStatus as number],
  hotelBookingStatus: B?.HotelBookingStatus,
  refundedAmount: S?.RefundedAmount,
  cancellationCharge: S?.CancellationCharge,
  checkedAt: new Date().toISOString(),
};
writeFileSync(p, JSON.stringify(log, null, 1));
console.log("appended to", p);
