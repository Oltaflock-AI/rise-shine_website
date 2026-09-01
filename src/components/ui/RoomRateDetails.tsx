"use client";

import { useState, type ReactNode } from "react";
import {
  BadgePercent,
  BedDouble,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { AmenityIcon } from "@/components/ui/AmenityIcon";
import { cn } from "@/lib/cn";
import { curateAmenities } from "@/lib/hotel-amenities";
import { parseRoomDescription } from "@/lib/hotel-description";
import { parseRateConditions } from "@/lib/hotel-rate-conditions";
import { RateConditionList } from "@/components/ui/RateConditionList";
import {
  formatDeadline,
  inclusionItems,
  mealLabel,
  promotionLabel,
  sentenceCase,
  supplementCurrencyNote,
} from "@/lib/hotel-display";
import {
  cancellationHeadline,
  cancellationWindows,
  tboDateToISO,
} from "@/lib/hotel-cancellation";

/**
 * The one disclosure on a room card: what the room is, and what the rate says.
 *
 * TBO certification (portal checkpoints 19, 23, 25) requires the guest to see a
 * rate's promotions, rate conditions, mandatory supplements and final
 * cancellation policy before booking. Those live in the PreBook RS, not in
 * Search, so this expands on demand and PreBooks that single room — the same
 * call the checkout page makes, just one step earlier. The compliance surface
 * is the BOOK page, whose `RateTerms` renders every section unconditionally;
 * this is the preview, so a section the supplier leaves empty is simply not
 * drawn here rather than printing "the hotel returns no conditions" under a
 * heading on every rate of every hotel.
 */
type Quote = {
  ok: boolean;
  currency?: string;
  totalFare?: number;
  isPriceChanged?: boolean;
  isCancellationPolicyChanged?: boolean;
  cancelPolicies?: {
    fromDate: string;
    chargeType?: string | number;
    charge: number;
  }[];
  mealType?: string;
  inclusion?: string;
  rateConditions?: string[];
  roomPromotions?: string[];
  supplements?: {
    type?: string;
    description?: string;
    price?: number;
    currency?: string;
  }[];
  amenities?: string[];
  lastCancellationDeadline?: string;
  error?: string;
};

/**
 * A cancellation deadline is a MOMENT, not a day — "free until the 22nd" is a
 * different promise from "free until 00:00 on the 22nd", and TBO's windows
 * routinely open at midnight UTC. Date stays in the site's DD-MM-YY format.
 */
function chargeLabel(
  p: { chargeType?: string | number; charge: number },
  currency: string,
): string {
  const t = String(p.chargeType ?? "").toLowerCase();
  if (p.charge <= 0) return "No charge";
  if (t === "2" || t === "percentage") return `${p.charge}% of the fare`;
  if (t === "3" || t === "nights")
    return `${p.charge} night${p.charge > 1 ? "s" : ""}`;
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
  roomDescription,
}: {
  bookingCode: string;
  /** ISO-2 of the stay's country — makes PAN rules match checkout. */
  destinationCountry?: string;
  /**
   * The static catalogue's prose for this room, matched by name. It used to
   * have a disclosure of its own directly above this one; it opens in here now
   * so the card has a single control.
   */
  roomDescription?: string;
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
        body: JSON.stringify({
          bookingCode,
          ...(destinationCountry ? { destinationCountry } : {}),
        }),
      });
      setQuote((await r.json()) as Quote);
    } catch {
      setQuote({
        ok: false,
        error: "Could not load this rate's conditions. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const currency = quote?.currency || "INR";

  const currencyFmt = (n: number, cur?: string) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: cur || currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const descriptionParts = parseRoomDescription(roomDescription);
  const inclusions = inclusionItems(quote?.inclusion, 8);
  const roomAmenities = curateAmenities(quote?.amenities, 10);
  const windows = cancellationWindows(quote?.cancelPolicies);
  const rateConditions = parseRateConditions(quote?.rateConditions);
  const deadlineISO = tboDateToISO(quote?.lastCancellationDeadline ?? "");
  const headline = cancellationHeadline(windows, formatDeadline);

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[0.85rem] font-semibold text-red hover:underline"
      >
        Room &amp; rate details
        <ChevronDown
          size={14}
          className={cn("transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-2.5 overflow-hidden rounded-brand-lg border border-line bg-white text-[0.85rem] leading-relaxed shadow-brand-sm">
          {loading && (
            <p className="flex items-center gap-2 p-4 text-muted">
              <Loader2
                size={15}
                className="animate-spin text-red"
                aria-hidden
              />
              Confirming this rate with the hotel…
            </p>
          )}

          {!loading && quote && !quote.ok && (
            <p className="p-4 text-red">
              {quote.error || "This rate is no longer available."}
            </p>
          )}

          {!loading && quote?.ok && (
            <>
              {/* The two facts a guest decides on, before any of the detail. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-cream-2/70 px-4 py-3">
                {headline && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-semibold",
                      windows.find((w) => w.active)?.free
                        ? "text-green-700"
                        : "text-ink",
                    )}
                  >
                    <ShieldCheck size={15} aria-hidden />
                    {headline}
                  </span>
                )}
                {quote.totalFare != null && (
                  <span className="text-[0.82rem] text-muted">
                    Confirmed total{" "}
                    <span className="text-[0.95rem] font-extrabold text-navy">
                      {currencyFmt(quote.totalFare)}
                    </span>
                  </span>
                )}
              </div>

              {quote.isPriceChanged && (
                <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[0.82rem] text-amber-900">
                  The hotel repriced this room — the total above is what you
                  pay.
                </p>
              )}

              <div className="divide-y divide-line">
                {descriptionParts.length > 0 && (
                  <Row
                    icon={<BedDouble size={15} aria-hidden />}
                    title="This room"
                  >
                    {/* TBO welds the supplier's own sections into one line;
                        `parseRoomDescription` takes them back apart so this
                        reads as a spec rather than a paragraph. */}
                    <dl className="max-w-prose space-y-1">
                      {descriptionParts.map((part, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-baseline gap-x-2"
                        >
                          {part.label && (
                            <dt className="font-semibold text-ink">
                              {part.label}
                            </dt>
                          )}
                          <dd className="min-w-0 flex-1 text-muted">
                            {part.text}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Row>
                )}

                {(inclusions.length > 0 || quote.mealType) && (
                  <Row icon={<Check size={15} aria-hidden />} title="Included">
                    {[
                      ...inclusions,
                      ...(quote.mealType
                        ? [mealLabel(quote.mealType, true)]
                        : []),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Row>
                )}

                {(quote.roomPromotions ?? []).length > 0 && (
                  <Row
                    icon={<BadgePercent size={15} aria-hidden />}
                    title="Promotion"
                    tone="good"
                  >
                    <List items={quote.roomPromotions!.map(promotionLabel)} />
                  </Row>
                )}

                {windows.length > 0 && (
                  <Row
                    icon={<ShieldCheck size={15} aria-hidden />}
                    title="Cancellation"
                  >
                    {quote.isCancellationPolicyChanged && (
                      <p className="mb-1.5 font-medium text-amber-700">
                        Updated by the hotel — this is the final policy.
                      </p>
                    )}
                    <ul className="space-y-1">
                      {windows.map((w, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1",
                            w.active && "bg-cream-2 font-medium text-ink",
                          )}
                        >
                          <span className="text-muted">
                            {w.active
                              ? "Cancel now"
                              : `From ${formatDeadline(w.fromISO)}`}
                            {w.active && w.untilISO
                              ? ` (until ${formatDeadline(w.untilISO)})`
                              : ""}
                          </span>
                          <span
                            className={cn(
                              "font-semibold",
                              w.free ? "text-green-700" : "text-ink",
                            )}
                          >
                            {chargeLabel(w, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* Only worth printing while it is still ahead of the
                        guest — a deadline in the past contradicts the line
                        above it, and is what made this panel read as broken. */}
                    {deadlineISO && deadlineISO > new Date().toISOString() && (
                      <p className="mt-1.5 text-meta text-muted">
                        Hotel&apos;s stated deadline:{" "}
                        {formatDeadline(deadlineISO)}
                      </p>
                    )}
                  </Row>
                )}

                {(quote.supplements ?? []).length > 0 && (
                  <Row
                    icon={<Wallet size={15} aria-hidden />}
                    title="Payable at the hotel"
                    tone="warn"
                  >
                    <p className="mb-1 text-amber-900/90">
                      Not included in the total above.
                    </p>
                    <ul className="space-y-1">
                      {quote.supplements!.map((sup, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-baseline gap-x-2"
                        >
                          <span>
                            {sentenceCase(
                              sup.description ||
                                sup.type ||
                                "Mandatory supplement",
                            )}
                          </span>
                          {sup.price != null && (
                            <span className="font-semibold">
                              {currencyFmt(sup.price, sup.currency)}
                              {supplementCurrencyNote(sup.currency, currency)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}

                {/* Curated, not printed. The raw per-rate feed is the same
                    supplier free-text as the hotel's facility list — a live
                    5-star returned 70-odd entries including "TV size
                    measurement: inch", "Television" twice and four ways of
                    saying there is a TV. `curateAmenities` collapses that to
                    iconed categories, the same ones the rest of the page
                    uses, so the panel reads as part of the site. */}
                {roomAmenities.length > 0 && (
                  <Row
                    icon={<Sparkles size={15} aria-hidden />}
                    title="Room amenities"
                  >
                    <ul className="flex flex-wrap gap-1.5">
                      {roomAmenities.map((a) => (
                        <li
                          key={a.key}
                          className="inline-flex items-center gap-1 rounded-full bg-cream-2 px-2.5 py-1 text-meta font-medium text-ink"
                        >
                          <AmenityIcon
                            name={a.icon}
                            size={12}
                            className="text-red"
                          />
                          {a.label}
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}

                {/* Always rendered, even when the supplier sends none — TBO's
                    verifier must find the rate's conditions on the room page for
                    every rate, and a section that appears only sometimes reads to
                    them as one that is missing. */}
                <Row
                  icon={<FileText size={15} aria-hidden />}
                  title="Rate conditions"
                >
                  {rateConditions.length > 0 ? (
                    <RateConditionList
                      groups={rateConditions}
                      className="space-y-1.5"
                    />
                  ) : (
                    <p>
                      The hotel returns no additional rate conditions for this
                      rate.
                    </p>
                  )}
                </Row>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One labelled block. Keeps every section on the same grid and icon rhythm. */
function Row({
  icon,
  title,
  tone = "plain",
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: "plain" | "good" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        tone === "warn" && "bg-amber-50/70",
        tone === "good" && "bg-green-50/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex-none",
          tone === "warn"
            ? "text-amber-700"
            : tone === "good"
              ? "text-green-700"
              : "text-red",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h5 className="mb-1 text-meta font-bold uppercase tracking-[0.07em] text-muted">
          {title}
        </h5>
        <div className="text-ink">{children}</div>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            className="mt-[0.5rem] h-1 w-1 flex-none rounded-full bg-current opacity-50"
            aria-hidden
          />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
