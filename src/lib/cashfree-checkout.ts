"use client";

/**
 * Cashfree Checkout — BROWSER side.
 *
 * Loads Cashfree's hosted `cashfree.js` v3 and opens the popup checkout for a
 * `payment_session_id` minted server-side by /api/payment/order (or the hotel
 * equivalent). The hosted script rather than `@cashfreepayments/cashfree-js` because
 * that package ships no type declarations, which TypeScript strict rejects — this
 * keeps the surface small, typed by us, and matches how the repo loads third-party
 * scripts elsewhere.
 *
 * Nothing secret passes through here. A `payment_session_id` is single-order and
 * short-lived, and Cashfree has no publishable key to embed, so the browser holds no
 * credential at all. The result of `checkout()` is likewise NOT proof of payment —
 * only the server's Get Order call is (see lib/cashfree.ts confirmPaidOrder).
 */

const SDK_SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

export type CashfreeMode = "sandbox" | "production";

/** What `cashfree.checkout()` resolves with. Every field is optional and untrusted. */
export type CheckoutResult = {
  /** Set when the customer closed the popup OR the payment errored. */
  error?: { message?: string; code?: string };
  /** Set when the flow had to leave the page (in-app browsers). */
  redirect?: boolean;
  /** Set once the attempt finished, whatever its status. Informational only. */
  paymentDetails?: { paymentMessage?: string };
};

type CashfreeInstance = {
  checkout: (o: { paymentSessionId: string; redirectTarget?: string }) => Promise<CheckoutResult>;
};

declare global {
  interface Window {
    Cashfree?: (o: { mode: CashfreeMode }) => CashfreeInstance;
  }
}

/** Inject cashfree.js once; resolves false if it can't load. */
function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Cashfree) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Open the popup checkout and resolve once the customer is done with it.
 *
 * `mode` MUST be the one the order was created in — a sandbox session id will not
 * open in a production SDK — so it comes from the order response, never a constant.
 * Returns null when the script could not be loaded at all.
 *
 * `redirectTarget: "_modal"` keeps the customer on our page so the React state behind
 * the form survives; the caller then asks the SERVER whether the order is paid.
 */
export async function openCashfreeCheckout(args: {
  mode: CashfreeMode;
  paymentSessionId: string;
}): Promise<CheckoutResult | null> {
  const ready = await loadScript();
  if (!ready || !window.Cashfree) return null;
  const cashfree = window.Cashfree({ mode: args.mode });
  return cashfree.checkout({ paymentSessionId: args.paymentSessionId, redirectTarget: "_modal" });
}
