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

**Sign-in is not built yet** — management deferred the production
authentication/database design on 2026-07-31. So the permission model is real and
enforced server-side, but the *identity* lookup is stubbed: with
`DASHBOARD_AUTH_ENABLED` unset, anyone who can open the page is treated as an
admin, and the page says so in a banner. Building the list now means access works
the day sign-in is switched on.

To switch it on, implement `emailFromSession()` in `lib/session.ts` (read the
session cookie / Supabase user and return a **verified** email) and set
`DASHBOARD_AUTH_ENABLED=true`. Nothing else changes — the routes already return
401/403 through `requireCapability()`, which you can confirm today by setting that
variable and watching every request get refused.

The list lives in `.data/access.json` (git-ignored), not a database, because this
app is excluded from the Vercel deploy and runs locally. Swap the four functions in
`lib/access-store.ts` for queries when a database arrives. On a read-only
filesystem writes fall back to memory and the page warns that changes won't survive
a restart. Seed the first admin with `DASHBOARD_ADMIN_EMAILS`, otherwise nobody can
grant access to anybody. The store refuses to remove or demote the last admin.

## Environment

`.env.local` (already populated for the demo):

```env
ELEVENLABS_API_KEY=sk_…                 # ElevenLabs API key (also reads ELEVEN_API from .env)
ELEVENLABS_AGENT_ID=agent_6901kth2…     # Rise & Shine Travel agent
ELEVENLABS_PHONE_NUMBER_ID=phnum_9601…  # VoBiz SIP trunk number for the outbound leg
DASHBOARD_ADMIN_EMAILS=you@oltaflock.ai # comma-separated bootstrap admins for /access
# DASHBOARD_AUTH_ENABLED=true           # only once emailFromSession() is implemented
```

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.
