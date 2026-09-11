import Script from "next/script";

/**
 * Microsoft Clarity — session replay and heatmaps, to answer the one question
 * GA4 cannot: *where* in the checkout people give up. GA4 counts that
 * `payment_started` outnumbers `purchase`; Clarity shows the field they were
 * on when they left.
 *
 * Renders nothing without `NEXT_PUBLIC_CLARITY_ID`, so local and preview runs
 * record nothing and the production build still succeeds with no credentials —
 * the same shape as the GA4 tag beside it.
 *
 * **Privacy.** These forms carry passport, PAN, date of birth and address.
 * Two layers keep that out of Clarity:
 *
 * 1. Clarity masks the contents of every `<input>` and `<select>` in ALL
 *    masking modes, and that is not configurable — so what a traveller TYPES
 *    is never uploaded, whatever the dashboard is set to.
 * 2. Text we RENDER is not covered by that rule: a voucher prints the
 *    passenger's name and PNR, the account page lists saved travellers and
 *    addresses. Those pages carry `data-clarity-mask="True"` on a wrapper, which
 *    masks the node and its children and overrides the dashboard setting.
 *
 * Keep the project's masking mode on Balanced or Strict. Relaxed unmasks
 * rendered content everywhere, and layer 2 becomes the only thing standing
 * between a session recording and a passport number.
 *
 * `afterInteractive` deliberately: replay is diagnostics, and it must never sit
 * in front of a fare search or the Cashfree popup.
 */
export function Clarity() {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID;
  if (!id) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", ${JSON.stringify(id)});`}
    </Script>
  );
}
