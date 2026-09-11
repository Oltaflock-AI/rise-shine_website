// Masking for identity numbers shown on the customer pages. SHARED (no I/O):
// the dashboard shows a masked value so the team can tell two documents apart
// without ever holding the full number — TBO has it, and a leaked dashboard
// session must not become a leaked PAN list. Applied server-side, before the
// value reaches a component.

/** ABCDE1234F → ABC•••••4F. Anything that is not a 10-char PAN shape is masked to its last 2. */
export function maskPan(pan: string | null | undefined): string | null {
  const s = (pan ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.length <= 2) return "•".repeat(s.length);
  if (s.length === 10) return `${s.slice(0, 3)}•••••${s.slice(-2)}`;
  return `${"•".repeat(s.length - 2)}${s.slice(-2)}`;
}

/** Z1234567 → •••••567. Keeps the last 3 only. */
export function maskPassport(no: string | null | undefined): string | null {
  const s = (no ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.length <= 3) return "•".repeat(s.length);
  return `${"•".repeat(s.length - 3)}${s.slice(-3)}`;
}
