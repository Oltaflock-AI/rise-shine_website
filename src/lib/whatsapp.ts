import { site } from "@/data/site";

/**
 * Every WhatsApp link on the site goes through here.
 *
 * The agency's mobile is not always registered on WhatsApp — it was not when
 * 8866010022 replaced the old number — and a `wa.me` link to an unregistered
 * number does not fail quietly: it opens WhatsApp on an error screen. That is a
 * worse experience than never showing the button, so the affordances come out
 * entirely rather than pointing somewhere broken.
 *
 * `site.phone.whatsappEnabled` is the single switch. Flipping it to true brings
 * back the float button, the footer icon, every "WhatsApp Us" button, and the
 * deep links that carry a pre-written message.
 */
export const whatsappEnabled = site.phone.whatsappEnabled;

/**
 * A wa.me deep link, or `null` when WhatsApp is off — callers must handle null
 * by hiding the control. Returning null rather than "" keeps the compiler
 * involved: an unhandled case shows up as a type error, not a dead link.
 */
export function waHref(text?: string): string | null {
  if (!whatsappEnabled) return null;
  const base = `https://wa.me/${site.phone.whatsapp}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * A contact link that always resolves: WhatsApp when it is available, otherwise
 * email with the same message pre-filled.
 *
 * For the places where WhatsApp is not a convenience but the only route —
 * requesting a flight cancellation from the account page, asking about a
 * booking — losing the link would strand the customer. The subject doubles as
 * the label hint so the button can say "Email us" instead of "WhatsApp us".
 */
export function contactHref(text: string, subject: string): { href: string; via: "whatsapp" | "email" } {
  const wa = waHref(text);
  if (wa) return { href: wa, via: "whatsapp" };
  return {
    href: `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
    via: "email",
  };
}
