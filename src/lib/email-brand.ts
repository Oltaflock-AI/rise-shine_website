/**
 * Rise & Shine — the email design system.
 *
 * Every transactional and marketing email is assembled from the primitives here
 * so a booking confirmation, a welcome note and an offer read as the same
 * company. Tokens mirror `globals.css`; when the site's palette or type scale
 * moves, move it here too.
 *
 * Why this is hand-written table HTML rather than the site's components:
 *
 * - **Email clients are not browsers.** Outlook renders with Word's engine —
 *   no flexbox, no grid, no `border-radius` on a `<div>`, and external
 *   stylesheets are stripped by Gmail. Every style is inline, every layout is a
 *   table, and nothing depends on CSS that arrived in this decade.
 * - **Web fonts mostly do not load.** Roboto is named first for the clients that
 *   honour it, then Helvetica/Arial, which is what most recipients will actually
 *   see. Nothing may depend on the brand font rendering — no tight tracking, no
 *   thin weights, no script face for anything that must be read. Dancing Script
 *   appears nowhere here on purpose.
 * - **Images are blocked by default** in a large share of inboxes. The logo has
 *   alt text that reads as a wordmark, and no email is comprehensible only with
 *   images on.
 * - **Dark mode inverts what it likes.** Colours are declared explicitly on every
 *   element, including backgrounds, so a client's auto-invert has less to guess at.
 *
 * Preview all of them: `npx tsx --conditions=react-server scripts/email-preview.mts`
 */

import { site } from "@/data/site";

// ── palette (mirrors globals.css) ────────────────────────────────────────────

export const C = {
  red: "#e21e26",
  redDeep: "#8d191c",
  navy: "#083249",
  navyLight: "#0e4a68",
  charcoal: "#404041",
  cream: "#f7f8f9",
  cream2: "#eef2f4",
  line: "#e2e7ea",
  ink: "#102a39",
  inkSoft: "#45525c",
  muted: "#5e6a72",
  white: "#ffffff",
  // Status accents. Deliberately few: the brand is red + navy, and a rainbow of
  // states would read as a different company each time.
  success: "#0f7a4d",
  successSoft: "#e8f4ee",
  warn: "#9a5b00",
  warnSoft: "#fdf3e3",
} as const;

/**
 * The accent a given email leads with. This is the "colour coding" — the kicker,
 * the rule under the header and any status pill take the tone, while the rest of
 * the layout stays identical, so the category is legible at a glance without the
 * email looking like it came from somewhere else.
 */
export type Tone = "confirm" | "account" | "offer" | "notice";

const TONES: Record<Tone, { accent: string; soft: string; label: string }> = {
  confirm: { accent: C.success, soft: C.successSoft, label: "Confirmed" },
  account: { accent: C.navyLight, soft: C.cream2, label: "Your account" },
  offer: { accent: C.red, soft: "#fdeaeb", label: "Offer" },
  notice: { accent: C.warn, soft: C.warnSoft, label: "Action needed" },
};

export const FONT = "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The logo is served from the .in host — .com still serves the old static site. */
const LOGO = "https://www.riseandshinetravel.in/brand/logo-white.png";
const SITE_URL = "https://www.riseandshinetravel.in";

export const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹ as an entity — the glyph itself drops to a box in older Outlook. */
export const rupees = (n: number): string => `&#8377;${inr.format(n)}`;

// ── primitives ───────────────────────────────────────────────────────────────

/**
 * A call-to-action. Padding on the `<a>` rather than the cell, so the whole
 * button is clickable in clients that ignore cell padding on links.
 */
export function button(label: string, href: string, tone: Tone = "offer"): string {
  const bg = tone === "confirm" ? C.navy : TONES[tone].accent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
  <tr><td align="center" bgcolor="${bg}" style="border-radius:999px;">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.white};text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** One label/value line inside a details panel. */
export function row(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:13px;color:${C.muted};white-space:nowrap;vertical-align:top;">${label}</td>
    <td align="right" style="padding:9px 0 9px 16px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};">${valueHtml}</td>
  </tr>`;
}

/** The panel those rows sit in. */
export function detailsTable(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${C.cream};border:1px solid ${C.line};border-radius:12px;padding:6px 18px;">
  ${rowsHtml}
</table>`;
}

/** A tinted aside — the one place a tone colour carries meaning in the body. */
export function callout(html: string, tone: Tone = "account"): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${t.soft};border-left:4px solid ${t.accent};border-radius:8px;">
  <tr><td style="padding:14px 16px;font-family:${FONT};font-size:13.5px;line-height:1.6;color:${C.inkSoft};">${html}</td></tr>
</table>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.charcoal};">${html}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:23px;line-height:1.25;font-weight:800;color:${C.ink};">${esc(text)}</h1>`;
}

// ── the shell every email shares ─────────────────────────────────────────────

export interface ShellOpts {
  /** Small caps line above the headline — the category label. */
  kicker: string;
  tone: Tone;
  /**
   * The grey line under the subject in an inbox list. Without one, clients
   * scrape the first words of the body, which is usually "Hi Hardik," — a
   * wasted second line on every email we send.
   */
  preheader: string;
  /** Marketing mail must offer a way out; transactional mail must not pretend to. */
  unsubscribeUrl?: string;
}

export function shell(body: string, opts: ShellOpts): string {
  const t = TONES[opts.tone];
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.kicker)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream2};font-family:${FONT};color:${C.charcoal};-webkit-font-smoothing:antialiased;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream2};padding:28px 12px;">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${C.white};border-radius:16px;overflow:hidden;border:1px solid ${C.line};">

  <tr><td bgcolor="${C.navy}" style="background:${C.navy};background-image:linear-gradient(135deg,${C.navy} 0%,${C.navyLight} 100%);padding:24px 30px;">
    <img src="${LOGO}" width="150" height="56" alt="Rise &amp; Shine Travels" style="display:block;border:0;height:auto;max-width:150px;">
  </td></tr>

  <tr><td style="height:4px;background:${t.accent};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:30px 30px 8px;">
    <div style="font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${t.accent};margin-bottom:10px;">${esc(opts.kicker)}</div>
    ${body}
  </td></tr>

  <tr><td style="padding:22px 30px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
      <tr><td style="padding-top:18px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">
        Questions? Reply to this email, call
        <a href="${site.phone.landlineHref}" style="color:${C.navyLight};text-decoration:none;font-weight:700;">${site.phone.landlineDisplay}</a>
        or
        <a href="${site.phone.mobileHref}" style="color:${C.navyLight};text-decoration:none;font-weight:700;">${site.phone.mobileDisplay}</a>.
      </td></tr>
    </table>
  </td></tr>

  <tr><td bgcolor="${C.cream}" style="background:${C.cream};padding:20px 30px;border-top:1px solid ${C.line};">
    <div style="font-family:${FONT};font-size:12px;line-height:1.65;color:${C.muted};">
      <strong style="color:${C.ink};">${esc(site.name)}</strong> &middot; Est. ${site.established} &middot; Ahmedabad<br>
      <a href="${SITE_URL}" style="color:${C.navyLight};text-decoration:none;">riseandshinetravel.in</a>
      &middot; <a href="mailto:${site.email}" style="color:${C.navyLight};text-decoration:none;">${site.email}</a>
      ${
        opts.unsubscribeUrl
          ? `<br><br><a href="${esc(opts.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;">Unsubscribe from offers</a> &mdash; you will still receive booking confirmations.`
          : ""
      }
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
