# Domain cutover — pre-flight findings before Phase A

**From:** Adnan Barwaniwala
**Date:** 2026-08-10
**Re:** `RiseShine-Domain-Cutover-SOP.pdf` v1.0 (Khush Mutha, 8 Aug 2026)
**Status:** Phase A partially done. Theft Protection enabled on `.com` and verified
in WHOIS. No DNS record has been changed; nothing is live-affecting yet.

I re-verified every value in the SOP's facts sheet against live DNS and WHOIS
before starting, as Section 3 instructs. **The facts sheet is accurate** — every
figure on p.7–8 still holds on 10 August.

Five things came up that are not in the runbook. **Item 0 is more urgent than the
cutover itself** and needs a decision from you within weeks, not months.

---

## 0. MOST URGENT — nothing will renew these domains, and they expire in 115 days

The SOP flagged this as a possibility on p.12. It is now confirmed from inside the
panel, and it is worse than "check the setting":

| | Status |
|---|---|
| `riseandshinetravel.com` | expires **3 December 2026** |
| `riseandshinetravel.in` | expires **3 December 2026** |
| Auto-renew | **off / not offered** on both |
| Funds or payment method on the panel | **none** |
| Vendor who used to renew them | **contract terminated** |

So the current trajectory is: on 3 December 2026 both domains lapse. When they do,
the website and **every Microsoft 365 mailbox on the domain stop at the same
moment.** This is a larger business risk than anything in the cutover, and the
cutover does not address it — moving DNS to Cloudflare does not keep a lapsed
registration alive.

**Recommendation: renew in place, now, and decouple it from everything else.**

- Renewing does **not** waste the remaining time — a renewal adds to the existing
  expiry date. Renewing today for one year moves both to 3 December 2027. There is
  no reason to wait until November.
- Renewal does **not** depend on Finding A. It needs funds or a payment method on
  the panel, nothing else. It can be done while the registrant-email question is
  still open.
- Doing it now converts a hard deadline into a routine task.

**Sequencing warning if you intend to transfer the domains to our own registrar
instead.** Two constraints interact:

1. Changing the registrant email may trigger a ~60-day transfer lock (worth
   confirming with PDR — see Finding A).
2. I have just enabled Theft Protection, which must be turned **off** deliberately
   before any transfer.

If a transfer is the intended renewal route, the registrant-email change needs to
happen by **early October at the latest** for a 60-day lock to clear before
3 December. Left until November, the lock itself would push past the expiry.
Renewing in place removes this timing pressure entirely, which is why I would do
that first regardless of the longer-term plan.

**What I need from you:** who pays for the renewal, and by what method. I have not
attempted any purchase and will not.

---

## 0b. TRAP — the panel's "DNS Management" shows a decoy zone

**Phase B cannot be completed as the SOP describes it**, and the reason is a
near-miss worth reading carefully.

Opening **DNS Management** for `riseandshinetravel.com` in `bookdomain.info`
displays a zone marked **Active**, with plausible-looking records. It is not the
live zone. The domain is delegated to `ns11/ns12.linux4hosting.com`; the panel is
showing a dormant zone on `doma82566.*.orderbox-dns.com` that nothing resolves
against.

I queried those nameservers directly rather than trusting the screen. The panel's
zone contains **one record out of fifteen**:

| Record | Live (`linux4hosting`) | Panel (`orderbox-dns`) |
|---|---|---|
| SOA serial | `2026071001` (10 Jul 2026) | `2025032702` (**27 Mar 2025**) |
| A `@` | `192.185.129.235` | missing |
| **MX** | `…mail.protection.outlook.com` | **missing** |
| TXT SPF | `v=spf1 include:spf.protection.outlook.com -all` | **missing** |
| TXT `MS=` | `MS=ms42354314` | present |
| CNAME `www` | → apex | missing |
| CNAME `autodiscover` | → `autodiscover.outlook.com` | missing |
| `mail` `ftp` `cpanel` `webmail` `webdisk` `whm` | present | missing |

**Had we treated this as the zone** — or repointed the nameservers to
`orderbox-dns.com`, which is the intuitive move since it is the panel's own DNS —
the result would have been: website down, **all Microsoft 365 mail down**, outgoing
mail to spam, Outlook auto-config broken. Every failure the runbook exists to
prevent, self-inflicted, in one action.

This is more dangerous than the case the SOP's troubleshooting anticipates
(*"panel won't let you edit DNS at all"*). Being shown the wrong zone, marked
Active, and permitted to edit it is a worse failure mode than a refusal.

### Why Phase B is blocked

The live zone is on Spick's hosting infrastructure (SOA contact `info.spicktech.com`),
reachable only via that hosting account's cPanel — which is **not** under Customer
ID 19542065. I also attempted `AXFR` (zone transfer) against both live nameservers
as a clean way to obtain a guaranteed-complete copy. Refused on both, correctly.

