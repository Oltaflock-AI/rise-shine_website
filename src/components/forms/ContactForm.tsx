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
      <h2 className="h-md mb-1.5">Request an instant callback</h2>
      <p className="mb-6 text-muted">
        Share your details and a travel expert will call you right away to help
        with your enquiry.
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
            inputMode="tel"
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
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="email"
            placeholder="you@email.com"
            className={controlClass}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Message (optional)" htmlFor="c-message">
          <textarea
            id="c-message"
            name="message"
            rows={5}
            placeholder="Anything you'd like us to know before we call…"
            className={cn(controlClass, "min-h-32 resize-y")}
          />
        </Field>
      </div>

      <Button type="submit" fullWidth arrow disabled={pending} className="mt-6">
        {pending ? "Sending…" : "Request Callback"}
      </Button>
      <FormNote state={state} />
    </form>
  );
}
