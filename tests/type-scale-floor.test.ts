import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * globals.css sets 13px (`--text-meta`) as the hard floor for anything a guest
 * is expected to read, and says so: "Never go below --text-meta."
 *
 * That comment was already there when a mobile audit found 68 arbitrary
 * Tailwind sizes underneath it, down to 0.72rem — 11.5px — carrying the price
 * line on the hotel card among other things. A comment is not a guard, so this
 * is the guard: it fails the build rather than the review.
 *
 * Named steps (`text-meta`, `text-body`, `text-lead`) are always fine. An
 * arbitrary size at or above the floor is left alone — this test is about the
 * floor, not about banning arbitrary values.
 */
const FLOOR_REM = 0.8125;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("type scale — 13px is the floor", () => {
  it("has no arbitrary text size below --text-meta", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles("src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/text-\[([0-9.]+)(rem|px)\]/g)) {
          const rem = m[2] === "px" ? Number(m[1]) / 16 : Number(m[1]);
          if (rem < FLOOR_REM) {
            offenders.push(`${file}:${i + 1} ${m[0]} (${(rem * 16).toFixed(1)}px)`);
          }
        }
      });
    }

    expect(offenders, `Use text-meta (13px) instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
