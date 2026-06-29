"use client";

import { useActionState } from "react";
import { submitEnquiry } from "@/lib/actions";
import { Button } from "../ui/Button";
import { Field, FormNote, controlClass, initialFormState } from "./controls";
import { cn } from "@/lib/cn";

export function ContactForm() {
  const [state, action, pending] = useActionState(
    submitEnquiry,
    initialFormState,
  );

  return (
    <form
      action={action}
      className="rounded-brand-lg border border-line bg-white p-7 shadow-brand sm:p-10"
    >
      <h2 className="h-md mb-1.5">Send us a message</h2>
      <p className="mb-6 text-muted">
        Fill in the form and we&apos;ll get back to you shortly.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="c-name">
          <input
            id="c-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            className={controlClass}
          />
        </Field>
        <Field label="Phone" required htmlFor="c-phone">
          <input
            id="c-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="+91"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Email" htmlFor="c-email">
          <input
            id="c-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@email.com"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Subject" htmlFor="c-subject">
          <input
            id="c-subject"
            name="subject"
            type="text"
            placeholder="How can we help?"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Message" htmlFor="c-message">
          <textarea
            id="c-message"
            name="message"
            rows={5}
            placeholder="Tell us a little about your travel plans…"
            className={cn(controlClass, "min-h-32 resize-y")}
          />
        </Field>
      </div>

      <Button type="submit" fullWidth arrow disabled={pending} className="mt-6">
        {pending ? "Sending…" : "Send Message"}
      </Button>
      <FormNote state={state} />
    </form>
  );
}
