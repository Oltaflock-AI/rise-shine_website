/**
 * The dashboard's copy of the Rise & Shine email shell.
 *
 * A deliberate port of the main site's `src/lib/email-brand.ts`, not an import:
 * this is a separate Next app with its own package manifest and no path into
 * `src/`, and vendoring 80 lines of table HTML beats coupling two deploys. The
 * tokens, the navy header, the red rule and the footer are copied verbatim so a
 * password-reset mail sits in the same inbox as a booking confirmation and
 * reads as the same sender. If the palette moves there, move it here.
 *
 * The same constraints apply as in the original, and they are why this is
 * hand-written table HTML rather than the dashboard's own CSS:
 *
 * - Outlook renders with Word's engine — no flexbox, no grid, no radius on a
 *   div — and Gmail strips external stylesheets, so every style is inline.
 * - Web fonts mostly do not load; Helvetica/Arial is what most people see.
 * - Images are blocked by default in many inboxes, so the logo carries alt text
 *   that reads as a wordmark and nothing depends on an image rendering. The
 *   reset link is a text link as well as a button for the same reason.
 * - Dark mode inverts what it likes, so every colour is declared explicitly.
 */

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
  /** The tint behind a callout — red at 6%, so it reads as brand, not as a state. */
  redSoft: "#fdeced",
} as const;

export const FONT = "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** .com is the live site; .in now redirects to it, so link the destination. */
const LOGO = "https://www.riseandshinetravel.com/brand/logo-white.png";
const SITE_URL = "https://www.riseandshinetravel.com";

/** Mirrors src/data/site.ts. Kept literal so this file has no cross-app import. */
const NAP = {
  name: "Rise & Shine Travels",
  established: 2011,
  email: "info@riseandshinetravel.com",
  landlineDisplay: "+91 79 2329 7232",
  landlineHref: "tel:+917923297232",
  mobileDisplay: "+91 88660 10022",
  mobileHref: "tel:+918866010022",
} as const;

export const esc = (s: string): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A call-to-action. Padding on the `<a>` rather than the cell, so the whole
 * button is clickable in clients that ignore cell padding on links.
 */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
  <tr><td align="center" bgcolor="${C.red}" style="background:${C.red};background-image:linear-gradient(135deg,${C.red} 0%,${C.redDeep} 100%);border-radius:999px;">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.white};text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** A tinted aside. Same red rule in every email. */
export function callout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background:${C.redSoft};border-left:4px solid ${C.red};border-radius:8px;">
  <tr><td style="padding:14px 16px;font-family:${FONT};font-size:13.5px;line-height:1.6;color:${C.inkSoft};">${html}</td></tr>
</table>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.charcoal};">${html}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:23px;line-height:1.25;font-weight:800;color:${C.ink};">${esc(text)}</h1>`;
}

export interface ShellOpts {
  /** Small caps line above the headline — the category label. */
  kicker: string;
  /**
   * The grey line under the subject in an inbox list. Without one, clients
   * scrape the first words of the body — a wasted second line on every send.
   */
  preheader: string;
}

export function shell(body: string, opts: ShellOpts): string {
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

  <tr><td style="height:4px;background:${C.red};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:30px 30px 8px;">
    <div style="font-family:${FONT};font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.red};margin-bottom:10px;">${esc(opts.kicker)}</div>
    ${body}
  </td></tr>

  <tr><td style="padding:22px 30px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
      <tr><td style="padding-top:18px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">
        Trouble signing in? Reply to this email, call
        <a href="${NAP.landlineHref}" style="color:${C.navyLight};text-decoration:none;font-weight:700;">${NAP.landlineDisplay}</a>
        or
        <a href="${NAP.mobileHref}" style="color:${C.navyLight};text-decoration:none;font-weight:700;">${NAP.mobileDisplay}</a>.
      </td></tr>
    </table>
  </td></tr>

  <tr><td bgcolor="${C.cream}" style="background:${C.cream};padding:20px 30px;border-top:1px solid ${C.line};">
    <div style="font-family:${FONT};font-size:12px;line-height:1.65;color:${C.muted};">
      <strong style="color:${C.ink};">${NAP.name}</strong> &middot; Est. ${NAP.established} &middot; Ahmedabad<br>
      <a href="${SITE_URL}" style="color:${C.navyLight};text-decoration:none;">riseandshinetravel.com</a>
      &middot; <a href="mailto:${NAP.email}" style="color:${C.navyLight};text-decoration:none;">${NAP.email}</a>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
