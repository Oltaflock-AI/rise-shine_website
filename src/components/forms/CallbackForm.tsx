"use client";

import { useActionState } from "react";
import { PhoneCall } from "lucide-react";
import { requestCallback } from "@/lib/callback-actions";
import { Button } from "../ui/Button";
import { Field, FormNote, controlClass, initialFormState } from "./controls";

/**
 * Name + phone, nothing else. The agent collects destination, dates and party
 * size on the call itself — every extra field here is a lead we don't get.
 *
 * `delayPhrase` is passed in from the server page rather than read here, so the
 * copy always matches VOICE_CALLBACK_DELAY_SECONDS without exposing it as a
 * NEXT_PUBLIC_ variable.
 */
export function CallbackForm({ delayPhrase }: { delayPhrase: string }) {
  const [state, action, pending] = useActionState(requestCallback, initialFormState);

  return (
    <form
      action={action}
      className="rounded-brand-lg border border-line bg-white p-7 shadow-brand sm:p-10"
    >
      <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-red/10 px-3.5 py-1.5 text-meta font-semibold text-red-deep">
        <PhoneCall size={15} strokeWidth={2.4} aria-hidden />
        We call you in {delayPhrase}
      </div>

      <h2 className="h-md mb-1.5">Get a callback</h2>
      <p className="mb-6 text-muted">
        Leave your name and number — our travel expert will ring you in{" "}
        {delayPhrase} to plan your trip. No forms to fill, no waiting on hold.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="cb-name">
          <input
            id="cb-name"
            name="name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Your name"
            className={controlClass}
          />
        </Field>
        <Field label="Mobile number" required htmlFor="cb-phone">
          <input
            id="cb-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="+91 98765 43210"
            aria-describedby="cb-phone-hint"
            className={controlClass}
          />
        </Field>
      </div>

      <p id="cb-phone-hint" className="mt-2.5 text-[0.82rem] text-muted">
        Indian mobile numbers only. We&apos;ll call this number once — we never
        share it or use it for marketing.
      </p>

      <Button type="submit" fullWidth arrow disabled={pending} className="mt-6">
        {pending ? "Setting up your call…" : "Call me"}
      </Button>
      <FormNote state={state} />
    </form>
  );
}
