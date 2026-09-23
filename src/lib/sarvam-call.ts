export type SarvamCall = Record<string, unknown>;
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/**
 * Sarvam posts three different shapes to the same route, and they disagree on
 * where almost everything lives:
 *
 *   instant outbound (our dials) — `status`, `channel_info.agent_phone_number`,
 *     `webhook_config.metadata`; NO app_id, NO user phone number
 *   campaign / inbound deployment — `connectivity_status`, top-level `app_id`,
 *     `user_phone_number`, `agent_phone_number`, `metadata`
 *
 * The first version read only the second shape, so every real outbound webhook
 * failed the app_id check and was answered 401 — no call reached voice_calls
 * from 15-Sep-2026 until this was fixed. Read both.
 */
export function sarvamMetadata(p: SarvamCall): Record<string, unknown> {
  return {...obj(obj(p.webhook_config).metadata), ...obj(p.metadata)};
}

/** The agent this payload belongs to, or null when the shape does not say (instant outbound). */
export function sarvamAppId(p: SarvamCall): string | null {
  return text(p.app_id) ?? text(sarvamMetadata(p).app_id);
}

/** connected · no_answer · busy · failed — whichever field this shape uses. */
export function sarvamConnectivity(p: SarvamCall): string | null {
  return text(p.connectivity_status) ?? text(p.status);
}

export function normaliseSarvamCall(p: SarvamCall) {
  const id = text(p.attempt_id) ?? text(p.interaction_id);
  if (!id) return null;
  const meta = sarvamMetadata(p);
  const vars = p.final_agent_variables && typeof p.final_agent_variables === "object"
    ? p.final_agent_variables as Record<string, unknown> : p;
  const initial = p.initial_agent_variables && typeof p.initial_agent_variables === "object"
    ? p.initial_agent_variables as Record<string, unknown> : {};
  const outcome = text(vars.outcome);
  const connectivity = sarvamConnectivity(p);
  const connected = connectivity === "connected" ||
    (!connectivity && (p.call_length_seconds != null || p.call_start_time != null || Boolean(p.interaction_id)));
  const rawTurns = p.interaction_transcript ?? p.call_transcript;
  const transcript = Array.isArray(rawTurns) ? rawTurns.flatMap((t) =>
    t && typeof t === "object" && typeof t.en_text === "string"
      ? [{role: t.role === "agent" ? "agent" : "user", message: t.en_text}] : []) : [];
  const seconds = Number(p.duration ?? p.call_length_seconds ?? 0);
  const date = text(p.start_datetime) ?? text(p.executed_at) ?? text(p.call_start_time);
  // Instant outbound carries no timestamp at all; it is sent as the call ends.
  const millis = date ? Date.parse(date) : connected ? Date.now() - (Number.isFinite(seconds) ? seconds : 0) * 1000 : NaN;
  const number = text(p.user_phone_number) ?? text(meta.phone) ??
    (p.user_identifier_type === "phone_number" ? text(p.user_identifier) : null);
  // Only our own dials (instant outbound, `status`) and campaigns go out; the
  // deployment on the public number is the one thing that answers.
  const direction = text(meta.direction) ??
    (text(p.status) || text(p.campaign_id) ? "outbound" : "inbound");
  return {
    conversation_id: id, agent_id: sarvamAppId(p), agent_name: "Rise and Shine - Priya",
    status: connected ? "done" : "initiation_failed",
    call_successful: ["inquiry_captured", "quote_requested"].includes(outcome ?? "") ? "success" : "failure",
    lead_name: text(vars.caller_name) ?? text(initial.callee_name) ?? text(vars.callee_name) ?? text(meta.callee_name),
    lead_phone: number, to_number: number,
    from_number: text(p.agent_phone_number) ?? text(obj(p.channel_info).agent_phone_number),
    started_at: Number.isFinite(millis) ? new Date(millis).toISOString() : null,
    // voice_calls.duration_secs is INTEGER and Sarvam sends 104.68 — unrounded,
    // Postgres refused every connected call.
    duration_secs: Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0,
    language: text(p.conversation_language), summary: text(vars.call_summary),
    qualified: ["inquiry_captured", "quote_requested"].includes(outcome ?? ""),
    destination: text(vars.destination), num_travelers: text(vars.party_size),
    travel_month: text(vars.dates), special_requests: text(vars.notes),
    transcript, analysis: {outcome, budget: vars.budget, occasion: vars.occasion},
    data_collection: vars, metadata: {provider: "sarvam", direction, interaction_id: p.interaction_id, connectivity_status: connectivity},
    dynamic_variables: initial, failure_reason: text(p.failure_reason),
  };
}

/** Voxline's recording retrier uses its stored call ID as Sarvam's interaction ID. */
export function voxlineSarvamPayload(p: SarvamCall) {
  if (typeof p.interaction_id !== "string" || !p.interaction_id) return p;
  const {attempt_id, ...rest} = p;
  return {...rest, metadata: {...(typeof p.metadata === "object" && p.metadata ? p.metadata : {}), sarvam_attempt_id: attempt_id}};
}
