/**
 * Is the Resend sending domain ACTUALLY verified — and is M365 mail still safe?
 *
 * Two separate questions, both easy to get wrong by eye:
 *
 * 1. Resend's dashboard says "Verified" once it can read the DKIM record. That
 *    does not tell you whether the apex SPF still belongs to Microsoft 365 —
 *    and riseandshinetravel.com's apex is `v=spf1 include:spf.protection.
 *    outlook.com -all`, a HARD fail. Adding Resend to that record, or adding a
 *    second SPF TXT beside it, breaks the company inbox. Only one SPF record
 *    per name is legal; two means every receiver treats SPF as permerror.
 *
 *    Resend avoids this for you: the domain added in Resend is the APEX, but it
 *    scopes its own MX and SPF to `send.<domain>`, because an MX record only
 *    affects the name it sits on. So the apex MX (M365) and apex SPF stay
 *    exactly as they are. This script asserts that they did.
 *
 * 2. A verified domain still sends nothing if Vercel has no RESEND_API_KEY, or
 *    if EMAIL_FROM is left on Resend's onboarding sender. `lib/email.ts` is a
 *    SILENT no-op without a key — by design, so a lost email never fails a paid
 *    booking, which also means a misconfiguration looks exactly like calm.
 *
 * Usage — the react-server condition is REQUIRED for --send, because
 * lib/email.ts is `import "server-only"` and plain tsx throws on it:
 *   npx tsx --conditions=react-server scripts/resend-domain-check.mts
 *   npx tsx --conditions=react-server scripts/resend-domain-check.mts --send you@example.com
 */
import { Resolver, resolveNs, resolve4 } from "node:dns/promises";
import { loadEnvLocal } from "./load-env.mjs";

try {
  loadEnvLocal();
} catch {
  // No .env.local (e.g. running on a fresh clone) — env may still come from the shell.
}

const APEX = "riseandshinetravel.com";
const SENDING = `send.${APEX}`;

/**
 * Resolve against the ZONE'S OWN nameservers, not the system resolver.
 *
 * This script is run in the minutes after adding records, and a public resolver
 * will happily serve a cached NXDOMAIN from before the change — negative answers
 * are cached too, per the SOA minimum. That produced a run where all three
 * Resend records were live in Cloudflare and this reported them missing, which
 * is the worst failure mode a verifier has: it sends you back to re-add records
 * that are already correct. Ask the authority; fall back only if that fails.
 */
const resolver = new Resolver();
try {
  const ns = await resolveNs(APEX);
  const ips = (await Promise.all(ns.map((h) => resolve4(h).catch(() => [])))).flat();
  if (ips.length) {
    resolver.setServers(ips);
    console.log(`\nResolving against ${APEX} authority: ${ns.join(", ")}`);
  }
} catch {
  console.log("\nCould not reach the zone's nameservers — falling back to the system resolver.");
}

let failures = 0;
const ok = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
};
const info = (m: string) => console.log(`  ----  ${m}`);

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

async function mx(name: string): Promise<Array<{ exchange: string; priority: number }>> {
  return resolver.resolveMx(name).catch(() => []);
}

// ── 1. The apex must still be Microsoft's, untouched ─────────────────────────
console.log(`\nM365 mail on ${APEX} (must not have changed)`);
{
  const apexMx = await mx(APEX);
  const outlook = apexMx.filter((r) => /\.mail\.protection\.outlook\.com$/.test(r.exchange));
  if (outlook.length) ok(`MX → ${outlook.map((r) => r.exchange).join(", ")}`);
  else bad(`MX is not Microsoft 365 — inbound mail is broken. Got: ${JSON.stringify(apexMx)}`);

  const spf = (await txt(APEX)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) bad("no SPF record at the apex — M365 outbound will start failing DMARC/SPF checks");
  else if (spf.length > 1) bad(`${spf.length} SPF records at the apex. Only one is legal; receivers treat this as permerror. Merge them.`);
  else if (/resend/i.test(spf[0]))
    bad(`Resend was added to the APEX SPF: ${spf[0]}\n        Remove it. Resend belongs on ${SENDING}, not here.`);
  else ok(`single SPF, Microsoft only: ${spf[0]}`);
}

