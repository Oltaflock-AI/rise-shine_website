"use client";

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** The panel every account section sits in, so the page reads as one thing. */
export function Card({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm", className)}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[1.05rem] font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-body text-muted">{children}</p>;
}

/**
 * Confirmation that a save landed.
 *
 * `role="status"` rather than a plain div: the visual tick is meaningless to a
 * screen reader, and "did that save?" is the one question this page must never
 * leave unanswered — a customer who is unsure will press Save again.
 */
export function Saved({ children = "Saved" }: { children?: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-red/8 px-3 py-1.5 text-meta font-semibold text-red-deep"
    >
      <CheckCircle2 size={15} aria-hidden />
      {children}
    </p>
  );
}
