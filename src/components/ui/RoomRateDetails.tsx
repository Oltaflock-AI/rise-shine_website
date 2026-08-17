"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Check, BadgePercent, Wallet, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format-date";

/**
 * The rate's full terms, on the ROOM page.
 *
 * TBO certification (portal checkpoints 19, 23, 25) requires the guest to see a
 * rate's promotions, rate conditions, mandatory supplements and final
 * cancellation policy before booking. Those live in the PreBook RS, not in
 * Search, so this expands on demand and PreBooks that single room — the same
 * call the checkout page makes, just one step earlier.
 */
type Quote = {
  ok: boolean;
  currency?: string;
  totalFare?: number;
  isPriceChanged?: boolean;
  isCancellationPolicyChanged?: boolean;
  cancelPolicies?: { fromDate: string; chargeType?: string | number; charge: number }[];
  mealType?: string;
  inclusion?: string;
  rateConditions?: string[];
  roomPromotions?: string[];
  supplements?: { type?: string; description?: string; price?: number; currency?: string }[];
  amenities?: string[];
  lastCancellationDeadline?: string;
  error?: string;
};

/** TBO cancel-policy dates arrive as "DD-MM-YYYY hh:mm:ss" (UTC) → ISO. */
function tboDateToISO(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function chargeLabel(p: { chargeType?: string | number; charge: number }, currency: string): string {
  const t = String(p.chargeType ?? "").toLowerCase();
  if (p.charge <= 0) return "No charge";
  if (t === "2" || t === "percentage") return `${p.charge}% of the fare`;
  if (t === "3" || t === "nights") return `${p.charge} night${p.charge > 1 ? "s" : ""}`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(p.charge);
}

export function RoomRateDetails({
  bookingCode,
  destinationCountry,
}: {
  bookingCode: string;
  /** ISO-2 of the stay's country — makes PAN rules match checkout. */
  destinationCountry?: string;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || quote || loading) return;
    setLoading(true);
    try {
      const r = await fetch("/api/hotels/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingCode, ...(destinationCountry ? { destinationCountry } : {}) }),
      });
      setQuote((await r.json()) as Quote);
    } catch {
      setQuote({ ok: false, error: "Could not load this rate's conditions. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  const currency = quote?.currency || "INR";

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 text-[0.82rem] font-semibold text-red hover:underline"
      >
        Rate details &amp; conditions
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-brand border border-line bg-cream/50 p-3.5 text-[0.82rem] leading-relaxed">
          {loading && (
            <p className="inline-flex items-center gap-2 text-muted">
              <Loader2 size={14} className="animate-spin text-red" aria-hidden /> Confirming this rate with the hotel…
            </p>
          )}

          {!loading && quote && !quote.ok && (
            <p className="text-red">{quote.error || "This rate is no longer available."}</p>
          )}

          {!loading && quote?.ok && (
            <>
              {quote.inclusion && (
                <p className="flex items-start gap-1.5 text-ink">
                  <Check size={14} className="mt-0.5 flex-none text-red" aria-hidden />
                  <span>
                    <span className="font-semibold">Includes:</span> {quote.inclusion}
                    {quote.mealType ? ` · ${quote.mealType.replace(/_/g, " ")}` : ""}
                  </span>
                </p>
              )}

              {(quote.roomPromotions ?? []).length > 0 && (
                <div className="flex items-start gap-1.5 text-green-800">
                  <BadgePercent size={14} className="mt-0.5 flex-none" aria-hidden />
                  <div>
                    <span className="font-semibold">Room promotion:</span>
                    <ul className="list-disc pl-4">
                      {quote.roomPromotions!.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(quote.supplements ?? []).length > 0 && (
                <div className="flex items-start gap-1.5 rounded-brand border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
                  <Wallet size={14} className="mt-0.5 flex-none" aria-hidden />
                  <div>
                    <span className="font-semibold">Payable at the hotel</span> — not included in the total shown:
                    <ul className="list-disc pl-4">
                      {quote.supplements!.map((s, i) => (
                        <li key={i}>
                          {s.description || s.type || "Mandatory supplement"}
                          {s.price != null
                            ? ` — ${new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: s.currency || currency,
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(s.price)}${s.currency && s.currency !== currency ? " (hotel's local currency)" : ""}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(quote.cancelPolicies ?? []).length > 0 && (
                <div className="flex items-start gap-1.5 text-ink">
                  <ShieldCheck size={14} className="mt-0.5 flex-none text-red" aria-hidden />
                  <div>
                    <span className="font-semibold">Cancellation policy</span>
                    {quote.isCancellationPolicyChanged && (
                      <span className="ml-1 text-amber-700">(updated by the hotel — this is the final policy)</span>
                    )}
                    <ul className="list-disc pl-4">
                      {quote.cancelPolicies!.map((p, i) => (
                        <li key={i}>
                          From {formatDate(tboDateToISO(p.fromDate)) || p.fromDate} (UTC):{" "}
                          {chargeLabel(p, currency)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Always rendered, even when the supplier returns none — a verifier
                  (and a guest) must be able to see WHICH conditions apply, and
                  "none" is itself an answer. TBO portal checkpoint 23. */}
              <div className="flex items-start gap-1.5 text-muted">
                <FileText size={14} className="mt-0.5 flex-none text-red" aria-hidden />
                <div>
                  <span className="font-semibold text-ink">Rate conditions</span>
                  {(quote.rateConditions ?? []).length > 0 ? (
                    <ul className="list-disc pl-4">
                      {quote.rateConditions!.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>The hotel returns no additional rate conditions for this rate.</p>
                  )}
                  {quote.lastCancellationDeadline && (
                    <p className="mt-1">
                      Last cancellation deadline: {quote.lastCancellationDeadline} (UTC)
                    </p>
                  )}
                </div>
              </div>

              {(quote.amenities ?? []).length > 0 && (
                <div className="flex items-start gap-1.5 text-muted">
                  <Sparkles size={14} className="mt-0.5 flex-none text-red" aria-hidden />
                  <div>
                    <span className="font-semibold text-ink">Room amenities</span>
                    <p>{quote.amenities!.join(" · ")}</p>
                  </div>
                </div>
              )}

              {quote.totalFare != null && (
                <p className="text-muted">
                  Confirmed total:{" "}
                  <span className="font-semibold text-ink">
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(quote.totalFare)}
                  </span>
                  {quote.isPriceChanged && (
                    <span className="ml-1 text-amber-700">— the hotel repriced this room; this is the price you pay.</span>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
