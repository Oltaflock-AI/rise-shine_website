"use server";

/**
 * "Request a call" handler — the entry point behind /request-a-call.
 *
 * It deliberately does NOT dial. It validates, throttles, and parks the lead in
 * the `callback_queue` table; `/api/cron/callback-queue` places the actual
 * ElevenLabs call once `due_at` passes. See lib/callback-queue.ts for why.
 *
 * The lead is also mirrored to the agency's existing lead pipeline (Google Form,
 * falling back to email — see lib/lead-delivery.ts) on a best-effort basis, so a
 * lead is never invisible to staff just because the robot call failed — but a
 * delivery outage must never cost us the callback, so that leg is
 * fire-and-forget and its failure is only logged.
 */
import { headers } from "next/headers";
import type { FormState } from "@/lib/actions";
import { deliverLead } from "@/lib/lead-delivery";
import { rateLimit } from "@/lib/rate-limit";
import { callbackDelayPhrase } from "@/lib/callback-delay";
import { enqueueCallback } from "@/lib/callback-queue";

/** A real call costs money and rings a real phone — throttle harder than a form. */
const MAX_PER_IP = 5;
const WINDOW_MS = 10 * 60 * 1000;

async function callerIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Mirror the lead into the agency's Google Sheet (or inbox). Never throws. */
async function mirrorLead(name: string, phone: string): Promise<void> {
  try {
    await deliverLead(
      {
        name,
        phone,
        message: "Requested an automated callback from the website (/request-a-call).",
      },
      "request-a-call",
    );
  } catch (e) {
    console.error("[request-a-call] lead mirror failed:", e);
  }
}

export async function requestCallback(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) {
    return { status: "error", message: "Please tell us your name." };
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return { status: "error", message: "Please enter a valid 10-digit mobile number." };
  }

  const { ok } = rateLimit(`request-callback:${await callerIp()}`, MAX_PER_IP, WINDOW_MS);
  if (!ok) {
    return {
      status: "error",
      message:
        "That's a few requests in a short time. Please wait a little, or call us directly and we'll help right away.",
    };
  }

  const queued = await enqueueCallback({ name, phone, source: "request-a-call" });

  if (!queued.ok) {
    switch (queued.reason) {
      case "duplicate":
        return {
          status: "success",
          message:
            "You're already in the queue for that number — keep your phone handy, it'll ring any moment now.",
        };
      case "invalid_phone":
        return {
          status: "error",
          message: "That number doesn't look like a mobile we can call. Please check and try again.",
        };
      default:
        // Misconfiguration or a database problem: never blame the customer, and
        // never claim a call is coming when nothing was queued.
        console.error("[request-a-call] enqueue failed:", queued.message);
        return {
          status: "error",
          message:
            "We couldn't set up your callback just now. Please try again, or reach us on WhatsApp and we'll help right away.",
        };
    }
  }

  await mirrorLead(name, phone);

  return {
    status: "success",
    message: `Thanks, ${name}! Our travel expert will call you in ${callbackDelayPhrase()}. Please keep your phone nearby.`,
  };
}
