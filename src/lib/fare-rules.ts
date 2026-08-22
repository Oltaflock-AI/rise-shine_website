import "server-only";

/**
 * TBO FareRule text → HTML safe to render.
 *
 * `FareRuleDetail` is airline-authored HTML that TBO passes through untouched: tables
 * of penalties, `<fieldset>` blocks, `<br/>` soup, and — for some carriers — stray
 * unbalanced tags. It is the ONLY place the full refund/change conditions exist, so it
 * has to be shown rather than summarised. But it is third-party markup arriving over a
 * plain HTTP API, so it is never handed to the browser as-is.
 *
 * This is an allowlist sanitiser, not a blocklist: every tag not named below is
 * dropped, and every attribute is dropped except table spans. That removes `<script>`,
 * `<iframe>`, `<style>`, `on*=` handlers, `href`/`src` (so no javascript: URLs), and
 * anything a future airline decides to embed — without needing a dependency.
 */

/** Tags kept. Everything else is unwrapped (content preserved) or dropped entirely. */
const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "br", "p", "div", "span", "hr",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "fieldset", "legend", "h3", "h4", "h5", "small", "sup", "sub", "pre",
]);
/** Tags whose CONTENT is discarded too — text inside them is never display copy. */
const DROP_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg"];
/** The only attributes a fare-rule table legitimately needs. */
const ALLOWED_ATTRS = new Set(["colspan", "rowspan"]);

function keptAttrs(raw: string): string {
  const out: string[] = [];
  for (const m of raw.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;
    const value = (m[2] ?? m[3] ?? m[4] ?? "").replace(/[^0-9]/g, "");
    if (value) out.push(`${name}="${value}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/** Matches ONE well-formed tag at the start of a string; quoted attrs may contain ">". */
const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*)>/;

function stripDangerous(input: string): string {
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of DROP_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // Unclosed opener: take the raw text run with it, or a stray "<style>" would
    // spill its CSS onto the page as fare-rule copy.
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[^<]*`, "gi"), "");
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }
  return html;
}

export function sanitizeFareRuleHtml(input: string): string {
  if (!input) return "";
  const html = stripDangerous(input);
  let out = "";
  let i = 0;
  // Scan rather than regex-replace: anything that is not a complete, allowlisted tag
  // is emitted as escaped TEXT, so a truncated "<td" can never reopen the parser.
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const m = TAG.exec(html.slice(lt));
    if (!m) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    const tag = m[2].toLowerCase();
    if (ALLOWED.has(tag)) {
      out += m[1]
        ? `</${tag}>`
        : tag === "br" || tag === "hr"
          ? `<${tag}/>`
          : `<${tag}${keptAttrs(m[3])}>`;
    }
    i = lt + m[0].length;
  }
  return out.trim();
}

/**
 * TBO's stand-in when the supplier publishes no rule text at all — LCCs (IndiGo,
 * SpiceJet) return literally "The FareBasisCode is: R0IP" and nothing else. Verified
 * live on 6E IDR-NMI, 22 Aug 2026. It is not a fare rule; the binding terms for those
 * fares are the MiniFareRules penalty grid, which is rendered separately.
 */
const FARE_BASIS_STUB = /the\s*fare\s*basis\s*code\s*is\s*:?\s*[A-Z0-9]*/gi;

/**
 * True when there is nothing worth showing a customer: only whitespace/markup, or
 * only the fare-basis stub above. Deliberately NOT a minimum length — "Non
 * refundable" is fourteen characters and is the whole rule.
 */
export function isEmptyFareRule(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(FARE_BASIS_STUB, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !text;
}
