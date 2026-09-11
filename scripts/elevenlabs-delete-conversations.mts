// Delete every ElevenLabs conversation for our agent EXCEPT an allow-list.
// Needs an ADMIN-scoped key: the dashboard's read key answers 403.
//
//   ELEVENLABS_ADMIN_KEY=… npx tsx scripts/elevenlabs-delete-conversations.mts --dry
//   ELEVENLABS_ADMIN_KEY=… npx tsx scripts/elevenlabs-delete-conversations.mts
//
// Keep-list: platform_docs/elevenlabs-conversations-to-delete.md.
import { readFileSync } from "node:fs";

const key = process.env.ELEVENLABS_ADMIN_KEY;
const agent = process.env.ELEVENLABS_AGENT_ID;
if (!key || !agent) throw new Error("ELEVENLABS_ADMIN_KEY and ELEVENLABS_AGENT_ID are required");
const dry = process.argv.includes("--dry");

const doc = readFileSync(new URL("../platform_docs/elevenlabs-conversations-to-delete.md", import.meta.url), "utf8");
const keep = new Set(doc.split("## DELETE")[0].match(/conv_[a-z0-9]+/g) ?? []);
if (keep.size === 0) throw new Error("keep-list is empty — refusing to run");

const H = { "xi-api-key": key };
let cursor: string | undefined;
const ids: string[] = [];
do {
  const u = new URL("https://api.elevenlabs.io/v1/convai/conversations");
  u.searchParams.set("agent_id", agent);
  u.searchParams.set("page_size", "100");
  if (cursor) u.searchParams.set("cursor", cursor);
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`list failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { conversations: { conversation_id: string }[]; next_cursor?: string; has_more?: boolean };
  ids.push(...j.conversations.map((c) => c.conversation_id));
  cursor = j.has_more ? j.next_cursor : undefined;
} while (cursor);

const del = ids.filter((id) => !keep.has(id));
console.log(`${ids.length} conversations · keeping ${ids.length - del.length} · deleting ${del.length}${dry ? " (dry run)" : ""}`);
let ok = 0;
for (const id of del) {
  if (dry) continue;
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, { method: "DELETE", headers: H });
  if (r.ok) ok++;
  else console.error("failed", id, r.status, (await r.text()).slice(0, 120));
}
if (!dry) console.log(`deleted ${ok}/${del.length}`);