**Three routes, in my order of preference:**

1. **Ask Spick to send a zone file export.** Right answer, five minutes of their
   time, and they still have it. Time-sensitive — worth asking while a working
   relationship remains. **This is what I need you to request.**
2. **Obtain the hosting account's cPanel login.** Its Zone Editor is authoritative.
   Did Rise & Shine ever hold those credentials?
3. **Proceed on my external scan.** 15 records, each verified live on 2026-08-10,
   including six the SOP's Appendix A states do not exist. Structural limit: a
   probe only finds names it thinks to ask for, so it cannot prove completeness.

Gate B asks for a zone export *or* every record screenshotted. Neither is currently
possible, so — like Gate A — it cannot close honestly on the evidence available.
Whether route 3 is sufficient to proceed is your call, not mine.

---

## A. BLOCKER — the registrant email is a vendor address

**SOP p.11, Step 1** says: *"Also update the registrant contact email if it points
at a Spick address… If it is a Spick address, **stop and escalate to Khush**."*

It is. Live WHOIS on `riseandshinetravel.com`:

```
Registrant Email: rise@bookdomain.info
```

`bookdomain.info` is the vendor's own reseller-panel domain (the SOP identifies it
on p.7 as *"a PDR reseller panel, run by Spick"*), and it runs its own mail server
(`MX 10 mail.bookdomain.info`). So `rise@bookdomain.info` is a live mailbox on
infrastructure belonging to the vendor whose contract just terminated.

Everything important routes to that address:

| What goes there | Why it matters |
|---|---|
| Transfer-approval emails | Anyone with that mailbox can approve moving the domain away |
| "Forgot password" resets for the panel | The SOP's own fallback path (p.11) runs through it |
| Registry expiry / renewal notices | Both domains expire **3 December 2026** |

This also means the Step 1 fallback is unavailable: if the panel has no
change-password option, "Forgot password" sends the reset to the vendor, not to us.

### Confirmed from inside the panel (2026-08-10)

I located the edit screen: **Settings → profile**, Customer ID `19542065`. The
form's Contact Information → Email field holds `rise@bookdomain.info`, and this
record is demonstrably the one published to WHOIS — every field matches, including
a typo:

| Panel field | Published WHOIS |
|---|---|
| Rise and Shine Travel | `Registrant Name: Rise and Shine Travel` |
| N/A | `Registrant Organization: N/A` |
| Ahmedabad | `Registrant Street: Ahmedabad` |
| Ahmdedabad | `Registrant City: Ahmdedabad` ← same misspelling |
| 000000 | `Registrant Postal Code: 000000` |
| 91-00000000 | `Registrant Phone: +91.00000000` |

**The field is editable, but the change cannot be completed by us.** It is marked
*Sensitive Field*, and the panel states: *"Saving edits requires a verification
code which will be sent to your original email address"* — i.e. to
`rise@bookdomain.info`, the vendor's mailbox. Without Spick reading us that code,
Save cannot succeed. I did **not** click Save.

### It also blocks 2FA

The panel will not enable two-factor authentication until the account email is
**verified**, and verification sends its code to the same unreachable mailbox. So
the dependency knocks out two separate Gate A items, not one:

```
  rise@bookdomain.info is the vendor's mailbox
        │
        ├──▶ cannot change registrant email   (needs verification code)
        └──▶ cannot verify account email  ──▶  cannot enable 2FA
```

The practical consequence, stated plainly: **the panel that controls both domains
is protected by a single password, the previous value of which was circulated in a
plain-text email, and its recovery path delivers to the outgoing vendor.** Changing
the password fixes access. It does not fix recovery, and we cannot add a second
factor until the email moves.

Before treating that as final, one thing left to check: whether the panel offers an
**authenticator-app (TOTP)** option that bypasses email verification. SMS 2FA is not
a candidate — the phone number on file is `+91.00000000`.

Two further points found at the same time:

- **Admin and Tech contacts carry the same address.** All contact roles resolve to
  `rise@bookdomain.info`; there is no alternate role we can use as a way in.
- **The contact data is inaccurate.** Postal code `000000`, phone `+91.00000000`,
  and a misspelled city. ICANN requires accurate registrant data and a WHOIS
  inaccuracy complaint can lead to suspension. Since this record has to be edited
  anyway, correcting the address and phone in the same pass avoids triggering the
  verification/lock cycle twice.

**I need from you:** confirmation of whether we can read `rise@bookdomain.info`,
and which Rise & Shine address should replace it. Changing the registrant contact
on a PDR reseller domain may need PDR contacted directly, as the SOP anticipates.

Still to check (costs a minute, tells us whether it is one edit or two): whether
**Manage Orders → riseandshinetravel.com → Contact Details** holds a separate
per-domain contact, or reads from this same customer profile.

