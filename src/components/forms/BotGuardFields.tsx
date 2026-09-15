"use client";

import { HONEYPOT_FIELD, RENDERED_AT_FIELD } from "@/lib/bot-guard";

/**
 * Hidden fields the server-side bot screen reads — see lib/bot-guard.ts.
 *
 * The honeypot is hidden by CSS, not `type="hidden"`: form-fillers skip hidden
 * inputs but happily fill a text input they cannot see. `tabIndex={-1}` and
 * `aria-hidden` keep it out of keyboard and screen-reader flow, and
 * `autoComplete="off"` stops a browser's own address book from tripping it.
 *
 * The timestamp is stamped by a ref callback, which React runs only in the
 * browser after hydration — so the server renders it empty, and a form posted
 * without it never had our JS run. (A ref, not an effect + state: the value
 * is read by the form, never by React, so there is nothing to re-render.)
 */
function stampRenderedAt(el: HTMLInputElement | null) {
  if (el && !el.value) el.value = String(Date.now());
}

export function BotGuardFields() {

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
      >
        <label htmlFor={HONEYPOT_FIELD}>Company website</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input type="hidden" name={RENDERED_AT_FIELD} defaultValue="" ref={stampRenderedAt} />
    </>
  );
}
