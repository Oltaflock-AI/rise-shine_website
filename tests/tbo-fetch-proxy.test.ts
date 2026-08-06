import { describe, it, expect, beforeAll } from "vitest";

/**
 * Guards the one thing that is easy to break and impossible to notice until
 * production: tboFetch must route through TBO_PROXY_URL when it is set.
 *
 * The trap it exists for — passing an npm-undici ProxyAgent to Node's *global*
 * fetch throws UND_ERR_INVALID_ARG, because Node type-checks the dispatcher
 * against its own internal undici. With TBO_PROXY_URL unset (dev, staging, CI)
 * nothing proxies and the bug is invisible; the first time it would ever show
 * up is the moment the variable is set in Vercel Production, and then every
 * flight and hotel call fails at once.
 *
 * Needs a proxy on 127.0.0.1:18888 — start one for free with:
 *   bash reference/hotel-cert/static-ip-proxy/dry-run-local.sh
 * Skips itself when that isn't running, so CI stays green.
 */
const PROXY = "http://rns:dryrunpassword0123456789@127.0.0.1:18888";

let reachable = false;
beforeAll(async () => {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    await fetch("http://127.0.0.1:18888", { signal: c.signal }).catch(() => {});
    clearTimeout(t);
    reachable = true;
  } catch {
    reachable = false;
  }
});

describe.runIf(process.env.TBO_PROXY_TEST === "1")("tboFetch via a live proxy", () => {
  it("routes a TBO host through the proxy", async () => {
    expect(reachable).toBe(true);
    process.env.TBO_PROXY_URL = PROXY;
    const { tboFetch } = await import("@/lib/tbo-fetch");
    const res = await tboFetch("http://api.tektravels.com", { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("lets the proxy's domain filter refuse a non-TBO host", async () => {
    process.env.TBO_PROXY_URL = PROXY;
    const { tboFetch } = await import("@/lib/tbo-fetch");
    const err = await tboFetch("https://api.ipify.org", { method: "HEAD" }).then(
      () => null,
      (e) => e,
    );
    expect(err).not.toBeNull();
    // Must fail because the PROXY refused it — not because the dispatcher was
    // rejected before a single byte left the process. Without this assertion
    // the broken implementation passes this test too.
    expect(err?.cause?.code ?? err?.code).not.toBe("UND_ERR_INVALID_ARG");
  });
});
