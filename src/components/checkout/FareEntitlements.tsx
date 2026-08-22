"use client";

/**
 * "What am I actually buying?" — rendered on the checkout page from the CONFIRMED
 * FareQuote, above the passenger form.
 *
 * Search-card facts are provisional: FareQuote can re-price and even hand back a
 * different ResultIndex, so baggage and refund rules are re-read here rather than
 * carried through the URL. Everything is TBO's own wording; nothing is summarised.
 */
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, Info, Luggage, ShieldAlert } from "lucide-react";
import { BaggageSummary, FareInclusions, FarePolicyTable } from "@/components/ui/fare-info";
import { formatDate } from "@/lib/format-date";
import type { QuoteDetails } from "@/lib/tbo-book";
import { cn } from "@/lib/cn";

const fmtTime = (iso: string) => (iso || "").slice(11, 16);

export function FareEntitlements({ details }: { details: QuoteDetails }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const hasRuleDocs = details.fareRules.length > 0;

  return (
    <div className="space-y-6">
      {/* ── baggage ── */}
      <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
        <h3 className="mb-1 flex items-center gap-2 text-[0.95rem] font-bold text-ink">
          <Luggage className="h-4 w-4 text-red" aria-hidden /> Baggage &amp; what&apos;s included
        </h3>
        <p className="mb-4 text-[0.88rem] text-muted">
          Allowance is per passenger, as confirmed by the airline for this fare.
        </p>

        <ul className="space-y-3">
          {details.segments.map((s, i) => (
            <li key={`${s.flightNumber}-${i}`} className="rounded-brand border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[0.9rem] font-semibold text-ink">
                  {s.from} → {s.to}
                </span>
                <span className="text-[0.82rem] text-muted">
                  {s.flightNumber}
                  {s.cabinClass ? ` · ${s.cabinClass}` : ""}
                  {s.depTime ? ` · ${fmtTime(s.depTime)}–${fmtTime(s.arrTime)}` : ""}
                </span>
              </div>
              <BaggageSummary className="mt-2" checkedIn={s.checkedIn} cabin={s.cabin} />
            </li>
          ))}
        </ul>

        {details.fareInclusions.length > 0 && (
          <div className="mt-4">
            <FareInclusions items={details.fareInclusions} />
          </div>
        )}

        {details.ticketAdvisory && (
          <p className="mt-4 flex items-start gap-2 rounded-brand bg-cream-2 px-3 py-2 text-[0.88rem] text-ink">
            <Info className="mt-[2px] h-3.5 w-3.5 flex-none text-muted" aria-hidden />
            {details.ticketAdvisory}
          </p>
        )}

        <p className="mt-4 text-[0.82rem] text-muted">
          Extra baggage can be added by the airline at the airport, at their published
          rates. Need more allowance booked in advance? Call us before you pay.
        </p>
      </div>

      {/* ── refund / change rules ── */}
      <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
        <h3 className="mb-1 flex items-center gap-2 text-[0.95rem] font-bold text-ink">
          <ShieldAlert className="h-4 w-4 text-red" aria-hidden /> Cancellation &amp; date change
        </h3>
        <p className="mb-4 text-[0.88rem] text-muted">
          {details.isRefundable
            ? "This is a refundable fare — the airline keeps a cancellation charge and refunds the rest."
            : "This is a non-refundable fare. Cancelling forfeits the fare; some government taxes may still come back."}
        </p>

        {details.miniRules.length > 0 ? (
          <FarePolicyTable rules={details.miniRules} />
        ) : hasRuleDocs ? (
          <p className="text-[0.88rem] text-muted">
            The airline published no penalty grid for this fare — the full rules below
            are the binding version.
          </p>
        ) : (
          <p className="text-[0.88rem] text-muted">
            The airline has not published its cancellation charges through our booking
            system for this fare. Call us before you pay and we will confirm them with
            the airline.
          </p>
        )}

        {details.lastTicketDate && (
          <p className="mt-3 text-[0.82rem] text-muted">
            Hold expires {formatDate(details.lastTicketDate)} — after that the airline may
            re-price this fare.
          </p>
        )}

        {hasRuleDocs && (
          <>
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="mt-4 inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-red hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden />
              {rulesOpen ? "Hide the airline's full fare rules" : "Read the airline's full fare rules"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", rulesOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {rulesOpen && (
              <div className="mt-3 space-y-4">
                {details.fareRules.map((r, i) => (
                  <div key={i} className="rounded-brand border border-line bg-cream-2/60 p-3">
                    <p className="mb-2 text-[0.88rem] font-semibold text-ink">
                      {r.origin} → {r.destination}
                      {r.airline ? ` · ${r.airline}` : ""}
                      {r.fareBasisCode ? ` · fare basis ${r.fareBasisCode}` : ""}
                    </p>
                    {/* Sanitised server-side by lib/fare-rules.ts — allowlisted tags only. */}
                    <div
                      className="fare-rule-html max-h-80 overflow-y-auto text-[0.88rem] leading-relaxed text-ink"
                      dangerouslySetInnerHTML={{ __html: r.html }}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <p className="mt-4 text-[0.82rem] text-muted">
          Airline charges above are in addition to our service fee. See our{" "}
          <Link href="/refund-policy" className="font-semibold text-red hover:underline">
            cancellation &amp; refund policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="font-semibold text-red hover:underline">
            terms
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
