# TBO egress: break-glass plan for replacing the self-hosted proxy

**Status: NOT active. Written 11-Sep-2026, the day the VPS proxy was fixed.** The
DigitalOcean box (64.227.157.194) now runs Squid instead of tinyproxy and the
truncation fault is gone (0/12 failures at 4.3 MB). This is the plan for the day
that approach fails again, so nobody has to research it under pressure.

Every price and limit below is **as of 11-Sep-2026 — verify before buying.**

## The one thing that makes this slow

TBO (TekTravels) whitelists the egress IP **per agency**, and we have two:
flights **63641** (live) and hotels **58394** (certification). Any new IP means a
support ticket per agency, and historically that takes days. During those days
bookings stop **unless the new IP is added while the old one still works**. So
the whole runbook is ordered around one rule: **the old VPS stays up and
whitelisted until TBO has confirmed the new IP on both agencies.** Nothing is
switched before that confirmation.

## When to pull this lever

Any one of these:

- Two proxy outages (healthcheck `tbo_proxy` or `tbo_search` red) in 30 days
  that trace to the VPS rather than TBO.
- A DigitalOcean incident or account action (billing, abuse flag, region
  maintenance) that takes the droplet down or threatens its IP.
- Response truncation returns (`hotelInfoBatch` chunk logs, `/hotels` pages
  with no photos) and one hour of Squid tuning does not settle it.
- The droplet is *destroyed* or recreated (a DigitalOcean **Rebuild** of the
  existing droplet keeps its IP — that path is the SOP in
  `reference/hotel-cert/static-ip-proxy/`; only a destroy/new-droplet loses it).
  Losing the IP is the same TBO ticket as switching provider, so at that point
  switch provider instead.
- Nobody with SSH and Squid knowledge is available for 2+ weeks (intern
  rotation, holiday) and the box is due a kernel/Squid security patch.

Do **not** pull it for a single blip TBO caused: `tbo_proxy` green +
`tbo_search` red = TBO's problem, not ours (`health-probe.ts` comment explains).

## Candidates

| Provider | Cost tier for us (verify) | Dedicated static IP? | HTTPS CONNECT + basic auth? | Limits vs our need (~90k req, ~45 GB/mo, see Sizing) | Region / latency to TBO India | Lock-in |
|---|---|---|---|---|---|---|
| **Vercel Static IPs** (Pro) | **$100/mo per project + $0.187/GB Private Data Transfer in bom1** [1][2][3] | No — "shared pool", an IP pair per region, "shared across a small group of customers" [1] | N/A — no proxy at all; all function egress is NAT'd through the pair | No request or bandwidth caps, only per-GB transfer; 45 GB ≈ $8.4/mo | **Mumbai (bom1) available**; pick the region the functions run in (up to 3) [2] | None: unset `TBO_PROXY_URL`, toggle off |
| **QuotaGuard Static** | Production $49/mo (100k req, 50 GB) → **Business $89/mo (250k req, 200 GB)**; Enterprise $219/mo for dedicated IPs [4][5] | Shared static pair on Starter/Production/Business; **dedicated only on Enterprise**; "IPs stay the same through plan changes" [5] | Yes — HTTP/HTTPS/SOCKS5, outbound HTTPS "tunneled without decrypting" (= CONNECT); URL format not re-verified on the current site [4] | Production is borderline on requests (100k vs ~90k); Business is comfortable. Soft limits, they email before cutting off [5] | **Mumbai (ap-south-1) and Singapore** among 12 AWS regions [5] | Low: it is a `http://user:pass@host:port` URL |
| **Fixie** | Cruiser $19 (25k req, 10 GB) too small → **Hybrid $49/mo (250k req, 50 GB)** or Mountain $99 (1M, 250 GB) [6] | Per-subscriber load-balanced IP pair, "remain consistent"; whether that pair is exclusive to one account is stated on the pricing page as "dedicated" but not in the technical docs — **verify** [6][7] | Yes — `http://fixie:token@sub.usefixie.com:80`, CONNECT tunnelling documented [7][8] | Hybrid's 50 GB is at the edge of our 45 GB estimate; hard cut-off with 407 at 100% [7] | **US and EU only** per docs found; no India/Asia [9] | Low: same URL shape |
| Vercel Secure Compute | Enterprise only, custom pricing [10] | Yes, dedicated VPC + pair | N/A | — | Any Vercel region | Enterprise contract |
| Cloudflare / AWS NAT | Cloudflare Workers has no static egress IP product for this shape; an AWS Lightsail/EC2 + NAT is just our VPS on another provider (same maintenance, same rebuild-means-new-IP risk) | — | — | — | — | Not recommended |