I have **not** started Phase A pending your answer, since Gate A cannot close
without it.

> One caveat on sequencing: changing the registrant email can itself trigger a
> 60-day transfer lock at some registrars. That does not affect this cutover
> (we are not transferring), but it is worth knowing before the separate
> registrar-transfer task later.

---

## B. Six live DNS records the SOP says don't exist

Appendix A (p.37) lists `mail / smtp / imap` under *"Not found by external scan"*
and states: *"None resolve today."* **Six of them do resolve today.** I confirmed
these are real individual records, not a wildcard — three random non-existent
subdomains returned nothing, so there is no `*` record masking the result.

| Record | Type | Value | TTL |
|---|---|---|---|
| `mail` | A | `192.185.129.235` | 14400 |
| `ftp` | CNAME | `riseandshinetravel.com` | 14400 |
| `cpanel` | CNAME | `riseandshinetravel.com` | 14391 |
| `webmail` | CNAME | `riseandshinetravel.com` | 14396 |
| `webdisk` | A | `192.185.129.235` | 14400 |
| `whm` | A | `192.185.129.235` | 14396 |

These are the standard cPanel service hostnames, all pointing at the old shared
host. They are almost certainly vestigial — real mail runs on M365 via the MX
record, not through `mail.riseandshinetravel.com`. But two carry actual risk:

- **`webmail`** — if any staff member still reads mail through the old cPanel
  webmail rather than Outlook, dropping this cuts them off.
- **`ftp`** — if anyone still uploads to the old host, that stops working.

They cost nothing to carry across and I will do so by default unless you say
otherwise, since Rule 3 favours copying everything. Flagging it because
Appendix A would have led me to skip them.

**For SOP v1.1:** Appendix A should say these were not probed rather than that
they do not exist. Step 5's probe list on p.15 does include them, so the two pages
contradict each other — and Appendix A is the one that reads as an inventory.

### B2. There is a FIFTH email-critical record — a published DKIM key

This is the most consequential item in this document after Finding 0b.

Appendix A states: *"`selector1._domainkey` — Microsoft 365 DKIM signing. Not
currently published, so DKIM is probably not enabled."* That conclusion is wrong.
DKIM **is** published — under the selector `default`, not `selector1`/`selector2`:

```
default._domainkey.riseandshinetravel.com   TXT
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A… (411 chars, full value in dkim-full.txt)
```

Confirmed on both `1.1.1.1` and `8.8.8.8`. `selector1`, `selector2` and `_dmarc`
are genuinely absent — the SOP checked the right concept under the wrong name.
The `default` selector is what **cPanel** generates automatically, so this dates
from the old mail setup rather than M365.

**Why it matters:** DKIM is a cryptographic signature proving a message really came
from this domain. The SOP's p.5 box lists *four* email-critical records. There are
**five**. Drop this one and any mail still signed with that key fails
authentication — landing in spam or being rejected outright.

**⚠️ It cannot be retyped.** DNS splits TXT values over 255 characters into
separate chunks. This record is published as two, and they join with **no
separator**:

```
…UKQglhxF//TCST  +  ectUTjG+MGll1Czw…   →   …UKQglhxF//TCSTectUTjG+MGll1Czw…
```

Insert a space or newline at that join and DKIM breaks. Cloudflare's import should
handle it, but it must be verified character-for-character afterwards. Full value
captured in `dkim-full.txt`, both as published and correctly joined.

**Open question for you:** is this key still in use, or vestigial? SPF is
`-all` and includes only Outlook, so cPanel-originated mail already fails SPF —
which suggests the key is a leftover. I am carrying it across regardless, per
Rule 3, but it is worth someone confirming rather than assuming.

### B3. Two further cPanel records, plus one that must NOT be copied

- `cpcalendars` → `192.185.129.235` (A) — cPanel calendar service
- `cpcontacts` → `192.185.129.235` (A) — cPanel contacts service
- `_acme-challenge` → TXT `jX5FObMA6g7…` — **do not copy.** This is Let's Encrypt's
  DNS-01 validation token for the old host's wildcard certificate. It belongs to
  Spick's renewal automation, is transient, and carrying it to Cloudflare would be
  meaningless.

**Related deadline.** The old host's certificate is a Let's Encrypt wildcard
(`*.riseandshinetravel.com`) issued **10 July 2026**, expiring **8 October 2026** —
and its issue date matches the live zone's SOA serial (`2026071001`) exactly, so
Spick's automation was still running as of that date. If the cutover has not
happened by 8 October and Spick's renewal has stopped, the old site starts showing
certificate warnings to visitors. Another reason not to let this drift.

---

## C. Eight live pages will start returning 404 at cutover

This is the one I would most want a decision on, because it is a **code fix and
not a DNS change**, and it needs to land before the cutover rather than after.

