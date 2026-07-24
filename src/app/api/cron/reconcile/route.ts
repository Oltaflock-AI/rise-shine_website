import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { site } from "@/data/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/reconcile — weekly ledger-vs-bookings digest (Vercel cron,
 * schedule in vercel.json; Vercel sends `Authorization: Bearer CRON_SECRET`).
 *
 * The `payments` ledger is written by the Razorpay webhook independently of the
 * booking flow, so comparing it against the `bookings` mirror surfaces the one
 * failure that really hurts: money captured with no booking on record. Guest
 * bookings are never mirrored (by design), so those rows read as "verify by
 * hand in Razorpay/TBO" — the digest says so rather than pretending certainty.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!supabaseAdminConfigured) {
    return Response.json({ ok: false, error: "Supabase admin is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  // 8-day window: weekly schedule + a day of overlap so nothing falls between runs.
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: captured, error: pErr }, { data: refunded }, { count: failedCount }] =
    await Promise.all([
      admin
        .from("payments")
        .select("razorpay_payment_id, razorpay_order_id, amount_inr, email, trace_id, created_at")
        .eq("status", "captured")
        .gte("created_at", since),
      admin
        .from("payments")
        .select("razorpay_payment_id, amount_inr, refunded_at")
        .eq("status", "refunded")
        .gte("created_at", since),
      admin
        .from("payments")
        .select("razorpay_payment_id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", since),
    ]);

  if (pErr) {
    return Response.json({ ok: false, error: `ledger read failed: ${pErr.message}` }, { status: 502 });
  }

  // Which captured payments have a booking on record?
  const capturedList = captured ?? [];
  const ids = capturedList.map((p) => p.razorpay_payment_id);
  const { data: matched } = ids.length
    ? await admin.from("bookings").select("razorpay_payment_id").in("razorpay_payment_id", ids)
    : { data: [] as Array<{ razorpay_payment_id: string | null }> };
  const known = new Set((matched ?? []).map((b) => b.razorpay_payment_id));
  const orphans = capturedList.filter((p) => !known.has(p.razorpay_payment_id));

  const summary = {
    ok: true,
    windowDays: 8,
    captured: capturedList.length,
    capturedWithBooking: capturedList.length - orphans.length,
    capturedWithoutBooking: orphans.length,
    refunded: refunded?.length ?? 0,
    failed: failedCount ?? 0,
  };

  if (emailConfigured) {
    const orphanRows = orphans
      .map(
        (p) =>
          `<tr><td style="padding:4px 10px 4px 0;font-family:monospace;font-size:12px;">${p.razorpay_payment_id}</td>` +
          `<td style="padding:4px 10px 4px 0;font-size:12px;">₹${p.amount_inr ?? "?"}</td>` +
          `<td style="padding:4px 10px 4px 0;font-size:12px;">${p.email ?? "—"}</td>` +
          `<td style="padding:4px 0;font-size:12px;">${(p.created_at ?? "").slice(0, 10)}</td></tr>`,
      )
      .join("");
    try {
      await sendEmail({
        to: process.env.ALERT_EMAIL || site.email,
        subject: `[Rise & Shine OPS] Weekly payment reconciliation — ${
          orphans.length ? `${orphans.length} payment(s) need review` : "all clear"
        }`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;">
<p><b>Payments, last ${summary.windowDays} days</b></p>
<ul>
  <li>Captured: <b>${summary.captured}</b> (${summary.capturedWithBooking} matched to a booking)</li>
  <li>Refunded: ${summary.refunded}</li>
  <li>Failed attempts: ${summary.failed}</li>
</ul>
${
  orphans.length
    ? `<p><b>Captured with NO booking on record</b> — guest bookings are not mirrored, so verify each in the Razorpay dashboard and TBO before assuming a problem:</p>
<table>${orphanRows}</table>`
    : `<p>Every captured payment has a matching booking. Nothing to do.</p>`
}
<p style="color:#68777f;font-size:12px;">Automated weekly digest · /api/cron/reconcile</p>
</div>`,
      });
    } catch (e) {
      console.error("[cron/reconcile] digest email failed:", e);
    }
  }

  console.log("[cron/reconcile]", summary);
  return Response.json(summary);
}
