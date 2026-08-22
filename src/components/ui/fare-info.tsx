"use client";

/**
 * Shared fare-entitlement UI: what the ticket includes and what it costs to change
 * or cancel it. Used by the search card (from Search) and by checkout (from the
 * confirmed FareQuote), so both speak with one voice.
 *
 * Everything here renders TBO's own wording. Allowances are never rounded, and a
 * missing allowance says "Check with airline" rather than implying zero — TBO omits
 * the field for some suppliers, and "0 kg" would be a lie the customer pays for.
 */
import { Briefcase, Info, Luggage } from "lucide-react";
import type { MiniFareRule } from "@/lib/tbo";
import { cn } from "@/lib/cn";

/** "15 KG" / "1 PC" → true; "" / "0 KG" / "No" → false. */
export function hasAllowance(v: string): boolean {
  const t = (v || "").trim().toLowerCase();
  if (!t || t === "no" || t === "nil" || t === "na") return false;
  const m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) > 0 : true;
}

/**
 * Normalise TBO's allowance wording for display. Suppliers are inconsistent —
 * "15 KG", "7KG (7 KG X 1 pcs)", "1 PC" all appear on live results — so the unit is
 * lower-cased and spaced, and nothing else is touched: the number itself is the
 * airline's promise and is never rewritten or rounded.
 */
export function prettyAllowance(v: string): string {
  const t = (v || "").trim();
  if (!t) return "";
  return t
    .replace(/(\d)\s*KGS?\b/gi, "$1 kg")
    .replace(/(\d+)\s*PCS?\b/gi, (_m, n: string) => `${n} ${Number(n) === 1 ? "piece" : "pieces"}`)
    .replace(/\s{2,}/g, " ");
}

function AllowancePill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Luggage;
  label: string;
  value: string;
}) {
  const ok = hasAllowance(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold",
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-cream-2 text-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-none" aria-hidden />
      {label} {ok ? prettyAllowance(value) : "— check with airline"}
    </span>
  );
}

/**
 * The headline the customer asked for: cabin + checked-in allowance, side by side.
 * `perSegment` allowances differ on connections, so the summary shows the smallest
 * common promise and the detail panel breaks it down leg by leg.
 */
export function BaggageSummary({
  checkedIn,
  cabin,
  className,
}: {
  checkedIn: string;
  cabin: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <AllowancePill icon={Briefcase} label="Cabin" value={cabin} />
      <AllowancePill icon={Luggage} label="Check-in" value={checkedIn} />
    </div>
  );
}

/**
 * Pick the allowance to advertise for a whole itinerary: the weakest leg. Promising
 * the generous leg's 25 kg when the connecting leg only carries 15 kg is how a
 * customer gets charged excess at the second gate.
 */
export function weakestAllowance(values: string[]): string {
  const present = values.map((v) => (v || "").trim()).filter(Boolean);
  if (!present.length) return "";
  if (present.some((v) => !hasAllowance(v))) return present.find((v) => !hasAllowance(v)) ?? "";
  const num = (v: string) => {
    const m = v.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : Infinity;
  };
  return present.reduce((a, b) => (num(b) < num(a) ? b : a));
}

const RULE_ORDER = ["cancellation", "reissue", "no show", "seat", "meal", "baggage"];

/** "0"–"2" "HOURS" → "0–2 hours before departure". */
function window_(r: MiniFareRule): string {
  const unit = r.unit ? r.unit.toLowerCase() : "";
  if (r.from && r.to) return `${r.from}–${r.to} ${unit} before departure`.replace(/\s+/g, " ");
  if (r.to) return `Up to ${r.to} ${unit} before departure`.replace(/\s+/g, " ");
  if (r.from) return `More than ${r.from} ${unit} before departure`.replace(/\s+/g, " ");
  return "Any time before departure";
}

/**
 * TBO's MiniFareRules as a readable penalty grid — the "refundable policy" a customer
 * expects next to the price. Renders nothing when the airline supplied no rows, so
 * callers should fall back to the full fare-rule text.
 */
export function FarePolicyTable({ rules }: { rules: MiniFareRule[] }) {
  if (!rules.length) return null;
  const sorted = [...rules].sort((a, b) => {
    const ai = RULE_ORDER.indexOf(a.type.toLowerCase());
    const bi = RULE_ORDER.indexOf(b.type.toLowerCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] border-collapse text-left text-[0.78rem]">
        <thead>
          <tr className="text-muted">
            <th className="border-b border-line py-1.5 pr-3 font-semibold">Charge</th>
            <th className="border-b border-line py-1.5 pr-3 font-semibold">When</th>
            <th className="border-b border-line py-1.5 pr-3 font-semibold">Sector</th>
            <th className="border-b border-line py-1.5 text-right font-semibold">Airline fee</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="border-b border-line/70 py-1.5 pr-3 font-semibold text-ink">
                {r.type || "Fee"}
              </td>
              <td className="border-b border-line/70 py-1.5 pr-3 text-muted">{window_(r)}</td>
              <td className="border-b border-line/70 py-1.5 pr-3 text-muted">{r.journey || "—"}</td>
              <td className="border-b border-line/70 py-1.5 text-right font-semibold tabular-nums text-ink">
                {r.details}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] text-muted">
        <Info className="mt-[1px] h-3.5 w-3.5 flex-none" aria-hidden />
        Airline fees only. Any fare difference on a date change, and our service fee, are
        charged on top. Amounts are the airline&apos;s and can change without notice.
      </p>
    </div>
  );
}

/** The airline's own inclusion list ("Cabin Baggage Included", "Reissue fees apply"). */
export function FareInclusions({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li
          key={t}
          className="rounded-full border border-line bg-cream-2 px-2.5 py-1 text-[0.72rem] font-medium text-ink"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}
