export type SarvamCall = Record<string, unknown>;
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
export function normaliseSarvamCall(p: SarvamCall) {
  const id = text(p.attempt_id) ?? text(p.interaction_id);
  if (!id) return null;
  const vars = p.final_agent_variables && typeof p.final_agent_variables === "object"
    ? p.final_agent_variables as Record<string, unknown> : p;
  const initial = p.initial_agent_variables && typeof p.initial_agent_variables === "object"
    ? p.initial_agent_variables as Record<string, unknown> : {};
  const outcome = text(vars.outcome);
  const connected = p.connectivity_status === "connected" ||
    (!p.connectivity_status && (p.call_length_seconds != null || p.call_start_time != null || Boolean(p.interaction_id)));
  const rawTurns = p.interaction_transcript ?? p.call_transcript;
  const transcript = Array.isArray(rawTurns) ? rawTurns.flatMap((t) =>
    t && typeof t === "object" && typeof t.en_text === "string"
      ? [{role: t.role === "agent" ? "agent" : "user", message: t.en_text}] : []) : [];
  const date = text(p.executed_at) ?? text(p.call_start_time);
  const millis = date ? Date.parse(date) : NaN;
  const seconds = Number(p.duration ?? p.call_length_seconds ?? 0);
  const number = text(p.user_phone_number) ?? (p.user_identifier_type === "phone_number" ? text(p.user_identifier) : null);
  return {
    conversation_id: id, agent_id: text(p.app_id), agent_name: "Rise and Shine - Priya",
    status: connected ? "done" : "initiation_failed",
    call_successful: ["inquiry_captured", "quote_requested"].includes(outcome ?? "") ? "success" : "failure",
    lead_name: text(vars.caller_name) ?? text(initial.callee_name),
    lead_phone: number, to_number: number, from_number: text(p.agent_phone_number),
    started_at: Number.isFinite(millis) ? new Date(millis).toISOString() : null,
    duration_secs: Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
    language: text(p.conversation_language), summary: text(vars.call_summary),
    qualified: ["inquiry_captured", "quote_requested"].includes(outcome ?? ""),
    destination: text(vars.destination), num_travelers: text(vars.party_size),
    travel_month: text(vars.dates), special_requests: text(vars.notes),
    transcript, analysis: {outcome, budget: vars.budget, occasion: vars.occasion},
    data_collection: vars, metadata: {provider: "sarvam", interaction_id: p.interaction_id, connectivity_status: p.connectivity_status},
    dynamic_variables: initial, failure_reason: text(p.failure_reason),
  };
}

/** Voxline's recording retrier uses its stored call ID as Sarvam's interaction ID. */
export function voxlineSarvamPayload(p: SarvamCall) {
  if (typeof p.interaction_id !== "string" || !p.interaction_id) return p;
  const {attempt_id, ...rest} = p;
  return {...rest, metadata: {...(typeof p.metadata === "object" && p.metadata ? p.metadata : {}), sarvam_attempt_id: attempt_id}};
}
