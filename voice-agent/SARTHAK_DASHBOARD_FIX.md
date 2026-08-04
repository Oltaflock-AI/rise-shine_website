# Task: stop other agents' calls leaking into the Sarthak dashboard

> Paste this whole file to the agent working in the **`Oltaflock-AI/sarthak-singapore`** repo.

## Problem
The Sarthak Singapore dashboard is showing calls that don't belong to it — travel
enquiries from the **Rise & Shine Travel** voice agent (Maldives, Dubai, Rajasthan)
appearing as "Singapore Miracle" real-estate leads.

## Why it happens
The ElevenLabs **post-call webhook is configured at the workspace level**, so **every**
agent in the workspace (Sarthak, Rise & Shine, and any future agent) hits the same
`elevenlabs-webhook` edge function and gets written to Supabase.

- Webhooks route by **workspace, not API key** — creating new API keys does nothing.
- ElevenLabs has **no per-agent off switch** for the transcription post-call webhook
  (confirmed in their docs and via a live API test — a `null` agent override means
  "inherit the workspace webhook").

So the fix is to **filter at the receiver**: only store calls from the Sarthak agent.

## The fix (one file)

In `supabase/functions/elevenlabs-webhook/index.ts`, find this line (~line 188):

```ts
  const call_id = pick<string>(data, ["conversation_id"]);
  if (!call_id) return json({ ok: true, verified: true }); // probe / unknown shape
```

Immediately **after** it, add:

```ts
  // Only store calls from THIS dashboard's agent. Other agents in the same
  // ElevenLabs workspace share this workspace-level post-call webhook, but their
  // calls must not pollute the Sarthak dashboard. ElevenLabs has no per-agent
  // webhook off switch (a null agent override = inherit workspace), so filter here.
  const SARTHAK_AGENT_ID =
    Deno.env.get("ELEVENLABS_AGENT_ID") ?? "agent_7701kt6yb510f5hrpm1tsmjx61w4";
  const incomingAgentId = pick<string>(data, ["agent_id"]);
  if (incomingAgentId && incomingAgentId !== SARTHAK_AGENT_ID) {
    return json({ ok: true, ignored: "other agent", agent_id: incomingAgentId });
  }
```

Commit this to **`main`**.

## Deploy (required — the code does nothing until the edge function is redeployed)

```bash
supabase functions deploy elevenlabs-webhook --no-verify-jwt --project-ref yhwoqmhnvzpfgacfaidg
```

## Delete the rows that already leaked (Supabase → SQL Editor)

```sql
-- Remove the Rise & Shine Travel calls that leaked in
delete from calls where analysis->>'agent_id' = 'agent_6901kth2msjxf0wtnxwwgpp9an03';
```

If any travel test numbers got mirrored into `leads`, optionally remove them by phone
(verify they aren't real Sarthak leads first), e.g.:

```sql
delete from leads where phone = '+918976615546';
```

## Result
Only the Sarthak agent (`agent_7701kt6yb510f5hrpm1tsmjx61w4`) is stored. Every other
agent's call is acknowledged (`200 ignored`) and dropped — including any future agents
you add to the workspace.

---

## Reference IDs
- Sarthak agent: `agent_7701kt6yb510f5hrpm1tsmjx61w4`
- Rise & Shine Travel agent (to exclude): `agent_6901kth2msjxf0wtnxwwgpp9an03`
- Supabase project ref: `yhwoqmhnvzpfgacfaidg`
