import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Filled star rating row. Stays on-palette: red on light, white on dark. */
export function Stars({
  count = 5,
  size = 15,
  className,
  label,
}: {
  count?: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={label ?? `${count} out of 5 stars`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} size={size} className="fill-current" strokeWidth={0} />
      ))}
    </span>
  );
}