Step 18 (p.25) checks the legacy `.html` tour redirects. I tested all 11 against
the Vercel deployment — **all 11 pass**, returning 308 to a page that loads 200.
That part is fine and needs no work.

But the tour pages are not the whole old site. I crawled the live 2021 site and
found 21 distinct `.html` URLs. The 11 tour pages redirect correctly. The other
**8 are live today and have no redirect**, so the moment the domain points at
Vercel they become 404s:

| Old URL (live, 200 today) | 404 after cutover | Obvious target on the new site |
|---|---|---|
| `/index.html` | yes | `/` |
| `/about.html` | yes | `/about` |
| `/contact.html` | yes | `/contact` |
| `/services.html` | yes | `/services` |
| `/domestic.html` | yes | `/packages/domestic` |
| `/international-packages.html` | yes | `/packages/international` |
| `/cruise.html` | yes | `/packages/cruise` |
| `/inquiry.html` | yes | `/plan-my-trip` *(judgment call — could be `/contact` or `/request-a-call`)* |

Every one already has a clean 1:1 destination on the new site, so this is a small,
low-risk addition to `LEGACY_TOUR_REDIRECTS` in `next.config.ts`.

Two footnotes: `/offers.html` is linked from the old navigation but already 404s
on the old site, so it needs nothing. And the old site links to
`/inquiry.html.html` (a typo in their markup) — worth redirecting too, since any
backlink to it is real traffic.

Why Step 18 would have missed this: it says *"ask Khush for two or three old tour
URLs to test."* Tour URLs all pass. The breakage is entirely in the navigation
pages, which Step 18 never looks at.

**Suggested:** I add the 8–9 redirects and get them merged before Phase D. It is a
few lines in the existing array. Say the word and I will raise the PR — or if you
would rather keep this cutover strictly zero-code as scoped, we ship it as a
follow-up and accept a short 404 window.

---

## D. Smaller confirmations

- **DNSSEC is unsigned on both domains.** Worth stating explicitly because it is
  the quiet killer in nameserver moves: if DNSSEC were signed and we switched NS
  without removing the DS record, the domain would go completely dark — not
  degraded, *unresolvable*. It is not signed, so the switch is safe.
- **Record TTLs are 14400 (4 hours), NS TTL 86400 (24 hours).** So Step 10's TTL
  reduction is worth doing: without it, a rollback means waiting up to 4 hours,
  not 5 minutes.
- **The `.in` diagnosis is exactly right.** The `.in` registry does delegate to
  `ns11/ns12.linux4hosting.com`, but those servers return `REFUSED` for `.in`
  while returning authoritative answers for `.com`. The zone was never created
  there. Confirmed zero-risk as a dry run.
- **No CAA record** — nothing will block Let's Encrypt issuance for Vercel.
- **`src/data/site.ts` and the built site both confirm the www-primary rule.**
  Canonical tag, `robots.txt` `Host:` line and every `sitemap.xml` entry already
  emit `https://www.riseandshinetravel.com`. Setting the apex as primary instead
  would put every canonical tag at odds with the served URL, exactly as p.8 warns.
- **The SOA serial is `2026071001`** with contact `info@spicktech.com` — the zone
  was last edited around 10 July 2026 and Spick still administers it.

---

## What I have already done (no changes to anything live)

- Re-verified the full facts sheet against live DNS/WHOIS — all accurate.
- Captured a complete external zone scan of both domains, with record types and
  TTLs resolved against `1.1.1.1` to bypass local cache.
- Built the Phase B record inventory as a spreadsheet, with the four
  email-critical records marked and the six undocumented ones flagged.
- Turned Appendix B into a runnable script (`verify-cutover.sh`) that aborts loudly
  if the MX ever comes back empty, and saved run 1 as the pre-cutover baseline.
- Pre-tested all 11 legacy tour redirects (all pass) and crawled the old site to
  find the 8 that don't.

All of it is in `domain-cutover-backup-2026-08/`. I will upload the folder to the
shared drive as Gate B requires — the external scan does not replace the panel
export, which I will do as Step 4 once Phase A is unblocked.

---

## What I need from you

1. **Decision on A** — the registrant email. This gates everything.
2. **Decision on C** — do I add the 8 redirects before cutover, or after?
3. **Confirmation on B** — drop the legacy cPanel records or carry them over?
   My default is carry them over.
4. **A test mailbox** on `@riseandshinetravel.com` (SOP p.9, item 4) — I need it
   to prove mail still works at Gate D-2.
5. **Vercel team access** to `riseand-shine-final-website` (p.9, item 2), if my
   current access is not already sufficient to edit domains.

Once 1 and 4 are settled I can run Phases A through C in a single sitting.
Phase D wants a Tuesday or Wednesday morning with you reachable.
