import { Wallet, Info } from "lucide-react";
import type { HotelFee } from "@/lib/tbo-hotel-static";

const money = (f: HotelFee) =>
  f.amount == null
    ? ""
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: f.currency || "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(f.amount);

/**
 * What the hotel charges on top of the room rate.
 *
 * TBO has always sent `HotelFees` and no page ever showed it, so a AED 105
 * breakfast or a resort fee was something the guest discovered at the desk.
 * Mandatory and optional are kept visibly apart: one is money they WILL pay,
 * the other is money they may choose to.
 */
export function HotelFees({
  fees,
}: {
  fees: { mandatory: HotelFee[]; optional: HotelFee[] } | undefined;
}) {
  if (!fees || (!fees.mandatory.length && !fees.optional.length)) return null;

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
      <h3 className="mb-3.5 text-[1rem] font-bold text-ink">
        Charges at the hotel
      </h3>

      {fees.mandatory.length > 0 && (
        <div className="mb-4 rounded-brand border border-amber-300 bg-amber-50 p-3.5">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-meta font-bold uppercase tracking-[0.07em] text-amber-800">
            <Wallet size={13} aria-hidden /> You will pay these at the hotel
          </h4>
          <ul className="space-y-1">
            {fees.mandatory.map((f, i) => (
              <FeeRow key={i} fee={f} />
            ))}
          </ul>
        </div>
      )}

      {fees.optional.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-meta font-bold uppercase tracking-[0.07em] text-muted">
            <Info size={13} aria-hidden /> Available if you want it
          </h4>
          <ul className="space-y-1">
            {fees.optional.map((f, i) => (
              <FeeRow key={i} fee={f} />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-meta text-muted">
        Charged by the hotel in its own currency and not included in the price
        you pay us.
      </p>
    </div>
  );
}

function FeeRow({ fee }: { fee: HotelFee }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.88rem] text-ink">
      <span>
        {fee.label}
        {fee.basis && <span className="text-muted"> · {fee.basis}</span>}
      </span>
      {fee.amount != null && (
        <span className="font-semibold tabular-nums">{money(fee)}</span>
      )}
    </li>
  );
}
