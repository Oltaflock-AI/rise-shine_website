/**
 * Render every Rise & Shine email — to look at, and to paste into Supabase.
 *
 * Two outputs, one design system, which is the point:
 *
 * 1. `<scratch>/email-preview/*.html` — every template with realistic sample
 *    data, plus an index page. Open them in a browser. Email HTML cannot be
 *    reviewed by reading the source; you have to see it.
 *
 * 2. `supabase/templates/*.html` — FALLBACKS, not the live path. The site sends
 *    its own password reset through Resend (`lib/auth-links.ts` mints the token
 *    with `admin.generateLink()`, which sends nothing), so Supabase's mailer is
 *    not used. These exist because the dashboard can re-enable it — "Confirm
 *    email", a magic link, an email change — and if it ever does, the mail
 *    should still look like us instead of like a default Supabase template.
 *    Paste into Authentication → Emails. Re-run after any design change.
 *
 * Usage: npx tsx --conditions=react-server scripts/email-preview.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./load-env.mjs";

try {
  loadEnvLocal();
} catch {
  // Templates need no credentials; only the live-send script does.
}

const { button, callout, esc, heading, paragraph, shell } = await import(
  "../src/lib/email-brand.js"
);
const { buildSamples } = await import("./email-samples.mjs");

const OUT = process.env.PREVIEW_DIR || join(process.cwd(), ".email-preview");
mkdirSync(OUT, { recursive: true });

// ── 1. transactional + marketing, with sample data ───────────────────────────

const samples = await buildSamples();

for (const s of samples) writeFileSync(join(OUT, s.file), s.html);

// ── 2. Supabase Auth templates ───────────────────────────────────────────────
//
// `{{ .ConfirmationURL }}` is Go template syntax, interpolated by Supabase at
// send time. It must survive into the pasted HTML verbatim — do not URL-encode
// it, and do not run it through esc().

const CONFIRM = "{{ .ConfirmationURL }}";

const authTemplates: Array<{ file: string; dashboard: string; html: string }> = [
  {
    file: "confirm-signup.html",
    dashboard: "Authentication → Emails → Confirm signup",
    html: shell(
      heading("Confirm your email") +
        paragraph(
          "Thanks for creating a Rise &amp; Shine account. Confirm this address and your account is ready to use.",
        ) +
        button("Confirm my email", CONFIRM, "account") +
        callout(
          "If you did not create an account with us, ignore this email and nothing further will happen.",
          "account",
        ),
      {
        kicker: "Your account",
        tone: "account",
        preheader: "Confirm your email address to finish setting up your account.",
      },
    ),
  },
  {
    file: "reset-password.html",
    dashboard: "Authentication → Emails → Reset password",
    html: shell(
      heading("Reset your password") +
        paragraph(
          "We received a request to reset the password on your Rise &amp; Shine account. Choose a new one using the button below.",
        ) +
        button("Choose a new password", CONFIRM, "notice") +
        callout(
          "This link can be used once, and expires shortly. <strong>If you did not ask for a reset, ignore this email</strong> &mdash; your password stays exactly as it is.",
          "notice",
        ),
      {
        kicker: "Account security",
        tone: "notice",
        preheader: "Reset your password. This link can be used once and expires shortly.",
      },
    ),
  },
  {
    file: "magic-link.html",
    dashboard: "Authentication → Emails → Magic Link",
    html: shell(
      heading("Your sign-in link") +
        paragraph("Use the button below to sign in to your Rise &amp; Shine account. No password needed.") +
        button("Sign in", CONFIRM, "account") +
        callout(
          "This link can be used once and expires shortly. If you did not request it, ignore this email.",
          "account",
        ),
      {
        kicker: "Your account",
        tone: "account",
        preheader: "Your one-time sign-in link.",
      },
    ),
  },
  {
    file: "change-email.html",
    dashboard: "Authentication → Emails → Change Email Address",
    html: shell(
      heading("Confirm your new email") +
        paragraph(
          "You asked to change the email address on your Rise &amp; Shine account to <strong>{{ .NewEmail }}</strong>. Confirm it below.",
        ) +
        button("Confirm the change", CONFIRM, "notice") +
        callout(
          "Until you confirm, your account keeps its current address. If you did not request this change, ignore this email and tell us &mdash; someone may have your password.",
          "notice",
        ),
      {
        kicker: "Account security",
        tone: "notice",
        preheader: "Confirm the new email address on your account.",
      },
    ),
  },
];

const SUPA = join(process.cwd(), "supabase", "templates");
mkdirSync(SUPA, { recursive: true });
for (const t of authTemplates) writeFileSync(join(SUPA, t.file), t.html);

// ── 3. an index so the whole set can be reviewed side by side ────────────────

const card = (href: string, label: string, note: string) =>
  `<li style="margin:0 0 14px;"><a href="${href}" style="font-weight:700;color:#083249;">${esc(label)}</a>
   <div style="font-size:13px;color:#5e6a72;margin-top:3px;">${esc(note)}</div></li>`;

writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Rise &amp; Shine — email templates</title>
<body style="font-family:Roboto,Arial,sans-serif;background:#f7f8f9;color:#102a39;padding:40px;max-width:720px;margin:0 auto;">
<h1 style="font-weight:800;">Email templates</h1>
<p style="color:#5e6a72;line-height:1.6;">Sent by the site, via Resend:</p>
<ul style="list-style:none;padding:0;">
${samples.map((s) => card(s.file, s.label, s.note)).join("\n")}
</ul>
<p style="color:#5e6a72;line-height:1.6;">Sent by Supabase Auth — paste each into the dashboard:</p>
<ul style="list-style:none;padding:0;">
${authTemplates.map((t) => card(`../supabase/templates/${t.file}`, t.file, t.dashboard)).join("\n")}
</ul>
</body>`,
);

console.log(`\nPreviews  → ${OUT}/index.html`);
for (const s of samples) console.log(`  ${s.file.padEnd(26)} ${s.subject}`);
console.log(`\nSupabase  → supabase/templates/`);
for (const t of authTemplates) console.log(`  ${t.file.padEnd(26)} ${t.dashboard}`);
console.log("");
