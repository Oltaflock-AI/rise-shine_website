// Pure display helpers for the customer pages. No I/O — tested in
// tests/customer-format.test.ts.

import type { CustomerEvent } from "./customers";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function fmtInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${INR.format(Math.round(n))}`;
}

/** ISO date or timestamp → DD-MM-YY (the site-wide date shape). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

/** ISO timestamp → "DD-MM-YY · HH:MM" in India time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} · ${get("hour")}:${get("minute")}`;
}

/** Relative age of a timestamp, for "last active" columns. */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export const PAX_TYPE: Record<number, string> = { 1: "Adult", 2: "Child", 3: "Infant" };

/** TBO flight itinerary status; hotels are stored as 1 = confirmed. */
export function bookingStatusLabel(kind: "flight" | "hotel", status: number | null): { label: string; tone: "ok" | "proc" | "fail" } {
  if (kind === "hotel") return status === 1 || status == null ? { label: "Confirmed", tone: "ok" } : { label: `Status ${status}`, tone: "proc" };
  switch (status) {
    case 5:
      return { label: "Ticketed", tone: "ok" };
    case 1:
    case 2:
      return { label: "Booked", tone: "proc" };
    case 3:
    case 4:
    case 6:
      return { label: "Cancelled", tone: "fail" };
    default:
      return { label: status == null ? "Unknown" : `Status ${status}`, tone: "proc" };
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One human line per activity row. Props are the whitelisted bag written by
 * the site's lib/activity.ts; anything missing degrades to a plain verb.
 */
export function describeEvent(e: Pick<CustomerEvent, "event" | "props">): { title: string; detail: string | null } {
  const p = e.props ?? {};
  const route = str(p.from) && str(p.to) ? `${p.from} → ${p.to}` : null;
  const dates = [str(p.depart) ?? str(p.checkIn), str(p.return) ?? str(p.checkOut)]
    .filter(Boolean)
    .map((d) => fmtDate(d as string))
    .join(" – ");
  const amount = num(p.amountInr) != null ? fmtInr(num(p.amountInr)) : null;
  const pax = [num(p.adults) != null ? `${p.adults} adult${p.adults === 1 ? "" : "s"}` : null, num(p.children) ? `${p.children} child` : null]
    .filter(Boolean)
    .join(", ");
  const join = (...xs: (string | null)[]) => xs.filter(Boolean).join(" · ") || null;

  switch (e.event) {
    case "search_flights":
      return {
        title: `Searched flights${route ? ` ${route}` : ""}`,
        detail: join(dates || null, pax || null, num(p.results) != null ? `${p.results} results` : null),
      };
    case "search_hotels":
      return {
        title: `Searched hotels${str(p.city) ? ` in ${p.city}` : ""}`,
        detail: join(dates || null, num(p.rooms) ? `${p.rooms} room${p.rooms === 1 ? "" : "s"}` : null, num(p.results) != null ? `${p.results} results` : null),
      };
    case "view_hotel":
      return { title: `Viewed ${str(p.hotel) ?? "a hotel"}`, detail: join(str(p.city), dates || null) };
    case "checkout_started":
      return { title: `Started ${str(p.kind) ?? ""} checkout`.replace(/\s+/g, " "), detail: amount };
    case "payment_opened":
      return {
        title: `Opened payment${str(p.kind) ? ` for a ${p.kind}` : ""}`,
        detail: join(amount, route, str(p.orderId)),
      };
    case "booking_confirmed":
      return {
        title: `Booking confirmed${route ? ` ${route}` : str(p.hotel) ? ` · ${p.hotel}` : ""}`,
        detail: join(str(p.pnr) ? `PNR ${p.pnr}` : str(p.ref) ? `Ref ${p.ref}` : null, amount, dates || null),
      };
    case "booking_failed":
      return {
        title: `Booking failed${route ? ` ${route}` : str(p.hotel) ? ` · ${p.hotel}` : ""}`,
        detail: join(str(p.reason) ? `reason: ${p.reason}` : null, amount),
      };
    case "enquiry_sent":
      return { title: "Sent an enquiry", detail: join(str(p.context) ? `via ${p.context}` : null, str(p.to), dates || null) };
    case "callback_requested":
      return { title: "Requested a callback", detail: str(p.context) ? `via ${p.context}` : null };
    default:
      return { title: e.event.replace(/_/g, " "), detail: null };
  }
}
