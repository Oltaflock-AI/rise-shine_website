import "server-only";

/**
 * Transactional email via Resend's REST API — raw fetch, no SDK (same pattern
 * as lib/cashfree.ts). Configured with RESEND_API_KEY (+ optional EMAIL_FROM);
 * without a key every send is a silent no-op so the booking flow never depends
 * on email being provisioned. Senders are best-effort by contract: callers
 * fire them AFTER the money/ticket outcome is decided and swallow failures —
 * a lost email must never fail a paid booking.
 */

import { site } from "@/data/site";
import { formatDate } from "@/lib/format-date";
import type { BookingRequest, BookingResult } from "@/lib/tbo-book";
import type { HotelBookRequest, HotelBookResult } from "@/lib/tbo-hotel-book";
import type { HotelStay } from "@/lib/booking-history";

const API_KEY = process.env.RESEND_API_KEY ?? "";
/** Resend requires a verified domain; onboarding@resend.dev works for testing. */
const FROM = process.env.EMAIL_FROM || "Rise & Shine Travels <onboarding@resend.dev>";

export const emailConfigured = Boolean(API_KEY);

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!emailConfigured) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [args.to],
      reply_to: site.email,
      subject: args.subject,
      html: args.html,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ── shared layout ────────────────────────────────────────────────────────────

const NAVY = "#083249";
const RED = "#e21e26";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f2f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a2b33;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:${NAVY};padding:20px 28px;">
    <div style="color:#ffffff;font-size:18px;font-weight:bold;">Rise &amp; Shine Travels</div>
    <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:2px;">${title}</div>
  </td></tr>
  <tr><td style="padding:28px;">${bodyHtml}</td></tr>
  <tr><td style="padding:18px 28px;border-top:1px solid #e6ebee;font-size:12px;color:#68777f;">
    Need help? Reply to this email, WhatsApp us at ${site.phone.mobileDisplay}, or call ${site.phone.landlineDisplay}.<br/>
    ${site.email}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#68777f;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0 6px 16px;font-size:13.5px;font-weight:bold;color:#1a2b33;" align="right">${value}</td>
  </tr>`;
}

function detailsTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fa;border-radius:10px;padding:6px 16px;margin:18px 0;"><tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr></table>`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── templates ────────────────────────────────────────────────────────────────

/** Lead passenger's email on a flight booking (undefined when none was collected). */
export function flightLeadEmail(req: BookingRequest): string | undefined {
  return req.passengers.find((p) => p.Email?.trim())?.Email?.trim();
}

export function flightConfirmationEmail(
  req: BookingRequest,
  result: BookingResult,
  amountInr?: number,
): { subject: string; html: string } {
  const lead = req.passengers[0];
  const name = [lead?.FirstName, lead?.LastName].filter(Boolean).join(" ") || "traveller";
  const rows = [
    row("Route", `${esc(req.origin)} &rarr; ${esc(req.destination)}`),
    row("Flight", esc(`${req.airlineCode} ${req.flightNumber}`)),
    row("Departure", esc(formatDate(req.departDate))),
    ...(result.pnr ? [row("PNR", esc(result.pnr))] : []),
    ...(result.ticketNumbers?.length
      ? [row(`Ticket${result.ticketNumbers.length > 1 ? "s" : ""}`, esc(result.ticketNumbers.join(", ")))]
      : []),
    row("Passengers", String(req.passengers.length)),
    ...(amountInr != null ? [row("Amount paid", `&#8377;${inr.format(amountInr)}`)] : []),
  ].join("");
  const html = shell(
    "Flight booking confirmed",
    `<div style="font-size:15px;">Hi ${esc(name)},</div>
     <p style="font-size:14px;line-height:1.6;">Your flight is <b style="color:${RED};">confirmed</b>. Keep this email — your PNR is your booking reference at the airline.</p>
     ${detailsTable(rows)}
     <p style="font-size:13px;line-height:1.6;color:#68777f;">Carry a government photo ID to the airport. Web check-in opens with the airline${result.pnr ? ` using PNR <b>${esc(result.pnr)}</b>` : ""}.</p>`,
  );
  return {
    subject: `Flight confirmed · ${req.origin} → ${req.destination}${result.pnr ? ` · PNR ${result.pnr}` : ""}`,
    html,
  };
}

/** Lead guest's email on a hotel booking (room 1's lead carries contact details). */
export function hotelLeadEmail(req: HotelBookRequest): string | undefined {
  for (const room of req.rooms) {
    const hit = room.passengers.find((p) => p.email?.trim());
    if (hit) return hit.email!.trim();
  }
  return undefined;
}

export function hotelConfirmationEmail(
  req: HotelBookRequest,
  stay: HotelStay,
  result: HotelBookResult,
  amountInr?: number,
): { subject: string; html: string } {
  const lead = req.rooms[0]?.passengers[0];
  const name = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || "guest";
  const hotelName = stay.hotelName || "your hotel";
  const rows = [
    row("Hotel", esc(hotelName)),
    ...(stay.city ? [row("City", esc(stay.city))] : []),
    ...(stay.checkIn ? [row("Check-in", esc(formatDate(stay.checkIn)))] : []),
    ...(stay.checkOut ? [row("Check-out", esc(formatDate(stay.checkOut)))] : []),
    row(`Room${req.rooms.length > 1 ? "s" : ""}`, String(req.rooms.length)),
    ...(result.confirmationNo ? [row("Confirmation no.", esc(result.confirmationNo))] : []),
    ...(result.bookingId ? [row("Booking id", String(result.bookingId))] : []),
    ...(amountInr != null ? [row("Amount paid", `&#8377;${inr.format(amountInr)}`)] : []),
  ].join("");
  const html = shell(
    "Hotel booking confirmed",
    `<div style="font-size:15px;">Hi ${esc(name)},</div>
     <p style="font-size:14px;line-height:1.6;">Your stay at <b>${esc(hotelName)}</b> is <b style="color:${RED};">confirmed</b>. Show this email${result.confirmationNo ? " and your confirmation number" : ""} at check-in.</p>
     ${detailsTable(rows)}
     <p style="font-size:13px;line-height:1.6;color:#68777f;">The lead guest should carry a government photo ID. Check-in/out times follow the hotel's policy.</p>`,
  );
  return {
    subject: `Hotel confirmed · ${hotelName}${result.confirmationNo ? ` · ${result.confirmationNo}` : ""}`,
    html,
  };
}

export function refundNoticeEmail(args: {
  kind: "flight" | "hotel";
  amountInr?: number;
  reference?: string;
}): { subject: string; html: string } {
  const what = args.kind === "flight" ? "flight booking" : "hotel booking";
  const html = shell(
    "Payment refunded",
    `<p style="font-size:14px;line-height:1.6;">Your ${what} could not be completed, so we have <b>refunded your payment in full</b>${
      args.amountInr != null ? ` (&#8377;${inr.format(args.amountInr)})` : ""
    }.</p>
     <p style="font-size:14px;line-height:1.6;">Refunds usually reach your account in 5&ndash;7 working days depending on your bank.</p>
     ${args.reference ? detailsTable(row("Payment reference", esc(args.reference))) : ""}
     <p style="font-size:13px;line-height:1.6;color:#68777f;">Want us to rebook or find an alternative? Just reply to this email or WhatsApp us.</p>`,
  );
  return { subject: `Your payment has been refunded — ${what} not completed`, html };
}
