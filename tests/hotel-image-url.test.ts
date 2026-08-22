import { describe, expect, it } from "vitest";
import { normaliseImageUrl } from "../src/lib/tbo-hotel-static";

/**
 * TBO writes photo URLs with a doubled slash after the host. Next's dev
 * optimizer accepts them, Vercel's answers 400 INVALID_IMAGE_OPTIMIZE_REQUEST,
 * so hotel photos rendered locally and were blank in production — verified
 * against the live site: the double-slash form 400s and the single-slash form
 * of the same image returns 200.
 *
 * The query string carries a base64 token containing `/` and `+`. It must
 * survive byte-for-byte, or the URL stops resolving to an image at all.
 */
const TOKEN =
  "FbrGPTrju5e5v0qrAGTD8pPBsj8/wYA5F3wAmN3NGLXscACsjmlFDE2mOHLQqdTQ6LdjikHC22cGxvXxNcz+6d5TYj83aA0mQtNg6HMCG9KVn+be1CXsJw==";

describe("normaliseImageUrl", () => {
  it("collapses TBO's doubled slash after the host", () => {
    expect(normaliseImageUrl(`https://www.tboholidays.com//imageresource.aspx?img=${TOKEN}`)).toBe(
      `https://www.tboholidays.com/imageresource.aspx?img=${TOKEN}`,
    );
  });

  it("leaves the query token untouched, slashes and pluses included", () => {
    const out = normaliseImageUrl(`https://www.tboholidays.com//imageresource.aspx?img=${TOKEN}`);
    expect(out.slice(out.indexOf("?img=") + 5)).toBe(TOKEN);
  });

  it("never touches the scheme's own double slash", () => {
    expect(normaliseImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(normaliseImageUrl("http://example.com/a.jpg")).toBe("http://example.com/a.jpg");
  });

  it("collapses runs deeper in the path too", () => {
    expect(normaliseImageUrl("https://x.com//a///b//c.jpg")).toBe("https://x.com/a/b/c.jpg");
  });

  it("leaves an already-clean URL alone", () => {
    const clean = "https://www.tboholidays.com/imageresource.aspx?img=abc";
    expect(normaliseImageUrl(clean)).toBe(clean);
  });

  it("returns unparseable input untouched rather than dropping it", () => {
    expect(normaliseImageUrl("not a url")).toBe("not a url");
    expect(normaliseImageUrl("")).toBe("");
    expect(normaliseImageUrl("   ")).toBe("");
  });
});
