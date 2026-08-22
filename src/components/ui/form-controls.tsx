"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format-date";

/**
 * One control language for the whole site — enquiry forms, the search bar and
 * both checkouts render the same box: 13px radius, a 1.6px silver rule, cream
 * at rest, white with a red focus ring. Anything that takes typed or picked
 * input uses this so a field never looks like it wandered in from elsewhere.
 */
export const controlClass =
  "w-full min-h-12 rounded-[13px] border-[1.6px] border-line bg-cream px-4 py-3 text-base text-ink outline-none transition-all placeholder:text-muted/70 hover:border-silver focus:border-red focus:bg-white focus:ring-4 focus:ring-red/15 disabled:cursor-not-allowed disabled:opacity-60";

/** Focus styling for a control whose real input is nested (date, combobox). */
export const controlFocusWithin =
  "focus-within:border-red focus-within:bg-white focus-within:ring-4 focus-within:ring-red/15";

/** Field caption. Sentence case on purpose — shouty all-caps micro-labels read
 *  as a system form, not as this brand. */
export const controlLabelClass =
  "mb-1.5 block text-[0.84rem] font-semibold text-ink";

/**
 * A native `<select>` wearing the brand box. The native element is kept (it
 * gives the correct picker on every phone and free keyboard support); only its
 * OS chevron is dropped for a lucide one in brand navy.
 */
export function Select({
  className,
  size = "md",
  bare = false,
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** "sm" for dense panels (the search bar's guest popover). */
  size?: "sm" | "md";
  /** No box — for a select sitting inside a surface that draws its own. */
  bare?: boolean;
}) {
  return (
    <div
      className={cn("relative", bare ? "inline-flex items-center" : "block")}
    >
      <select
        {...rest}
        className={cn(
          "cursor-pointer appearance-none truncate font-medium outline-none",
          bare
            ? "w-full bg-transparent pr-5 text-ink"
            : cn(
                controlClass,
                size === "sm"
                  ? "min-h-10 px-3 py-2 pr-9 text-[0.9rem]"
                  : "pr-11",
              ),
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        size={bare ? 14 : 17}
        strokeWidth={2.4}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-navy/60",
          bare ? "right-0" : size === "sm" ? "right-3" : "right-3.5",
        )}
      />
    </div>
  );
}

/**
 * Native date pickers render in the browser's locale (often MM-DD-YYYY), which
 * breaks the site-wide DD-MM-YY rule. The real `<input type="date">` stays on
 * top (invisible) so the calendar, keyboard and form validation still work; the
 * visible text is always formatDate()'s DD-MM-YY.
 *
 * `bare` drops the box for hosts that draw their own (the search bar cells).
 * Works controlled (`value`) or uncontrolled (`defaultValue` + `name`, for the
 * server-action enquiry forms) — the visible text tracks either.
 */
export function DateField({
  value,
  defaultValue,
  onChange,
  min,
  max,
  name,
  id,
  required,
  disabled,
  bare = false,
  placeholder = "dd-mm-yy",
  className,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  min?: string;
  max?: string;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  bare?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState(value ?? defaultValue ?? "");
  const shown = value ?? inner;
  return (
    <div
      className={cn(
        "relative flex items-center gap-2",
        !bare && cn(controlClass, controlFocusWithin, "cursor-pointer"),
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-ink",
          !shown && "font-normal text-muted/70",
        )}
      >
        {shown ? formatDate(shown) : placeholder}
      </span>
      {!bare && (
        <CalendarDays
          size={17}
          strokeWidth={2.2}
          aria-hidden
          className="pointer-events-none flex-none text-red"
        />
      )}
      <input
        ref={ref}
        type="date"
        value={shown}
        name={name}
        id={id}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          setInner(e.target.value);
          onChange?.(e.target.value);
        }}
        onClick={() => {
          try {
            ref.current?.showPicker();
          } catch {
            /* needs a user gesture in some browsers; typing still works */
          }
        }}
        aria-label={ariaLabel}
        className={cn(
          "absolute inset-0 h-full w-full opacity-0",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      />
    </div>
  );
}

/** Label + control, so every form stacks its fields identically. */
export function ControlField({
  label,
  required,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={controlLabelClass}>
        {label}
        {required && (
          <span className="text-red" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint}
    </div>
  );
}
