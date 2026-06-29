import type { ReactNode } from "react";
import { Eyebrow } from "../ui/Eyebrow";
import { cn } from "@/lib/cn";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  center = false,
  onDark = false,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && "text-center", className)}>
      <Eyebrow center={center} onDark={onDark}>
        {eyebrow}
      </Eyebrow>
      <h2 className={cn("h-lg", onDark && "text-white")}>{title}</h2>
      {lead && (
        <p
          className={cn(
            "mt-4 max-w-2xl text-lg",
            center && "mx-auto",
            onDark ? "text-white/85" : "text-ink-soft",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
