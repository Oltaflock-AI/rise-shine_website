import type { ReactNode } from "react";

/**
 * Hide everything inside from session replay.
 *
 * Microsoft Clarity masks what a visitor TYPES — input and select contents are
 * masked in every masking mode, and that part is not configurable. It does not
 * mask what we RENDER, and these pages render plenty: a voucher prints the
 * guest's name and the hotel's confirmation number, the account page lists
 * saved travellers and addresses, a checkout summary repeats the lead
 * passenger back at them.
 *
 * `data-clarity-mask="True"` masks the node and all of its children and
 * overrides whatever the Clarity dashboard is set to, so this holds even if
 * someone later switches the project to Relaxed.
 *
 * The wrapper is `display: contents`, so it adds a DOM node for Clarity to
 * match on and contributes nothing to layout — the children keep their place in
 * the parent's flex or grid exactly as if it were not here.
 *
 * It renders regardless of whether Clarity is configured: the attribute is
 * inert without it, and a page that quietly stopped being masked because an
 * env var was unset is the failure this is here to prevent.
 */
export function MaskedFromReplay({ children }: { children: ReactNode }) {
  return (
    <div data-clarity-mask="True" className="contents">
      {children}
    </div>
  );
}
