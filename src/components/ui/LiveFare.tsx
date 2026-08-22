"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlaneTakeoff, ArrowRight } from "lucide-react";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

type State =
  | { status: "loading" }
  | { status: "ok"; fareINR: number; airline?: string }
  | { status: "fail" };

/**
 * Live round-trip flight fare (AMD ↔ destination) fetched from /api/flights
 * (TBO). Shows a skeleton while loading and hides itself if the API is
 * unavailable, so the page always renders cleanly.
 */
export function LiveFare({
  from = "AMD",
  to,
  nights = 7,
}: {
  from?: string;
  to: string;
  nights?: number;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!to) {
      setState({ status: "fail" });
      return;
    }
    let alive = true;
    fetch(
      `/api/flights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&trip=round&adults=1&nights=${nights}&max=1`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && j.cheapestINR != null) {
          setState({ status: "ok", fareINR: j.cheapestINR, airline: j.outbound?.[0]?.airlineName });
        } else {
          setState({ status: "fail" });
        }
      })
      .catch(() => alive && setState({ status: "fail" }));
    return () => {
      alive = false;
    };
  }, [from, to, nights]);

  if (state.status === "fail") return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-brand-lg border border-red/20 bg-red/5 px-5 py-4">
      <PlaneTakeoff size={20} className="flex-none text-red" aria-hidden />
      {state.status === "loading" ? (
        <span className="text-[0.9rem] text-muted">
          Checking live round-trip fares from {from}…
          <span className="ml-2 inline-block h-3 w-24 animate-pulse rounded bg-line align-middle" />
        </span>
      ) : (
        <>
          <span className="text-[0.95rem] text-ink">
            Live round-trip flights from{" "}
            <b className="text-[1.05rem] font-extrabold text-navy">
              ₹{inr.format(state.fareINR)}
            </b>{" "}
            <span className="text-muted">per adult</span>
            {state.airline ? (
              <span className="text-muted"> · e.g. {state.airline}</span>
            ) : null}
            <span className="text-muted"> · {from} ↔ {to}</span>
          </span>
          <Link
            href={`/flights?from=${from}&to=${to}&trip=round&adults=1`}
            className="inline-flex min-h-11 items-center gap-1 text-[0.9rem] font-semibold text-red hover:underline"
          >
            See flights <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
          </Link>
        </>
      )}
    </div>
  );
}
