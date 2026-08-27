/**
 * TBO's hotel description is structured prose that we were rendering as mush.
 *
 * The raw field is HTML, and it already carries its own section headings:
 *
 *   <p><strong>Hotel Overview:</strong> Movenpick Hotel &amp; Apartments …</p>
 *   <p><strong>Accommodations:</strong> … 255 elegantly appointed guestrooms …</p>
 *   <p><strong>Amenities:</strong> …</p>
 *
 * Stripping the tags to plain text threw that structure away and produced a
 * uniform grey wall under a single "About this property" heading — accurate,
 * unreadable, and the reason the section looked unfinished.
 *
 * This recovers the headings so they can be rendered as headings. It never
 * returns HTML: every value is plain text, so a caller cannot accidentally
 * inject supplier markup into the page.
 *
 * Pure and dependency-free: `tests/hotel-description.test.ts` covers it.
 */

export type DescriptionSection = {
  /** "Hotel Overview", "Accommodations" … or "" for text before any heading. */
  heading: string;
  /** Plain-text paragraphs belonging to that heading. */
  paragraphs: string[];
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&hellip;": "…",
  "&ndash;": "–",
  "&mdash;": "—",
  "&rsquo;": "’",
  "&lsquo;": "‘",
};

/** Tags out, entities in, whitespace normalised. Never returns markup. */
export function toPlainText(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t ]+/g, " ")
    .trim();
}

/**
 * Split into `<p>`-ish blocks. TBO is inconsistent: some suppliers use `<p>`,
 * others only `<br>`, and a few send one unbroken string. All three have to
 * come out as paragraphs or the fallback is a wall of text again.
 */
function blocks(html: string): string[] {
  return (
    (html || "")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .split(/\n{2,}/)
      // Drop the block's own opening tag, or the heading test below — which is
      // anchored at the start — never sees the <strong> sitting behind a <p>.
      .map((b) =>
        b
          .trim()
          .replace(/^<(?:p|div|span)[^>]*>\s*/i, "")
          .trim(),
      )
      .filter(Boolean)
  );
}

/** A leading `<strong>`/`<b>` that ends in a colon is a section heading. */
const LEADING_HEADING =
  /^\s*<(?:strong|b)\s*>([^<]{2,60}?)\s*:?\s*<\/(?:strong|b)\s*>\s*:?/i;
/** Some suppliers send no markup at all — "Hotel Overview: text". */
const PLAIN_HEADING = /^\s*([A-Z][A-Za-z /&'-]{2,40}):\s+(?=[A-Z(])/;

export function parseHotelDescription(
  html: string | undefined,
): DescriptionSection[] {
  const out: DescriptionSection[] = [];
  let current: DescriptionSection | undefined;

  const push = (heading: string) => {
    current = { heading, paragraphs: [] };
    out.push(current);
  };

  for (const block of blocks(html ?? "")) {
    let heading = "";
    let rest = block;

    const tagged = LEADING_HEADING.exec(block);
    if (tagged) {
      heading = toPlainText(tagged[1]).replace(/:$/, "").trim();
      rest = block.slice(tagged[0].length);
    } else {
      const plain = PLAIN_HEADING.exec(toPlainText(block));
      if (plain) {
        heading = plain[1].trim();
        rest = toPlainText(block).slice(plain[0].length);
      }
    }

    const text = toPlainText(rest);
    if (heading) push(heading);
    else if (!current) push("");
    if (text) current!.paragraphs.push(text);
  }

  // A heading with nothing under it is a rule with no content — drop it.
  return out.filter((s) => s.paragraphs.length > 0);
}

/** One "Layout - Separate sitting area" run out of a room description. */
export type RoomDescriptionPart = {
  /** "Layout", "Food & Drink" … or "" for the text before the first label. */
  label: string;
  text: string;
};

/**
 * A room's `RoomDescription` is labelled prose that arrives as ONE line.
 *
 * TBO sends it exactly like this, spaces and all:
 *
 *   "1 King Bed 355 sq feet Layout - Separate sitting area Internet - Free
 *    WiFi and wired internet access Entertainment - LED television …"
 *
 * Printed verbatim it is a 60-word run-on where six sections have been welded
 * together, which is how the room panel came to look like a data dump. The
 * labels are the supplier's own — "Layout -", "Internet -", "Food & Drink -",
 * "Bathroom -" — so they can be recovered and rendered as labels.
 *
 * A hyphen only splits when it is spaced AND follows a short capitalised
 * label: "24-hour room service" and "blackout drapes/curtains" have to survive
 * intact, and they are exactly what a greedy split destroys.
 *
 * Falls back to a single unlabelled part, so a supplier who writes ordinary
 * prose still renders. Pure: `tests/hotel-description.test.ts` covers it.
 */
const ROOM_LABEL = /(^|[\s.,;])([A-Z][A-Za-z&/]*(?:[ ][A-Z&][A-Za-z&/]*){0,2})\s-\s/g;

export function parseRoomDescription(
  raw: string | undefined,
): RoomDescriptionPart[] {
  // Suppliers leave a space before punctuation ("minibar fees may apply ,").
  const text = toPlainText(raw ?? "").replace(/\s+([,;.])/g, "$1");
  if (!text) return [];

  const parts: RoomDescriptionPart[] = [];
  let label = "";
  let cursor = 0;
  ROOM_LABEL.lastIndex = 0;
  for (let m = ROOM_LABEL.exec(text); m; m = ROOM_LABEL.exec(text)) {
    const startOfLabel = m.index + m[1].length;
    const chunk = text.slice(cursor, startOfLabel).trim();
    if (chunk) parts.push({ label, text: chunk });
    label = m[2].trim();
    cursor = ROOM_LABEL.lastIndex;
  }
  const tail = text.slice(cursor).trim();
  if (tail) parts.push({ label, text: tail });

  return parts.filter((p) => p.text);
}
