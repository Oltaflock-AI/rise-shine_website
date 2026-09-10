import "server-only";

/**
 * Health-check state + alert de-duplication.
 *
 * A monitor is only worth having if its mail still gets read six months in. A
 * check that emails on every failing run trains everyone to filter the address,
 * and the next real outage lands in a folder nobody opens — the same way the
 * callback pinger died in August with nothing to announce it.
 *
 * So alerts are driven by TRANSITIONS, held in `ops_health` (migration 0016):
 *
 *   ok   → fail   send "DOWN", with what broke
 *   fail → fail   stay quiet, unless REMIND_AFTER_MS has passed since the last
 *                 mail — then one reminder carrying how long it has been down
 *   fail → ok     send "recovered", with the outage duration
 *   ok   → ok     say nothing at all
 *
 * If Supabase itself is unreachable the state read fails, and we deliberately
 * fall back to alerting: a monitor that goes quiet because its own storage
 * broke is worse than one that repeats itself.
 */
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { alertOps } from "@/lib/alerts";

/** How long a check may stay broken before it earns another email. */
const REMIND_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

export type CheckResult = {
  /** Stable identifier — the primary key in ops_health. */
  key: string;
  /** Human name for the alert subject. */
  label: string;
  ok: boolean;
  detail: string;
  durationMs?: number;
};

type Stored = {
  status: string;
  since: string;
  last_alert_at: string | null;
};

function humanDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Record a check's outcome and decide whether it deserves an email.
 *
 * Returns what it decided, so the cron response can show it — a monitor whose
 * own decisions are invisible is hard to trust and harder to debug.
 */
export type AlertReason = "transition" | "reminder" | "recovery" | "none";

/**
 * Should this outcome send mail, and when did the current state begin?
 *
 * Pure, and separated from the database on purpose: this is the logic that
 * decides whether anyone hears about an outage, and getting it wrong is
 * invisible in exactly the way the failures it watches for are. Pinned by
 * tests/ops-health.test.ts.
 */
export function decideAlert(args: {
  prevStatus: string | null;
  since: string | null;
  lastAlertAt: string | null;
  ok: boolean;
  stateReadFailed?: boolean;
  now: Date;
}): { reason: AlertReason; since: Date } {
  const status = args.ok ? "ok" : "fail";
  const changed = args.prevStatus === null || args.prevStatus !== status;
  const since = changed || !args.since ? args.now : new Date(args.since);
  const lastAlert = args.lastAlertAt ? new Date(args.lastAlertAt) : null;

  if (!args.ok) {
    // A failed state read means we cannot know whether this was already
    // reported. Repeat rather than risk saying nothing.
    if (changed || args.stateReadFailed) return { reason: "transition", since };
    if (!lastAlert || args.now.getTime() - lastAlert.getTime() > REMIND_AFTER_MS)
      return { reason: "reminder", since };
    return { reason: "none", since };
  }

  // A first-ever 'ok' row is not a recovery — there was no outage to recover from.
  if (changed && args.prevStatus === "fail") return { reason: "recovery", since };
  return { reason: "none", since };
}

export async function recordCheck(
  result: CheckResult,
): Promise<{ alerted: boolean; reason: "transition" | "reminder" | "recovery" | "none" | "no-state" }> {
  if (!supabaseAdminConfigured) {
    // Nowhere to remember state. Alert on failure rather than swallowing it.
    if (!result.ok) {
      await alertOps(`DOWN: ${result.label}`, {
        check: result.key,
        detail: result.detail,
        note: "Supabase admin is not configured, so this alert cannot be de-duplicated.",
      });
      return { alerted: true, reason: "no-state" };
    }
    return { alerted: false, reason: "no-state" };
  }

  const admin = createAdminClient();
  const now = new Date();
  const status = result.ok ? "ok" : "fail";

  let prev: Stored | null = null;
  let stateReadFailed = false;
  try {
    const { data, error } = await admin
      .from("ops_health")
      .select("status, since, last_alert_at")
      .eq("key", result.key)
      .maybeSingle();
    if (error) stateReadFailed = true;
    else prev = (data as Stored | null) ?? null;
  } catch {
    stateReadFailed = true;
  }

  const decision = decideAlert({
    prevStatus: prev?.status ?? null,
    since: prev?.since ?? null,
    lastAlertAt: prev?.last_alert_at ?? null,
    ok: result.ok,
    stateReadFailed,
    now,
  });
  const since = decision.since;
  const lastAlert = prev?.last_alert_at ? new Date(prev.last_alert_at) : null;
  const reason = decision.reason;
  let alerted = false;

  if (reason === "transition" || reason === "reminder") {
    await alertOps(
      reason === "reminder"
        ? `STILL DOWN (${humanDuration(now.getTime() - since.getTime())}): ${result.label}`
        : `DOWN: ${result.label}`,
      {
        check: result.key,
        detail: result.detail,
        failingSince: since.toISOString(),
        durationMs: result.durationMs ?? "—",
        ...(stateReadFailed ? { note: "ops_health read failed — alert not de-duplicated." } : {}),
      },
    );
    alerted = true;
  } else if (reason === "recovery") {
    await alertOps(`Recovered: ${result.label}`, {
      check: result.key,
      detail: result.detail,
      wasDownFor: humanDuration(now.getTime() - new Date(prev!.since).getTime()),
    });
    alerted = true;
  }

  try {
    await admin.from("ops_health").upsert(
      {
        key: result.key,
        status,
        detail: result.detail.slice(0, 500),
        since: since.toISOString(),
        last_alert_at: alerted ? now.toISOString() : (lastAlert?.toISOString() ?? null),
        duration_ms: result.durationMs ?? null,
        checked_at: now.toISOString(),
      },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[ops-health] could not persist check state", result.key, e);
  }

  return { alerted, reason };
}
