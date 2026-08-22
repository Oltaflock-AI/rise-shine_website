import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "navy" | "ghost" | "light" | "danger";
type Size = "sm" | "md";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-none transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none";

const sizes: Record<Size, string> = {
  sm: "text-[0.875rem] px-5 py-2.5 min-h-10",
  md: "text-[0.95rem] px-7 py-3.5 min-h-11",
};

const variants: Record<Variant, string> = {
  primary:
    "grad-red text-white shadow-brand-red hover:-translate-y-[3px] hover:shadow-[0_24px_52px_rgba(226,30,38,0.42)]",
  navy: "bg-navy text-white shadow-brand-sm hover:-translate-y-[3px] hover:bg-navy-light",
  ghost:
    "border-[1.6px] border-line text-ink bg-white hover:-translate-y-[3px] hover:border-red hover:text-red hover:shadow-brand-sm",
  light:
    "border-[1.6px] border-white/45 bg-white/10 text-white backdrop-blur hover:bg-white hover:text-navy",
  danger:
    "border-[1.6px] border-red/60 bg-white text-red hover:border-red hover:bg-red/5",
};

/** The class string on its own, for the rare host that must own the element
 *  (a `<label>` acting as a button, a third-party trigger). */
export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    base,
    sizes[size],
    variants[variant],
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  arrow = false,
  fullWidth = false,
  href,
  type,
  disabled,
  onClick,
  className,
  children,
  title,
  "aria-label": ariaLabel,
}: {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  fullWidth?: boolean;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const classes = buttonClass({ variant, size, fullWidth, className });
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
        <Link
          href={href}
          className={classes}
          aria-label={ariaLabel}
          title={title}
        >
          {content}
        </Link>
      );
    }
    return (
      <a href={href} className={classes} aria-label={ariaLabel} title={title}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      onClick={onClick}
      className={classes}
      aria-label={ariaLabel}
      title={title}
    >
      {content}
    </button>
  );
}
