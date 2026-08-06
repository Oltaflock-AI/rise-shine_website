import "server-only";

/**
 * tboFetch — the ONE fetch every TBO call must go through.
 *
 * TBO production credentials are IP-whitelisted, but Vercel functions have no
 * fixed egress IP. When `TBO_PROXY_URL` is set (http://user:pass@host:port —
 * our static-IP forward proxy; see reference/hotel-cert/static-ip-proxy/),
 * requests are routed through it via an undici ProxyAgent so TBO always sees
 * the whitelisted IP. Unset (dev/staging) → plain direct fetch, identical
 * behavior to before.
 *
 * WHY undici's `fetch` and not the global one: Node's built-in fetch validates
 * `dispatcher` against its OWN internal copy of undici, so a ProxyAgent built
 * from the npm `undici` package is refused with UND_ERR_INVALID_ARG. Next does
 * not change that — patch-fetch.js wraps the existing global fetch, and Next's
 * undici polyfill only ever applied to Node < 18. Using the global fetch here
 * would make every TBO call throw the moment TBO_PROXY_URL was set in
 * production. Verified against the live proxy; see that folder's README.
 *
 * The direct (unproxied) path deliberately stays on the global fetch, so
 * dev/staging behaviour is byte-for-byte what it was before.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

let agent: ProxyAgent | null | undefined;

function dispatcher(): ProxyAgent | undefined {
  if (agent === undefined) {
    const url = process.env.TBO_PROXY_URL?.trim();
    agent = url ? new ProxyAgent(url) : null;
  }
  return agent ?? undefined;
}

export function tboFetch(url: string, init: RequestInit): Promise<Response> {
  const d = dispatcher();
  if (!d) return fetch(url, init);
  // undici's fetch is the only one that accepts an npm-undici dispatcher. Its
  // Response is structurally the global one (callers use .ok/.status/.json()),
  // but the two libs' types are nominally distinct, hence the cast.
  return undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: d,
  }) as unknown as Promise<Response>;
}
