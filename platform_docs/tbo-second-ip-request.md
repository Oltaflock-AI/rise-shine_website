# Second egress IP at TBO — get it whitelisted BEFORE it is needed

TBO whitelists one IP per agency and takes days to add one. Today the only
whitelisted IP is the DigitalOcean droplet `64.227.157.194`. If that box dies,
bookings stop until TBO answers a ticket. The fix is to have a second IP
already on file, so a cutover is a `TBO_PROXY_URL` env edit instead of a wait.

**Status: not sent. Do this once the second proxy exists** (either a second
DO droplet with a reserved IP, or the managed provider in
`tbo-proxy-managed-fallback.md`). Whitelisting an IP that does not exist yet
just gets asked "which IP?".

## Email

**To:** apiintegrationteam@tbo.com
**Cc:** the account manager on the existing integration thread
**Subject:** IP whitelist addition — Rise & Shine Travels (Agency 63641 / 58394)

> Hi team,
>
> Please add a second egress IP to the whitelist for our API integration, on
> both agencies:
>
> - Flights — Agency ID 63641 (production)
> - Hotels — Agency ID 58394 (certification, moving to production)
>
> Existing IP (keep): 64.227.157.194
> New IP (add): `<second proxy IP>`
>
> Both are static IPs on infrastructure we operate. The second one is a
> standby for failover; all traffic will continue from the existing IP until
> you confirm the addition. Please do not remove the existing IP.
>
> Portal login for verification: tbo.demo@riseandshinetravel.com
>
> Thanks,
> Khush — Rise & Shine Travels

## After they confirm

1. `scripts/flight-cert.mts`-style search through the new proxy (set
   `TBO_PROXY_URL` locally) — must return offers, not `Invalid IP`.
2. Note both IPs in `reference/` and in the memory file `tbo-flight-certification`.
3. The failover is then: Vercel env `TBO_PROXY_URL` → second proxy → redeploy.
   Two minutes, no ticket.
