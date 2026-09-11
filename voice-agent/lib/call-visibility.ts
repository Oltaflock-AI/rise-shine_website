// Which ElevenLabs conversations the dashboard shows. Pure; tested.
//
// On 2026-09-11 the test-traffic clean-up kept five conversations in
// `voice_calls` and dropped thirty. The same twenty ElevenLabs conversations
// could not be deleted there (the dashboard's key is read-only: every DELETE
// answered 403), so the feed would have kept showing them. Rather than hide a
// hard-coded id list, the rule is: a conversation from BEFORE the clean-up
// is shown only if our CRM still has its row; anything placed AFTER it is
// always shown, so a call whose webhook is late can never vanish.
//
// Once the ElevenLabs side is deleted (platform_docs/elevenlabs-conversations-
// to-delete.md) this filter becomes a no-op and can go.

/** 2026-09-11 12:30 UTC — the moment voice_calls was pruned. */
export const CLEANUP_UNIX = 1789129800;

export function isVisibleCall(
  call: { conversation_id: string; started_at_unix: number | null },
  knownIds: ReadonlySet<string>,
  cleanupUnix = CLEANUP_UNIX,
): boolean {
  if (knownIds.has(call.conversation_id)) return true;
  // Unknown start time: treat as new rather than lose it.
  if (call.started_at_unix == null) return true;
  return call.started_at_unix >= cleanupUnix;
}