// ── 2. The sending subdomain Resend actually verifies ─────────────────────────
console.log(`\nResend sending domain ${SENDING}`);
{
  const spf = (await txt(SENDING)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 1 && /amazonses|resend/i.test(spf[0])) ok(`SPF: ${spf[0]}`);
  else if (spf.length === 0) bad("no SPF TXT — add the record Resend shows for this subdomain");
  else bad(`unexpected SPF: ${JSON.stringify(spf)}`);

  // DKIM has been published at both `resend._domainkey.<apex>` and
  // `resend._domainkey.send.<apex>` across Resend's setup flows. Accept either
  // rather than asserting a layout — what matters is that a key resolves.
  const dkimNames = [`resend._domainkey.${SENDING}`, `resend._domainkey.${APEX}`];
  const dkim = (await Promise.all(dkimNames.map(txt))).flat();
  if (dkim.some((r) => /p=[A-Za-z0-9+/]{100,}/.test(r))) ok("DKIM public key present");
  else bad(`no DKIM at ${dkimNames.join(" or ")} — Resend cannot verify the domain`);

  // Resend requires its own MX here for bounce/complaint feedback. It must be on
  // the subdomain: an MX at the apex would compete with M365 for the company's mail.
  const sendMx = await mx(SENDING);
  if (sendMx.length) ok(`MX (bounce/feedback) → ${sendMx.map((r) => r.exchange).join(", ")}`);
  else bad(`no MX on ${SENDING} — Resend lists one; without it the domain will not verify`);
}

// ── 3. DMARC — absent today, and that is a deliverability risk, not an error ──
console.log(`\nDMARC on ${APEX}`);
{
  const d = (await txt(`_dmarc.${APEX}`)).filter((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (d.length) ok(d[0]);
  else
    info(
      "none published. Not required, but Gmail/Yahoo bulk rules expect one and\n" +
        "        without it you get no report of who is spoofing the domain.\n" +
        "        Safe first step: v=DMARC1; p=none; rua=mailto:<inbox>",
    );
}

// ── 4. Does this app have what it needs to send at all? ───────────────────────
console.log("\nApp configuration");
{
  const key = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "";
  if (!key) bad("RESEND_API_KEY unset — lib/email.ts is a silent no-op, no booking mail goes out");
  else ok(`RESEND_API_KEY set (${key.slice(0, 8)}…)`);

  if (!from) bad("EMAIL_FROM unset — falls back to onboarding@resend.dev, which is testing-only");
  else if (from.includes("resend.dev")) bad(`EMAIL_FROM is still Resend's test sender: ${from}`);
  else if (!from.includes(APEX)) bad(`EMAIL_FROM is not on ${APEX}: ${from}`);
  else ok(`EMAIL_FROM: ${from}`);

  // Ask Resend itself, rather than trusting DNS to imply verification.
  if (key) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) bad(`Resend GET /domains → ${res.status} ${(await res.text()).slice(0, 200)}`);
    else {
      const { data = [] } = (await res.json()) as {
        data?: Array<{ name: string; status: string; region: string }>;
      };
      if (!data.length) bad("Resend account has no domains — only the test sender works");
      for (const d of data) {
        const line = `${d.name} · ${d.status} · ${d.region}`;
        d.status === "verified" ? ok(line) : bad(line);
      }
    }
  }
}

// ── 5. Optional live send — the only proof that actually proves anything ─────
const sendIdx = process.argv.indexOf("--send");
if (sendIdx !== -1 && process.argv[sendIdx + 1]) {
  const to = process.argv[sendIdx + 1];
  console.log(`\nLive send → ${to}`);
  const { sendEmail } = await import("../src/lib/email.js");
  try {
    await sendEmail({
      to,
      subject: "Rise & Shine — Resend delivery test",
      html: "<p>If you are reading this, the Resend domain is verified and the site can send booking confirmations.</p>",
    });
    ok("accepted by Resend — now open the message and check it is not in spam,");
    info("and that the header shows dkim=pass and spf=pass");
  } catch (err) {
    bad(String(err));
  }
} else {
  console.log(
    "\n(pass --send you@example.com to attempt a real delivery;\n" +
      " needs npx tsx --conditions=react-server)",
  );
}

console.log(
  failures === 0
    ? "\n\x1b[32mAll checks passed.\x1b[0m\n"
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
