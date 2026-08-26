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

**Sign-in is the dashboard's own** (`lib/dashboard-auth.ts`) — deliberately NOT
Supabase Auth, whose user pool is the main site's customer base. Accounts live
in `dashboard_users` (main repo migration `0014_dashboard_users.sql`) with a
scrypt password hash and role; sessions are server-side rows in
`dashboard_sessions` (12 h, revocable); every attempt lands in
`dashboard_login_events` and the admin sees the log on Team Access. Blocking:
unknown email and wrong password answer identically, five wrong passwords lock
the account for 15 minutes, and a removed user's sessions die with the row.
With `DASHBOARD_AUTH_ENABLED=true` (production) everything is gated; unset
(local dev) anyone who opens the page is treated as an admin and a banner says
so.

Admins create accounts on Team Access (email + role + initial password), can
reset any password (which signs that user out everywhere), and everyone can
change their own. Seed the first admin with `DASHBOARD_ADMIN_EMAILS` +
`DASHBOARD_ADMIN_PASSWORD`, otherwise nobody can sign in to grant anything.
The store refuses to remove or demote the last admin.

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
NEXT_PUBLIC_SUPABASE_URL=…              # same values as the main site (tables live there)
SUPABASE_SERVICE_ROLE_KEY=…
DASHBOARD_ADMIN_EMAILS=you@example.com  # comma-separated bootstrap admins
DASHBOARD_ADMIN_PASSWORD=…              # bootstrap password for the seed admin(s)
# DASHBOARD_AUTH_ENABLED=true           # set in production; unset locally = simulated admin
```

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.
