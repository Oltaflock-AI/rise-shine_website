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
import { todayInIndiaISO } from "@/lib/stay-dates";
import {
  C,
  FONT,
  button,
  callout,
  detailsTable,
  esc,
  heading,
  inr,
  paragraph,
  row,
  rupees,
  shell,
} from "@/lib/email-brand";
import type { BookingRequest, BookingResult } from "@/lib/tbo-book";
import type { HotelBookRequest, HotelBookResult } from "@/lib/tbo-hotel-book";
import type { HotelStay } from "@/lib/booking-history";

const API_KEY = process.env.RESEND_API_KEY ?? "";
/** Resend requires a verified domain; onboarding@resend.dev works for testing. */
const FROM = process.env.EMAIL_FROM || "Rise & Shine Travels <onboarding@resend.dev>";

export const emailConfigured = Boolean(API_KEY);

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

/**
 * Where a "view this" button should land. The site lives on .in; `site.url` still
 * declares .com, which serves the old static site, so a link built from it would
 * take a customer to a 2021 page instead of their booking.
 */
const ACCOUNT_URL = "https://www.riseandshinetravel.in/account";

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
    ...(amountInr != null ? [row("Amount paid", rupees(amountInr))] : []),
  ].join("");
  const html = shell(
    heading("Your flight is confirmed") +
      paragraph(`Hi ${esc(name)}, your seats are booked and ticketed.`) +
      detailsTable(rows) +
      callout(
        `Carry a government photo ID to the airport. Web check-in opens with the airline${
          result.pnr ? ` using PNR <strong>${esc(result.pnr)}</strong>` : ""
        }.`,
        "confirm",
      ) +
      button("View this booking", `${ACCOUNT_URL}`, "confirm"),
    {
      kicker: "Booking confirmed",
      tone: "confirm",
      preheader: `${req.origin} to ${req.destination} on ${formatDate(req.departDate)}${
        result.pnr ? ` · PNR ${result.pnr}` : ""
      }`,
    },
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
    ...(amountInr != null ? [row("Amount paid", rupees(amountInr))] : []),
  ].join("");
  const html = shell(
    heading("Your stay is confirmed") +
      paragraph(
        `Hi ${esc(name)}, your booking at <strong>${esc(hotelName)}</strong> is confirmed. Show this email${
          result.confirmationNo ? " and your confirmation number" : ""
        } at check-in.`,
      ) +
      detailsTable(rows) +
      callout(
        "The lead guest should carry a government photo ID. Check-in and check-out times follow the hotel's own policy.",
        "confirm",
      ) +
      button("View this booking", `${ACCOUNT_URL}`, "confirm"),
    {
      kicker: "Booking confirmed",
      tone: "confirm",
      preheader: `${hotelName}${stay.checkIn ? ` from ${formatDate(stay.checkIn)}` : ""}${
        result.confirmationNo ? ` · ${result.confirmationNo}` : ""
      }`,
    },
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
    heading("We have refunded your payment") +
      paragraph(
        `Your ${what} could not be completed, so we have refunded your payment in full${
          args.amountInr != null ? ` (<strong>${rupees(args.amountInr)}</strong>)` : ""
        }. You have not been charged for a booking you did not receive.`,
      ) +
      paragraph(
        "Refunds usually reach your account in 5&ndash;7 working days, depending on your bank.",
      ) +
      (args.reference ? detailsTable(row("Payment reference", esc(args.reference))) : "") +
      callout(
        "Want us to rebook this, or find an alternative? Reply to this email or WhatsApp us and a human will pick it up.",
        "notice",
      ),
    {
      kicker: "Payment refunded",
      tone: "notice",
      preheader: `Refunded in full${args.amountInr != null ? ` — ${rupees(args.amountInr)}` : ""}. No booking was made.`,
    },
  );
  return { subject: `Your payment has been refunded — ${what} not completed`, html };
}


// ── account ──────────────────────────────────────────────────────────────────

/**
 * Sent once, after a customer creates an account.
 *
 * Deliberately NOT a "confirm your email" mail — that one is Supabase Auth's,
 * and it must stay Supabase's, because only Supabase can mint the confirmation
 * token. See `supabase/templates/` for the branded versions of those. This is
 * the welcome that follows.
 */
