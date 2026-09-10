"use client";

/**
 * GA4 funnel events, no-op when GA isn't mounted. The <GoogleAnalytics> tag in
 * the root layout renders only when NEXT_PUBLIC_GA_ID is set, so call sites
 * never need to check config — an unmounted GA just drops the event (the
 * try/catch swallows @next/third-parties' "not initialized" path).
 *
 * Funnel: search → checkout_opened → payment_started → purchase + booking_completed,
 * each tagged { kind: "flight" | "hotel" }.
 */

import { sendGAEvent } from "@next/third-parties/google";

/**
 * GA4 accepts nested arrays/objects on ecommerce events (`items`), so the value
 * type is wider than the scalar-only funnel events need.
 */
type EventParams = Record<string, unknown>;

export function trackEvent(name: string, params: EventParams = {}): void {
  try {
    sendGAEvent("event", name, params);
  } catch {
    /* GA absent — nothing to record */
  }
}

export type PurchaseInput = {
  /**
   * The Cashfree order id where there is one — it is unique per Create Order, so
   * GA discards a duplicate when a customer reloads the confirmation page. Falls
   * back to the supplier reference (PNR / confirmation no) on the certification
   * hosts, where a hotel can be booked without a gateway.
   */
  transactionId: string;
  /**
   * Rupees, 2 dp — the same confirmed total the customer was charged (Cashfree
   * takes rupees, not paise, so there is no ×100 here either).
   */
  value: number;
  kind: "flight" | "hotel";
  itemName: string;
};

/**
 * GA4's recommended `purchase` event. Named exactly that because GA reserves it:
 * the Monetisation reports, revenue-per-channel and `transaction_id` de-duplication
 * only switch on for this name — a custom "booking_confirmed" is counted but never
 * carries money.
 *
 * A plain `booking_completed` is sent beside it. Reserved ecommerce events are
 * processed differently from custom ones and on 10-Sep-2026 `purchase` hits that
 * GA acknowledged (204) never surfaced in Realtime or DebugView while
 * `checkout_opened` did — so the funnel count must not depend on `purchase`
 * alone. Mark `booking_completed` a Key event in GA; it is the conversion count.
 */
export function trackPurchase({
  transactionId,
  value,
  kind,
  itemName,
}: PurchaseInput): void {
  trackEvent("purchase", {
    transaction_id: transactionId,
    value,
    currency: "INR",
    kind,
    items: [
      {
        item_id: `${kind}:${itemName}`,
        item_name: itemName,
        item_category: kind,
        price: value,
        quantity: 1,
      },
    ],
  });
  trackEvent("booking_completed", {
    kind,
    transaction_id: transactionId,
    value,
    currency: "INR",
  });
}
