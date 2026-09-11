import { describe, expect, it } from "vitest";
import { RESET_SUBJECT, resetEmailHtml } from "@/lib/email";

const LINK = "https://admin.riseandshinetravel.com/reset?token=abc123_-";

function html(over: Partial<{ link: string; minutes: number; email: string }> = {}) {
  return resetEmailHtml({ link: LINK, minutes: 45, email: "someone@example.com", ...over });
}

describe("resetEmailHtml", () => {
  it("carries the link twice — as a button and as readable text", () => {
    // Some corporate clients strip anchors or rewrite them through a scanner.
    // A reset email whose one link fails to render is worth nothing.
    const occurrences = html().split(LINK).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3); // button href + text href + text body
  });

  it("states the expiry it was given, so the copy cannot drift from the TTL", () => {
    expect(html({ minutes: 45 })).toContain("45 minutes");
    expect(html({ minutes: 20 })).toContain("20 minutes");
    expect(html({ minutes: 20 })).not.toContain("45 minutes");
  });

  it("names the account the link opens", () => {
    expect(html({ email: "ops@riseandshinetravel.com" })).toContain("ops@riseandshinetravel.com");
  });

  it("escapes an address rather than letting it close a tag", () => {
    const out = html({ email: 'x"><script>alert(1)</script>@e.com' });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("wears the brand shell: navy header, red rule, wordmark alt text", () => {
    const out = html();
    expect(out).toContain("#083249"); // navy header
    expect(out).toContain("#e21e26"); // red rule and CTA
    expect(out).toContain('alt="Rise &amp; Shine Travels"');
    expect(out).toContain("logo-white.png");
  });

  it("gives inboxes a preheader instead of letting them scrape the first line", () => {
    expect(html()).toContain("Your password reset link");
  });

  it("declares a subject that says what it is", () => {
    expect(RESET_SUBJECT).toMatch(/reset/i);
  });

  it("keeps every style inline — Gmail strips <style> blocks", () => {
    expect(html()).not.toMatch(/<style[\s>]/i);
  });
});