## Recommendation

**Vercel Static IPs in bom1, with QuotaGuard Static (Business, Mumbai) as the
second choice.** Reasons: it removes the proxy hop entirely (no `ProxyAgent`, no
407s, no credential that can leak, no box to patch), it is self-serve on the Pro
plan we already have, it has no request/bandwidth tier to outgrow, and the IP
pair sits in Mumbai next to TBO's hosts. The $100/mo is roughly 2× QuotaGuard
Business, which is the price of not owning any proxy at all.

Two things to accept: the pair is **shared** with other Vercel customers in the
VPC (TBO also authenticates by credential, so a stranger on the same IP cannot
call TBO as us — but their abuse could in theory get the IP blocked), and
**every** outbound byte (Supabase, Cashfree, Resend, ElevenLabs) is metered as
Private Data Transfer — small, but non-zero.

Fall to QuotaGuard if Vercel's shared pool misbehaves, if TBO refuses a shared
IP, or if we need a truly dedicated address (QuotaGuard Enterprise $219). Fixie
is last: no Asian region, and the tier that fits us is also the bandwidth edge.

## Cutover runbook (zero downtime)

The proxy-URL steps are for QuotaGuard/Fixie; the Vercel-specific variants are
marked **[V]**.

1. **Buy and get the IPs.** QuotaGuard/Fixie: choose Mumbai, copy the IP pair
   and the proxy URL. **[V]** Project → Settings → Networking → Manage Active
   Regions → bom1; copy the pair. It is a PAIR — TBO must whitelist both.
2. **Verify from a laptop before touching TBO.** Proxy providers:
   ```
   curl -v -x 'http://USER:PASS@HOST:PORT' https://affiliate.tektravels.com/ -o /dev/null
   # expect "< HTTP/1.1 200 Connection established" in the CONNECT phase
   curl -s -x 'http://USER:PASS@HOST:PORT' https://api.ipify.org   # prints one of the pair
   ```
   The second command succeeding is the warning: a managed proxy allows ANY
   destination, unlike our Squid ACL. A leaked URL is a free open proxy on our
   bill. Mitigate: the URL lives only in Vercel env (Production scope, marked
   sensitive), never in `.env.local.example`, commits or chat; rotate the
   password on day one and again after cutover.
   **[V]** Deploy a preview whose `/api/cron/healthcheck` runs; its `tbo_search`
   will fail (IP not yet whitelisted) — that is expected. To see the egress IP,
   run a one-off preview route that fetches `https://api.ipify.org` and delete it.
3. **Ask TBO to ADD, not replace.** One mail per agency, same day:

   > Subject: Add whitelisted IP — Agency 63641 (Flights API, production)
   >
   > Please ADD the following egress IP addresses to the whitelist for agency
   > 63641: `A.B.C.D` and `E.F.G.H`. Please KEEP the existing IP
   > `64.227.157.194` active — we will run both in parallel and ask you to
   > remove the old one in writing after 30 days. Please confirm by reply once
   > both new IPs are live. Company: Rise & Shine Travels, Ahmedabad.

   Repeat for **58394 (Hotel API, certification, HotelBE `Sharedapi.tektravels.com`)**.
   Chase every 24h. Nothing below happens until both confirmations are in hand.
4. **Switch.** Vercel → Project → Settings → Environment Variables →
   `TBO_PROXY_URL` (Production) = new URL; **[V]** delete `TBO_PROXY_URL` and set
   `"regions": ["bom1"]` in `vercel.json` so the functions run where the pair is
   (verify in the dashboard that Static IPs covers the function region).
   Redeploy; wait out the 15-min Rolling Release canary or `vercel promote`.
   Watch for 30 minutes: `[healthcheck]` log lines — `tbo_proxy` and
   `tbo_search` and `tbo_quote` all `ok` — plus Sentry, then one real search on
   `/flights` and one hotel city search (the 20-parallel burst).
