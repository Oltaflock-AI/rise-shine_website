"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { nowInZone, openStatus, type HoursPeriod, type OpenStatus } from "@/lib/opening-hours";

const ZONE = "Asia/Kolkata";

/**
 * "Open · Closes 7:00 PM" / "Closed · Opens Mon 10:00 AM", computed on the
 * visitor's clock in the office's time zone. The page itself is cached for
 * hours, so this cannot be rendered on the server — it would say "Open now"
 * at midnight. Renders nothing until mounted (no hydration mismatch), then
 * re-checks every minute so a tab left open flips at 7 PM.
 */
export function OpenNow({
  periods,
  className,
}: {
  periods: HoursPeriod[];
  className?: string;
}) {
  const [status, setStatus] = useState<OpenStatus | null>(null);

  useEffect(() => {
    const tick = () => setStatus(openStatus(periods, nowInZone(new Date(), ZONE)));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [periods]);

  if (!status) return null;

  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[0.88rem]", className)}
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          status.open ? "bg-emerald-500" : "bg-red",
        )}
      />
      <b className={cn("font-semibold", status.open ? "text-emerald-700" : "text-red")}>
        {status.open ? "Open" : "Closed"}
      </b>
      {status.open && status.closesAt && (
        <span className="text-muted">· Closes {status.closesAt}</span>
      )}
      {!status.open && status.opensAt && (
        <span className="text-muted">· Opens {status.opensAt}</span>
      )}
    </span>
  );
}
