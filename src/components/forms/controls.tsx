import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { cn } from "@/lib/cn";

/** Initial form state lives here (a regular module) — a "use server" file can
 *  only export async functions, so it can't host this constant. */
export const initialFormState: FormState = { status: "idle", message: "" };

export const controlClass =
  "w-full rounded-[13px] border-[1.6px] border-line bg-cream px-4 py-3.5 text-[0.96rem] text-ink outline-none transition-all placeholder:text-muted/70 focus:border-red focus:bg-white focus:ring-4 focus:ring-red/15";

export function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[0.84rem] font-semibold text-ink">
        {label}
        {required && (
          <span className="text-red" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

/** Inline submission feedback. Announced to screen readers via aria-live. */
export function FormNote({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  const ok = state.status === "success";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-[0.9rem] font-medium",
        ok ? "bg-navy/8 text-navy" : "bg-red/10 text-red-deep",
      )}
    >
      {ok ? (
        <Check size={18} strokeWidth={2.4} className="mt-0.5 flex-none" aria-hidden />
      ) : (
        <X size={18} strokeWidth={2.4} className="mt-0.5 flex-none" aria-hidden />
      )}
      <span>{state.message}</span>
    </p>
  );
}
