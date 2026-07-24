"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { BedDouble, History, PlaneTakeoff } from "lucide-react";
import {
  recentSearchesServerSnapshot,
  recentSearchesSnapshot,
  subscribeRecentSearches,
} from "@/lib/recent-searches";
import { cn } from "@/lib/cn";

/**
 * One-tap chips for the visitor's recent searches. Reads localStorage after
 * mount (never during SSR), renders nothing when there's no history — safe to
 * drop anywhere. `kind` narrows to one product's history.
 */
export function RecentSearches({
  kind,
  className,
}: {
  kind?: "flight" | "hotel";
  className?: string;
}) {
  const all = useSyncExternalStore(
    subscribeRecentSearches,
    recentSearchesSnapshot,
    recentSearchesServerSnapshot,
  );
  const items = useMemo(() => (kind ? all.filter((s) => s.kind === kind) : all), [all, kind]);

  if (!items.length) return null;

  return (
    <div className={cn("text-left", className)}>
      <p className="mb-2 flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide text-muted">
        <History size={13} aria-hidden /> Recent searches
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <Link
            key={s.url}
            href={s.url}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition-colors hover:border-red hover:text-red"
          >
            {s.kind === "hotel" ? (
              <BedDouble size={14} className="text-red" aria-hidden />
            ) : (
              <PlaneTakeoff size={14} className="text-red" aria-hidden />
            )}
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
