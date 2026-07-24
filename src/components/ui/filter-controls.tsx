"use client";

/**
 * Shared building blocks for results-page filter sidebars (flights + hotels):
 * collapsible section, select/clear links, checkbox row with a "from ₹" line,
 * and a dual-thumb range slider. Pure presentation — state lives in callers.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4 last:border-b-0 last:pb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[0.95rem] font-bold text-ink">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function SelectClear({
  allSelected,
  noneSelected,
  onAll,
  onClear,
}: {
  allSelected: boolean;
  noneSelected: boolean;
  onAll: () => void;
  onClear: () => void;
}) {
  const link = (active: boolean) =>
    cn(
      "text-[0.8rem] font-semibold underline-offset-4",
      active ? "text-ink underline hover:text-red" : "cursor-default text-muted/50",
    );
  return (
    <div className="mb-2.5 flex items-center gap-4">
      <button type="button" onClick={onAll} disabled={allSelected} className={link(!allSelected)}>
        Select all
      </button>
      <button type="button" onClick={onClear} disabled={noneSelected} className={link(!noneSelected)}>
        Clear all
      </button>
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
  fromINR,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  fromINR?: number;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4.5 w-4.5 flex-none cursor-pointer rounded accent-red"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[0.9rem] font-medium text-ink">
          {icon}
          {label}
        </span>
        {fromINR != null && (
          <span className="block text-[0.78rem] text-muted">from ₹{inr.format(fromINR)}</span>
        )}
      </span>
    </label>
  );
}

const THUMB =
  "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-red [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-red [&::-moz-range-thumb]:cursor-pointer";

export function DualRange({
  min,
  max,
  step,
  value,
  onChange,
  format,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const [lo, hi] = value;
  const span = Math.max(1, max - min);
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;
  // Both thumbs pinned right → let the lower one win the pointer so the range can reopen.
  const loOnTop = lo > min + span * 0.5;
  return (
    <div>
      <div className="mb-1.5 text-[0.85rem] font-medium text-ink">
        {format(lo)} – {format(hi)}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-red"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={`${ariaLabel} minimum`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className={cn(THUMB, loOnTop ? "z-20" : "z-10")}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label={`${ariaLabel} maximum`}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className={cn(THUMB, loOnTop ? "z-10" : "z-20")}
        />
      </div>
    </div>
  );
}
