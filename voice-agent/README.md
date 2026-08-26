# Rise & Shine Travel — AI Voice Sales Dashboard

A private operations dashboard for **Rise & Shine Travel**. It reads conversations
from the ElevenLabs voice agent (*Priya*) and surfaces call summaries, qualified
travel intent, collected trip details, and callback windows for the sales team.

Built by [Oltaflock](https://oltaflock.ai).

## Stack

- **Frontend / API**: Next.js (App Router), plain CSS design system (no Tailwind)
- **Voice**: ElevenLabs Conversational AI + VoBiz SIP trunk
- **Data source**: ElevenLabs Conversation API — *no database or webhook required*

## How it works

```
ElevenLabs voice agent handles a call
        │
        ▼
Call ends → ElevenLabs runs post-call analysis
        │
        │  GET /api/conversations  (polled every 6s)
        ▼
Dashboard: summary + collected detail chips + transcript
```

Unlike the reference (which used Supabase + a post-call webhook), this demo reads
calls straight back from the ElevenLabs Conversation API, so it runs locally with
nothing but the API key. To persist a CRM / leads table later, add a Supabase
post-call webhook the same way `sarthak-singapore` does.

## The agent

- **Agent**: `Rise & Shine Travel` — id comes from `ELEVENLABS_AGENT_ID`, which is
  required (no default). The id changes whenever the agent is recreated, so read the
  current one from ElevenLabs → Conversational AI → Agents rather than from a doc.
  As of 2026-08-04 it is `agent_7001kxp06rsbeaw974gvww4w2c5r`.
- **Persona**: *Priya*, a Hindi-speaking travel consultant (Ahmedabad office)
- **Goal**: qualify the lead (destination, travelers, month, special requests)
  and lock a 1–4 PM callback.
- **Collected fields** (configured on the agent, surfaced as chips): `destination`,
  `num_travelers`, `travel_month`, `special_requests`, `whatsapp_number`,
  `callback_time`, `lead_qualified`.

## Team access (`/access`)

An admin-managed list of who may open the dashboard, and at what level:

| Role | Can do |
|---|---|
| **Viewer** | Read calls, transcripts and leads. |
| **Editor** | Everything a viewer can, plus lead actions once those ship. |
| **Admin** | Everything an editor can, plus adding, re-roling and removing people. |

**Sign-in is Supabase Auth**, the same project the main site uses. `/login`
posts email + password to `/api/auth/login`; `emailFromSession()` in
`lib/session.ts` reads the session cookie and verifies it with
`supabase.auth.getUser()`. With `DASHBOARD_AUTH_ENABLED=true` (production) a
visitor with no session is redirected to `/login`, and every API route returns
401/403 through `requireCapability()`. Unset (local dev) the old behaviour
remains: anyone who opens the page is treated as an admin and a banner says so.

Having a Supabase account is not enough — the access list is the authorisation.
A customer who signs up on the main site and tries the dashboard gets
"This account does not have dashboard access" and is signed straight back out.

The list lives in the `dashboard_access` table (main repo migration
`0013_dashboard_access.sql`), read and written with the service-role key through
the four functions in `lib/access-store.ts` (unit-tested against a memory store
in `tests/`). Seed the first admin with `DASHBOARD_ADMIN_EMAILS`, otherwise
nobody can grant access to anybody. The store refuses to remove or demote the
last admin.

## Data sources

| Page | Source |
|---|---|
| Overview · Voice Calls · call detail | ElevenLabs Conversation API, live (transcript, summary, collected fields) |
| Callback Queue (`/queue`) | `callback_queue` table — `/request-a-call` requests waiting for or through the dialler |
| Trips & Leads → CRM Records | `voice_calls` table (post-call webhook), joined to the queue on phone |

## Hosting

Deployed as its own Vercel project at **admin.riseandshinetravel.in** (Cloudflare
CNAME `admin` → `cname.vercel-dns.com`, DNS-only). Still excluded from the main
site's deploy by the root `.vercelignore`.

## Environment

`.env.local` (already populated for the demo):

```env
ELEVENLABS_API_KEY=sk_…                 # ElevenLabs API key (ELEVEN_LABS_API_KEY / ELEVEN_API also read)
ELEVENLABS_AGENT_ID=agent_7001kxp…      # Rise & Shine Travel agent — read the current id from ElevenLabs
ELEVENLABS_PHONE_NUMBER_ID=phnum_2301…  # Rise-Shine SIP trunk number
NEXT_PUBLIC_SUPABASE_URL=…              # same three values as the main site
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
DASHBOARD_ADMIN_EMAILS=you@example.com  # comma-separated bootstrap admins for /access
# DASHBOARD_AUTH_ENABLED=true           # set in production; unset locally = simulated admin
```

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.
