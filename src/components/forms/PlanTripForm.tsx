"use client";

import { useActionState } from "react";
import { submitEnquiry } from "@/lib/actions";
import { site } from "@/data/site";
import { Button } from "../ui/Button";
import { Field, FormNote, controlClass, initialFormState } from "./controls";
import { cn } from "@/lib/cn";

export function PlanTripForm({
  defaultDestination = "",
}: {
  defaultDestination?: string;
}) {
  const [state, action, pending] = useActionState(
    submitEnquiry,
    initialFormState,
  );

  return (
    <form
      action={action}
      className="rounded-brand-lg border border-line bg-white p-7 shadow-brand sm:p-10"
    >
      <h2 className="h-md mb-1.5">Your trip details</h2>
      <p className="mb-6 text-muted">
        The more you tell us, the better we can tailor your plan.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required htmlFor="t-name">
          <input
            id="t-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            className={controlClass}
          />
        </Field>
        <Field label="Phone / WhatsApp" required htmlFor="t-phone">
          <input
            id="t-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="+91"
            className={controlClass}
          />
        </Field>
        <Field label="Email" required htmlFor="t-email">
          <input
            id="t-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            className={controlClass}
          />
        </Field>
        <Field label="Journey type" htmlFor="t-type">
          <select
            id="t-type"
            name="journeyType"
            defaultValue="Domestic"
            className={controlClass}
          >
            <option>Domestic</option>
            <option>International</option>
            <option>Cruise</option>
            <option>Honeymoon</option>
            <option>Group / Corporate</option>
          </select>
        </Field>
        <Field label="Destination" htmlFor="t-dest">
          <input
            id="t-dest"
            name="destination"
            type="text"
            defaultValue={defaultDestination}
            placeholder="e.g. Bali, Kerala, Dubai"
            className={controlClass}
          />
        </Field>
        <Field label="Approx. departure date" htmlFor="t-date">
          <input
            id="t-date"
            name="departure"
            type="date"
            className={controlClass}
          />
        </Field>
        <Field label="Number of travellers" htmlFor="t-pax">
          <select
            id="t-pax"
            name="travellers"
            defaultValue="2"
            className={controlClass}
          >
            <option>1</option>
            <option>2</option>
            <option>3–4</option>
            <option>5+</option>
          </select>
        </Field>
        <Field label="Budget per person (₹)" htmlFor="t-budget">
          <select
            id="t-budget"
            name="budget"
            defaultValue="25,000 – 50,000"
            className={controlClass}
          >
            <option>Under 25,000</option>
            <option>25,000 – 50,000</option>
            <option>50,000 – 1,00,000</option>
            <option>1,00,000+</option>
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Tell us about your ideal trip" htmlFor="t-message">
          <textarea
            id="t-message"
            name="message"
            rows={4}
            placeholder="Interests, must-sees, special occasions, dietary needs, anything else…"
            className={cn(controlClass, "min-h-28 resize-y")}
          />
        </Field>
      </div>

      <Button type="submit" fullWidth arrow disabled={pending} className="mt-6">
        {pending ? "Sending…" : "Get My Free Itinerary"}
      </Button>
      <FormNote state={state} />

      <p className="mt-4 text-center text-[0.84rem] text-muted">
        Or call us directly at{" "}
        <a
          href={site.phone.landlineHref}
          className="font-semibold text-red hover:underline"
        >
          {site.phone.landlineDisplay}
        </a>
      </p>
    </form>
  );
}
