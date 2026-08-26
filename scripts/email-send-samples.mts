/**
 * Mail yourself every template, so they can be reviewed where they will be read.
 *
 * A browser preview proves the markup; it does not prove the email. Gmail
 * rewrites CSS, Outlook re-renders the whole thing in Word's engine, the iOS
 * Mail app applies its own dark mode, and the subject and preheader — half of
 * what a recipient actually judges — are invisible until the message is sitting
 * in a list next to other mail. This sends the real thing through the real
 * sender.
 *
 * Each subject is prefixed so a year-old sample can never be mistaken for a real
 * booking confirmation sitting in someone's inbox.
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/email-send-samples.mts you@example.com
 */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const to = process.argv[2];
if (!to || !to.includes("@")) {
  console.error("Usage: npx tsx --conditions=react-server scripts/email-send-samples.mts you@example.com");
  process.exit(1);
}

const { sendEmail, emailConfigured } = await import("../src/lib/email.js");
const { buildSamples } = await import("./email-samples.mjs");

if (!emailConfigured) {
  console.error("RESEND_API_KEY is not set — nothing would send.");
  process.exit(1);
}

const samples = await buildSamples();
console.log(`\nSending ${samples.length} templates to ${to}\n`);

let sent = 0;
for (const s of samples) {
  const subject = `[Sample] ${s.subject}`;
  try {
    await sendEmail({ to, subject, html: s.html });
    sent += 1;
    console.log(`  sent   ${s.label.padEnd(26)} ${subject}`);
  } catch (err) {
    console.log(`  FAILED ${s.label.padEnd(26)} ${err}`);
  }
  // Resend's default limit is a couple of requests a second.
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\n${sent}/${samples.length} sent. Check spam too — that is part of the test.\n`);
