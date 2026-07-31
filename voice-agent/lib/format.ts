import type { CallRecord, TripFields } from "./types";

export function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export function fmtWhen(unix: number | null): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtAbsolute(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initial(name: string | null, phone: string | null): string {
  const s = (name ?? phone ?? "?").trim();
  return s.slice(0, 1).toUpperCase() || "?";
}

// True once the call has produced a real conversation (picked up).
export function isConnected(c: CallRecord): boolean {
  return (c.duration_secs ?? 0) > 0;
}

export function hasCallback(c: CallRecord): boolean {
  return !!c.fields.callback_time;
}

// Labelled, non-empty trip fields — used for chips and the detail grid.
const FIELD_LABELS: [keyof TripFields, string][] = [
  ["destination", "Destination"],
  ["num_travelers", "Travelers"],
  ["travel_month", "Travel month"],
  ["special_requests", "Special requests"],
  ["whatsapp_number", "Contact"],
  ["callback_time", "Callback"],
];

export function tripChips(c: CallRecord): { label: string; value: string }[] {
  return FIELD_LABELS.map(([key, label]) => ({ label, value: c.fields[key] }))
    .filter((x): x is { label: string; value: string } => !!x.value);
}