export function welcomeEmail(args: { name: string; email: string }): {
  subject: string;
  html: string;
} {
  const first = args.name.trim().split(/\s+/)[0] || "there";
  const html = shell(
    heading(`Welcome aboard, ${esc(first)}`) +
      paragraph(
        "Your Rise &amp; Shine account is ready. From here you can book flights and hotels, keep your travellers' details on file for one-tap checkout, and see every trip in one place.",
      ) +
      detailsTable(
        row("Account", esc(args.email)) + row("Member since", esc(formatDate(todayInIndiaISO()))),
      ) +
      callout(
        `We have been sending people places from Ahmedabad since ${site.established}. If you would rather talk it through than fill in a form, call us &mdash; that is still the fastest way to plan something complicated.`,
        "account",
      ) +
      button("Go to my account", ACCOUNT_URL, "account"),
    {
      kicker: "Your account",
      tone: "account",
      preheader: "Your account is ready — saved travellers, faster checkout, all your trips in one place.",
    },
  );
  return { subject: `Welcome to ${site.name}, ${first}`, html };
}

/**
 * Password reset, for the day we send it ourselves.
 *
 * Today Supabase Auth sends this and owns the token, so the branded copy that is
 * actually in use lives in `supabase/templates/reset-password.html`. This exists
 * so the design system covers the email, and so a future in-app reset flow has
 * something to call. Keep the two in step if you change the wording.
 */
export function passwordResetEmail(args: { resetUrl: string; name?: string }): {
  subject: string;
  html: string;
} {
  const who = args.name?.trim().split(/\s+/)[0];
  const html = shell(
    heading("Reset your password") +
      paragraph(
        `${who ? `Hi ${esc(who)}, we` : "We"} received a request to reset the password on your Rise &amp; Shine account. Choose a new one using the button below.`,
      ) +
      button("Choose a new password", args.resetUrl, "notice") +
      callout(
        "This link expires in 60 minutes and can be used once. <strong>If you did not ask for this, ignore this email</strong> &mdash; your password stays as it is, and nobody has access to your account.",
        "notice",
      ),
    {
      kicker: "Account security",
      tone: "notice",
      preheader: "Reset your password. The link expires in 60 minutes and can be used once.",
    },
  );
  return { subject: "Reset your Rise & Shine password", html };
}

// ── marketing ────────────────────────────────────────────────────────────────

export interface OfferItem {
  /** e.g. "Kerala · 6 nights" */
  title: string;
  /** e.g. "Backwaters, Munnar tea country and two nights on the coast." */
  blurb: string;
  /** Per-person rupee price, if there is an honest one to quote. */
  fromInr?: number;
  url: string;
}

/**
 * A promotional send.
 *
 * `unsubscribeUrl` is REQUIRED, unlike every other template here. Marketing mail
 * without a working opt-out is what gets a sending domain blocked, and the
 * domain we would lose is the one carrying the company's own inbox. Prices are
 * labelled "from" and per person because that is what they are; quoting a
 * headline number the customer cannot actually book is how a travel agency
 * earns a reputation it cannot undo.
 */
export function offerEmail(args: {
  headline: string;
  intro: string;
  items: OfferItem[];
  unsubscribeUrl: string;
  name?: string;
  validUntil?: string;
}): { subject: string; html: string } {
  const who = args.name?.trim().split(/\s+/)[0];
  const cards = args.items
    .map(
      (it) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${C.cream};border:1px solid ${C.line};border-radius:12px;">
  <tr><td style="padding:16px 18px;">
    <div style="font-family:${FONT};font-size:16px;font-weight:800;color:${C.ink};">${esc(it.title)}</div>
    <div style="font-family:${FONT};font-size:13.5px;line-height:1.6;color:${C.muted};margin-top:5px;">${esc(it.blurb)}</div>
    ${
      it.fromInr != null
        ? `<div style="font-family:${FONT};font-size:13px;color:${C.inkSoft};margin-top:9px;">from <strong style="font-size:17px;color:${C.red};">${rupees(it.fromInr)}</strong> per person</div>`
        : ""
    }
    <div style="margin-top:11px;"><a href="${esc(it.url)}" style="font-family:${FONT};font-size:13.5px;font-weight:700;color:${C.red};text-decoration:none;">See the itinerary &rarr;</a></div>
  </td></tr>
</table>`,
    )
    .join("");

  const html = shell(
    heading(args.headline) +
      paragraph(`${who ? `Hi ${esc(who)}, ` : ""}${esc(args.intro)}`) +
      cards +
      (args.validUntil
        ? callout(`These fares are held until <strong>${esc(args.validUntil)}</strong>, subject to availability.`, "offer")
        : "") +
      button("Talk to a travel expert", "https://www.riseandshinetravel.in/request-a-call", "offer"),
    {
      kicker: "Offer",
      tone: "offer",
      preheader: args.intro.slice(0, 140),
      unsubscribeUrl: args.unsubscribeUrl,
    },
  );
  return { subject: args.headline, html };
}