5. **Rollback** = set `TBO_PROXY_URL` back to the VPS URL (and revert the
   `regions` change) and redeploy. The VPS is untouched, still whitelisted, and
   still running Squid. **Keep the droplet alive and paid for 30 days.**
6. **Day 30.** Mail TBO to remove `64.227.157.194` from both agencies, wait for
   confirmation, then destroy the droplet and remove the VPS notes from
   `reference/`.

## Code changes needed

**None for a proxy provider.** `src/lib/tbo-fetch.ts` builds
`new ProxyAgent(process.env.TBO_PROXY_URL)` from any `http://user:pass@host:port`
URL and sends CONNECT through undici's own `fetch`; QuotaGuard and Fixie are
exactly that shape.

The healthcheck's `tbo_proxy` probe (`src/lib/health-probe.ts`, `probeProxy`,
called from `src/app/api/cron/healthcheck/route.ts`) parses `hostname` and
`port` out of `TBO_PROXY_URL` and opens a bare TCP socket with an 8 s timeout —
no CONNECT, no auth, no destination. It therefore **works unchanged** against
any managed proxy host. Its label ("TBO static-IP proxy") and its timeout text
("VPS down or firewalled") are cosmetic; update the string when the VPS is gone.

**[V] Vercel Static IPs:** also no code, but two config edits — unset
`TBO_PROXY_URL` (the probe then reports `ok: "no proxy configured (direct
egress)"`, so `tbo_search` becomes the only egress check, which is fine: a wrong
IP fails it within 5 minutes) and set `regions` in `vercel.json`. Only Node.js
functions are covered; `src/proxy.ts` runs on Node too, and nothing in
`src/proxy.ts` calls TBO, so nothing is lost.

## Sizing

Assume 3,000 TBO calls/day → **~90,000/month**. Sizes vary enormously: auth
and FareQuote are a few kB, a big flight search 1–3 MB, a hotel city search is
≤ 20 parallel `HotelDetails` chunks of ~500 kB each (`INFO_CHUNK = 25`), and the
worst single response we have measured is ~4.3 MB. Taking a pessimistic
**0.5 MB average**: 90,000 × 0.5 MB = **45 GB/month**. Even at an absurd 1 MB
average it is 90 GB.

- **Vercel Static IPs:** $100 + 45 GB × $0.187 = **≈ $108.4/mo**; no caps.
- **QuotaGuard Production ($49):** 100k req / 50 GB — both within 10 % of our
  estimate, so a good month tips over. **Business ($89, 250k / 200 GB)** is the
  right tier.
- **Fixie Hybrid ($49):** 250k req is fine, 50 GB is the same knife-edge; at
  100 % Fixie answers 407 and every booking stops. Mountain ($99, 250 GB) if
  chosen.

Re-do this arithmetic with the real numbers: the Vercel log line
`[healthcheck]` will not tell you volume, but TBO's portal does, and Vercel's
Usage → Private Data Transfer will after step 4.

## Sources

[1] https://vercel.com/docs/networking/static-ips (last_updated 2026-06-30)
[2] https://vercel.com/docs/networking/static-ips/getting-started
[3] https://vercel.com/docs/pricing/regional-pricing/bom1
[4] https://www.quotaguard.com/pricing
[5] https://www.quotaguard.com/products/pricing · https://www.quotaguard.com/products/quotaguard-static
[6] https://usefixie.com/pricing
[7] https://devcenter.heroku.com/articles/fixie
[8] https://usefixie.com/documentation/http-and-https-requests
[9] https://usefixie.com/features · https://elements.heroku.com/addons/fixie (US/EU only)
[10] https://vercel.com/docs/networking/secure-compute (last_updated 2026-07-29)

**Could not verify** (say so, don't guess): whether Vercel's Static IP pair can
ever be rotated by Vercel; whether enabling Static IPs in bom1 forces or merely
follows the function region; Fluid Compute compatibility; whether Fixie's pair
is exclusive to one account (docs say "your" IPs, pricing summary says
"dedicated"); QuotaGuard's current proxy URL format and hard per-response size
or timeout limits on any provider (none documented — test the 4.3 MB
`HotelDetails` case in step 2 before step 3).
