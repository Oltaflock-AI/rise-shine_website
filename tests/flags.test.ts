import { describe, expect, it } from "vitest";
import { AUTH_DISABLED } from "../src/lib/flags";

/**
 * The login gate is ON unless the environment says otherwise. Pinned because a
 * hardcoded `true` was once swept into a commit and shipped, removing the gate
 * from flights and hotels site-wide for several minutes. With the value driven
 * by NEXT_PUBLIC_AUTH_DISABLED, no edit to a source file can do that again —
 * and this test fails loudly if anyone puts the constant back.
 */
describe("AUTH_DISABLED", () => {
  it("is off unless NEXT_PUBLIC_AUTH_DISABLED is exactly 'true'", () => {
    expect(process.env.NEXT_PUBLIC_AUTH_DISABLED).not.toBe("true");
    expect(AUTH_DISABLED).toBe(false);
  });
});
