import "server-only";

/**
 * Lead delivery — one door for every enquiry the site collects.
 *
 * The agency's own Google Form is still the primary pipeline (leads land in
 * their sheet, where staff already work). But the form is theirs, not ours, and
 * a settings change on their side can close it without warning: on 01-Sep-2026
 * "Collect email addresses → Verified" was switched on, which makes
 * `formResponse` demand a signed-in Google session, so every unauthenticated
 * server POST answered `401` and `GET` redirected to `accounts.google.com`.
 * Every enquiry from /contact and /plan-my-trip was lost with an apology, and
 * the callback mirror went silently missing too.
 *
 * So delivery is now two-legged: post to the form, and if that fails for any
 * reason, email the lead to the agency inbox through the same Resend transport
 * as transactional mail. A lead is "delivered" if EITHER leg succeeds — the
 * customer is only ever told we failed when both did.
 */

import { site } from "@/data/site";
import { GOOGLE_FORM, buildFormBody, type Lead } from "@/lib/googleForm";
import { emailConfigured, sendEmail } from "@/lib/email";
import { detailsTable, esc, heading, paragraph, row, shell } from "@/lib/email-brand";
import { formatDate } from "@/lib/format-date";

/** Where a fallback lead lands. Same inbox ops alerts use. */
const LEAD_TO = process.env.ALERT_EMAIL || site.email;

export type LeadChannel = "google-form" | "email" | "none";

export type DeliveryResult = {
  /** True when at least one channel accepted the lead. */
  ok: boolean;
  /** Channels that accepted it, in the order tried. */
  delivered: LeadChannel[];
};

/** POST the lead to the agency's Google Form. Returns false instead of throwing. */
async function postToGoogleForm(lead: Lead): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_FORM.responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildFormBody(lead).toString(),
      // Google responds with an HTML confirmation page; we don't need to read it.
      cache: "no-store",
      redirect: "manual",
    });
    // Google answers 200 on success. A 3xx is its post-submit redirect and is
    // also a success — but a redirect to accounts.google.com is the sign-in
    // wall, not a submission, so only same-host redirects count.
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location") ?? "";
      return !to.includes("accounts.google.com");
    }
    return res.ok;
  } catch (e) {
    console.error("[lead] Google Form POST threw:", e);
    return false;
  }
}

/** Render the lead as the agency-facing email used when the form is unreachable. */
export function leadEmail(lead: Lead, context: string): { subject: string; html: string } {
  const rows = [
    row("Name", esc(lead.name)),
    row("Phone", `<a href="tel:${esc(lead.phone)}" style="color:inherit;">${esc(lead.phone)}</a>`),
    ...(lead.email
      ? [row("Email", `<a href="mailto:${esc(lead.email)}" style="color:inherit;">${esc(lead.email)}</a>`)]
      : []),
    ...(lead.destination ? [row("Destination", esc(lead.destination))] : []),
    ...(lead.departure ? [row("Travel date", esc(formatDate(lead.departure)))] : []),
    ...(lead.days ? [row("Duration", esc(lead.days))] : []),
    ...(lead.travellers ? [row("Travellers", esc(lead.travellers))] : []),
    ...(lead.budget ? [row("Budget", esc(lead.budget))] : []),
    ...(lead.services?.length ? [row("Services", esc(lead.services.join(", ")))] : []),
    ...(lead.message
      ? [row("Requirements", esc(lead.message).replace(/\n/g, "<br>"))]
      : []),
    row("Source", esc(context)),
  ].join("");

  return {
    subject: `New enquiry · ${lead.name} · ${lead.phone}`,
    html: shell(
      heading("A new enquiry came in") +
        paragraph(
          "This lead reached the site but could not be written to the Google Form, " +
            "so it is being delivered by email instead. Please add it to the sheet by hand.",
        ) +
        detailsTable(rows),
      {
        kicker: "Website enquiry",
        tone: "notice",
        preheader: `${lead.name} · ${lead.phone}${lead.destination ? ` · ${lead.destination}` : ""}`,
      },
    ),
  };
}

/**
 * Deliver a lead. Never throws.
 *
 * @param context Where the lead came from, shown to staff in the fallback email.
 */
export async function deliverLead(lead: Lead, context: string): Promise<DeliveryResult> {
  const delivered: LeadChannel[] = [];

  if (await postToGoogleForm(lead)) delivered.push("google-form");
  else console.error(`[lead] Google Form rejected a lead from ${context} — falling back to email.`);

  // The email leg runs only as a fallback: staff should not get two copies of
  // every lead once the form is healthy again.
  if (delivered.length === 0 && emailConfigured) {
    try {
      const { subject, html } = leadEmail(lead, context);
      await sendEmail({ to: LEAD_TO, subject, html });
      delivered.push("email");
    } catch (e) {
      console.error("[lead] fallback email failed:", e);
    }
  }

  if (delivered.length === 0) {
    console.error("[lead] LEAD LOST — no channel accepted it:", {
      name: lead.name,
      phone: lead.phone,
      context,
    });
  }

  return { ok: delivered.length > 0, delivered };
}
