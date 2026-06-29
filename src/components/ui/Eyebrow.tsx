import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small uppercase label with a red brand rule. */
export function Eyebrow({
  children,
  onDark = false,
  center = false,
  className,
}: {
  children: ReactNode;
  onDark?: boolean;
  center?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-4 inline-flex items-center gap-2.5 text-[0.74rem] font-bold uppercase tracking-[0.2em]",
        onDark ? "text-silver" : "text-red",
        center && "justify-center",
        className,
      )}
    >
      <span className="grad-red h-0.5 w-7 rounded-full" aria-hidden />
      {children}
    </span>
  );
}
