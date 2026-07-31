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

- **Agent**: `Rise & Shine Travel` (`agent_6901kth2msjxf0wtnxwwgpp9an03`)
- **Persona**: *Priya*, a Hindi-speaking travel consultant (Ahmedabad office)
- **Goal**: qualify the lead (destination, travelers, month, special requests)
  and lock a 1–4 PM callback.
- **Collected fields** (configured on the agent, surfaced as chips): `destination`,
  `num_travelers`, `travel_month`, `special_requests`, `whatsapp_number`,
  `callback_time`, `lead_qualified`.

## Environment

`.env.local` (already populated for the demo):

```env
ELEVENLABS_API_KEY=sk_…                 # ElevenLabs API key (also reads ELEVEN_API from .env)
ELEVENLABS_AGENT_ID=agent_6901kth2…     # Rise & Shine Travel agent
ELEVENLABS_PHONE_NUMBER_ID=phnum_9601…  # VoBiz SIP trunk number for the outbound leg
```

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.
