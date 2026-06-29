import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "navy" | "ghost" | "light";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium text-[0.95rem] leading-none px-7 py-3.5 min-h-11 transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "grad-red text-white shadow-brand-red hover:-translate-y-[3px] hover:shadow-[0_24px_52px_rgba(226,30,38,0.42)]",
  navy: "bg-navy text-white hover:-translate-y-[3px] hover:bg-navy-light",
  ghost:
    "border-[1.6px] border-line text-ink bg-white hover:-translate-y-[3px] hover:border-red hover:text-red",
  light:
    "border-[1.6px] border-white/45 bg-white/10 text-white backdrop-blur hover:bg-white hover:text-navy",
};

export function Button({
  variant = "primary",
  arrow = false,
  fullWidth = false,
  href,
  type,
  disabled,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  variant?: Variant;
  arrow?: boolean;
  fullWidth?: boolean;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const classes = cn(base, variants[variant], fullWidth && "w-full", className);
  const content = (
    <>
      {children}
      {arrow && (
        <ArrowRight
          size={18}
          strokeWidth={2}
          className="transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        />
      )}
    </>
  );

  if (href) {
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={classes} aria-label={ariaLabel}>
          {content}
        </Link>
      );
    }
    return (
      <a href={href} className={classes} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      className={classes}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
