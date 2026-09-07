"use server";

/**
 * Enquiry form handler.
 *
 * Validates the submission and hands it to `deliverLead`, which posts it to the
 * agency's own Google Form ("Rise & Shine Travel Inquiry Form") and falls back
 * to emailing the agency inbox when that form is unreachable — see
 * lib/lead-delivery.ts for why that second leg exists. If a package key is
 * present (from a detail-page CTA), the lead is enriched with that package's
 * name, route and duration.
 *
 * It ALSO parks a voice callback, because /contact's own heading promises one
 * ("Request an instant callback … a travel expert will call you right away").
 * That copy landed in 3c5f55b; the dialer landed later in e0efd7f but only
 * behind /request-a-call, so for months this form promised a call it never
 * queued. The two legs are deliberately independent: an enquiry is delivered
 * even when no call can be placed, and a callback is queued even if the lead
 * pipeline is down — but the customer is only ever PROMISED a call when a row
 * really was parked. See lib/callback-actions.ts, which does the same for
 * /request-a-call.
 */
import { headers } from "next/headers";
import { CATALOG_PACKAGES, isCatalogPackage } from "@/data/catalog";
import { nightsToDayOption, type Lead } from "@/lib/googleForm";
import { deliverLead } from "@/lib/lead-delivery";
import { callbackDelayPhrase } from "@/lib/callback-delay";
import { enqueueCallback } from "@/lib/callback-queue";
import { rateLimit } from "@/lib/rate-limit";

export type FormState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORY_SERVICE: Record<string, string> = {
  domestic: "Domestic",
  international: "International",
  cruise: "International",
};

const JOURNEY_SERVICE: Record<string, string> = {
  Domestic: "Domestic",
  International: "International",
  Cruise: "International",
  Honeymoon: "International",
};

/**
 * A real call costs money and rings a real phone, so the callback leg is
 * throttled harder than the enquiry it rides on. Same budget /request-a-call
 * uses. Hitting it never blocks the enquiry — only the dial.
 */
const CALLBACK_MAX_PER_IP = 5;
const CALLBACK_WINDOW_MS = 10 * 60 * 1000;

async function callerIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Park a callback for this enquiry. Never throws, and its failure is never the
 * customer's problem — it only decides whether we may promise a call.
 *
 * `duplicate` counts as queued: the number already has an outstanding callback
 * (the partial unique index guarantees exactly one), so a call really is coming.
 */
async function queueCallback(name: string, phone: string): Promise<boolean> {
  try {
    const { ok } = rateLimit(
      `contact-callback:${await callerIp()}`,
      CALLBACK_MAX_PER_IP,
      CALLBACK_WINDOW_MS,
    );
    if (!ok) return false;

    const queued = await enqueueCallback({ name, phone, source: "contact-form" });
    if (queued.ok) return true;
    if (queued.reason === "duplicate") return true;
    // invalid_phone is routine here: unlike /request-a-call, this form accepts a
    // landline or an overseas number, and those are enquiries we still want.
    if (queued.reason !== "invalid_phone") {
      console.error("[contact] callback enqueue failed:", queued.message);
    }
    return false;
  } catch (e) {
    console.error("[contact] callback enqueue threw:", e);
    return false;
  }
}

export async function submitEnquiry(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const val = (k: string) => String(formData.get(k) ?? "").trim();

  const name = val("name");
  const phone = val("phone");
  const email = val("email");

  if (name.length < 2) {
    return { status: "error", message: "Please tell us your name." };
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return { status: "error", message: "Please add a valid phone number." };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { status: "error", message: "That email address doesn't look right." };
  }

  const journeyType = val("journeyType");
  const packageKey = val("package");
  const pkg = isCatalogPackage(packageKey) ? CATALOG_PACKAGES[packageKey] : null;

  // Compose the "Additional Requirements" note from message + package.
  const noteParts: string[] = [];
  const message = val("message");
  if (message) noteParts.push(message);
  if (pkg) {
    noteParts.push(
      `Enquiry via website for package: ${pkg.tourName} (${pkg.durationNights}N/${pkg.durationDays}D — ${pkg.routeSummary}).`,
    );
  }

  // Services checkbox — from journey type, else the package category.
  const services: string[] = [];
  if (JOURNEY_SERVICE[journeyType]) services.push(JOURNEY_SERVICE[journeyType]);
  else if (pkg && CATEGORY_SERVICE[pkg.category])
    services.push(CATEGORY_SERVICE[pkg.category]);

  const lead: Lead = {
    name,
    phone,
    email: email || undefined,
    destination: val("destination") || pkg?.name || undefined,
    travellers: val("travellers") || undefined,
    budget: val("budget") || undefined,
    departure: val("departure") || undefined,
    message: noteParts.join("\n") || undefined,
    services: services.length ? services : undefined,
    days: pkg ? nightsToDayOption(pkg.durationNights) : undefined,
  };

  const packageLabel = pkg ? `package ${pkg.tourName}` : journeyType || "general";

  // The callback goes first: parking a row is a single fast insert, while
  // delivery reaches out to Google and may fall through to email. On a platform
  // that kills the function at 60s, the leg that rings the customer must not be
  // the one waiting behind a slow third party.
  const called = await queueCallback(name, phone);
  const { ok: delivered } = await deliverLead(lead, `website enquiry form (${packageLabel})`);

  // Only a total loss is an error. A queued callback means a human will speak to
  // this customer even if the lead never reached the sheet, so telling them to
  // try again would double-book them.
  if (!delivered && !called) {
    return {
      status: "error",
      message:
        "We couldn't send that just now. Please try again, or reach us on WhatsApp / by phone and we'll help right away.",
    };
  }

  return {
    status: "success",
    message: called
      ? `Thanks, ${name}! Our travel expert will call you in ${callbackDelayPhrase()}. Please keep your phone nearby.`
      : "Thank you! Your enquiry has reached the Rise & Shine team. We'll be in touch very shortly.",
  };
}
