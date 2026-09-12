import { describe, expect, it } from "vitest";
import { decideAlert } from "../src/lib/ops-health";

/**
 * The alert de-duplication rules. These decide whether a human ever hears about
 * an outage, so every branch is pinned: over-alerting trains people to filter
 * the address (and the next real outage lands in a muted folder), while
 * under-alerting is the silent failure the monitor exists to end.
 */
const NOW = new Date("2026-09-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("decideAlert", () => {
  it("says nothing while a healthy check stays healthy", () => {
    const d = decideAlert({
      prevStatus: "ok",
      since: ago(5 * HOUR),
      lastAlertAt: null,
      ok: true,
      now: NOW,
    });
    expect(d.reason).toBe("none");
    // An unchanged state keeps its original start time.
    expect(d.since.toISOString()).toBe(ago(5 * HOUR));
  });

  it("alerts on the transition into failure and starts the clock", () => {
    const d = decideAlert({
      prevStatus: "ok",
      since: ago(5 * HOUR),
      lastAlertAt: null,
      ok: false,
      now: NOW,
    });
    expect(d.reason).toBe("transition");
    expect(d.since).toEqual(NOW);
  });

  it("alerts the first time a check is ever seen failing", () => {
    const d = decideAlert({ prevStatus: null, since: null, lastAlertAt: null, ok: false, now: NOW });
    expect(d.reason).toBe("transition");
  });

  it("stays quiet while a known failure is still inside the reminder window", () => {
    const d = decideAlert({
      prevStatus: "fail",
      since: ago(2 * HOUR),
      lastAlertAt: ago(2 * HOUR),
      ok: false,
      now: NOW,
    });
    expect(d.reason).toBe("none");
  });

  it("reminds once the window has passed, without resetting the outage start", () => {
    const d = decideAlert({
      prevStatus: "fail",
      since: ago(8 * HOUR),
      lastAlertAt: ago(7 * HOUR),
      ok: false,
      now: NOW,
    });
    expect(d.reason).toBe("reminder");
    expect(d.since.toISOString()).toBe(ago(8 * HOUR));
  });

  it("re-alerts when the stored state could not be read, rather than going quiet", () => {
    const d = decideAlert({
      prevStatus: "fail",
      since: ago(1 * HOUR),
      lastAlertAt: ago(1 * HOUR),
      ok: false,
      stateReadFailed: true,
      now: NOW,
    });
    expect(d.reason).toBe("transition");
  });

  it("announces a recovery", () => {
    const d = decideAlert({
      prevStatus: "fail",
      since: ago(3 * HOUR),
      lastAlertAt: ago(3 * HOUR),
      ok: true,
      now: NOW,
    });
    expect(d.reason).toBe("recovery");
    expect(d.since).toEqual(NOW);
  });

  it("does not call a first-ever healthy result a recovery", () => {
    const d = decideAlert({ prevStatus: null, since: null, lastAlertAt: null, ok: true, now: NOW });
    expect(d.reason).toBe("none");
  });
});

/**
 * Two failing runs before anyone hears about it. A single 5-minute blip used
 * to send DOWN and Recovered five minutes apart — ten mails overnight on
 * 12-Sep-2026 for nothing anyone could act on.
 */
describe("decideAlert with confirm", () => {
  const base = { since: ago(5 * HOUR), lastAlertAt: null, confirm: true, now: NOW };

  it("stores the first failure as suspect and says nothing", () => {
    const d = decideAlert({ ...base, prevStatus: "ok", ok: false });
    expect(d.reason).toBe("suspect");
    expect(d.status).toBe("suspect");
    expect(d.since).toEqual(NOW);
  });

  it("alerts on the second failure, dated from the first", () => {
    const d = decideAlert({ ...base, prevStatus: "suspect", since: ago(5 * 60_000), ok: false });
    expect(d.reason).toBe("transition");
    expect(d.status).toBe("fail");
    expect(d.since.toISOString()).toBe(ago(5 * 60_000));
  });

  it("swallows a blip: ok after suspect is not a recovery", () => {
    const d = decideAlert({ ...base, prevStatus: "suspect", since: ago(5 * 60_000), ok: true });
    expect(d.reason).toBe("none");
    expect(d.status).toBe("ok");
  });

  it("still recovers from a confirmed failure", () => {
    const d = decideAlert({ ...base, prevStatus: "fail", ok: true });
    expect(d.reason).toBe("recovery");
  });

  it("money checks skip confirmation", () => {
    const d = decideAlert({ ...base, confirm: false, prevStatus: "ok", ok: false });
    expect(d.reason).toBe("transition");
    expect(d.status).toBe("fail");
  });

  it("a failed state read still alerts rather than waiting", () => {
    const d = decideAlert({ ...base, prevStatus: null, stateReadFailed: true, ok: false });
    expect(d.reason).toBe("transition");
  });
});
