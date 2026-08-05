// Server-side ElevenLabs Conversational AI client for the Rise & Shine Travel
// demo. ElevenLabs is the single source of truth — we place outbound calls over
// the VoBiz SIP trunk and read every call's transcript, summary and collected
// fields straight back from the conversation API. No database or webhook needed.
//
// NEVER import this from a client component (it uses the secret API key).

import type { CallRecord, TranscriptTurn, TripFields } from "./types";

const API_BASE = "https://api.elevenlabs.io/v1/convai";

/**
 * Config IDs — deliberately with NO hardcoded fallback.
 *
 * These used to default to a literal agent/phone id. When the agent was recreated
 * the defaults silently pointed at something that no longer existed, and this
 * dashboard showed an empty call list for weeks while looking perfectly healthy.
 * A wrong answer delivered confidently is worse than an error, so missing config
 * now throws. Read lazily (not at module scope) so a build without credentials
 * still succeeds — the failure belongs at call time, not at compile time.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — add it to voice-agent/.env.local`);
  return v;
}

export function agentId(): string {
  return required("ELEVENLABS_AGENT_ID");
}

export function phoneNumberId(): string {
  return required("ELEVENLABS_PHONE_NUMBER_ID");
}

function apiKey(): string {
  // ELEVENLABS_API_KEY is preferred; ELEVEN_API (the original .env name) works too.
  const k = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API;
  if (!k) throw new Error("ELEVENLABS_API_KEY / ELEVEN_API is not set");
  return k;
}

// Normalise an Indian number to E.164. 10 digits → +91; already-prefixed kept.
export function normalisePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  return "+" + digits;
}

// ── Place an outbound call ──────────────────────────────────────────────────
export interface OutboundResult {
  success: boolean;
  message?: string;
  conversation_id: string | null;
  sip_call_id: string | null;
}

export async function placeOutboundCall(opts: {
  toNumber: string;
  calleeName: string;
}): Promise<OutboundResult> {
  const to = normalisePhone(opts.toNumber);
  // The agent's first message uses {{callee_name}} and the prompt uses
  // {{mobile_number}} — both must be supplied or the call fails instantly.
  const dynamic_variables: Record<string, string> = {
    callee_name: opts.calleeName?.trim() || "ग्राहक",
    mobile_number: to,
  };

  const body = {
    agent_id: agentId(),
    agent_phone_number_id: phoneNumberId(),
    to_number: to,
    conversation_initiation_client_data: { dynamic_variables },
  };

  const res = await fetch(`${API_BASE}/sip-trunk/outbound-call`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail?.message || json?.message || `outbound-call ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return {
    success: json?.success ?? true,
    message: json?.message,
    conversation_id: json?.conversation_id ?? null,
    sip_call_id: json?.sip_call_id ?? null,
  };
}

// ── Live call status (drives the Ringing → Connected → Ended indicator) ─────
export type CallPhase = "ringing" | "connected" | "ended" | "failed" | "unknown";

export interface LiveCallStatus {
  conversation_id: string;
  status: string;
  phase: CallPhase;
  accepted: boolean;
  duration_secs: number | null;
}

function phaseFor(status: string, accepted: boolean): CallPhase {
  switch (status) {
    case "initiated":
      return accepted ? "connected" : "ringing";
    case "in-progress":
      return "connected";
    case "processing":
    case "done":
      return "ended";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

export async function getLiveCallStatus(conversationId: string): Promise<LiveCallStatus> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`conversation ${res.status}`);
  const d = await res.json();
  const m = d?.metadata ?? {};
  const status: string = d?.status ?? "unknown";
  const accepted = m?.accepted_time_unix_secs != null || status === "in-progress";
  return {
    conversation_id: conversationId,
    status,
    phase: phaseFor(status, accepted),
    accepted,
    duration_secs: m?.call_duration_secs ?? null,
  };
}

// ── Read calls back for the dashboard ───────────────────────────────────────

/**
 * The shape of an ElevenLabs conversation, narrowed to the fields this dashboard
 * actually reads. Every field is optional on purpose: the API omits most of them
 * until post-call analysis finishes, so a call fetched mid-flight is a legitimate
 * near-empty object rather than an error. Extra fields we don't model are ignored.
 */
interface ApiPhoneCall {
  external_number?: string | null;
  to_number?: string | null;
}

interface ApiMetadata {
  call_duration_secs?: number | null;
  start_time_unix_secs?: number | null;
  main_language?: string | null;
  accepted_time_unix_secs?: number | null;
  phone_call?: ApiPhoneCall;
}

interface ApiAnalysis {
  call_successful?: string | null;
  call_summary_title?: string | null;
  transcript_summary?: string | null;
  data_collection_results?: Record<string, unknown>;
}

interface ApiTranscriptTurn {
  role?: string;
  message?: string;
  time_in_call_secs?: number | null;
}

interface ApiConversation {
  conversation_id?: string;
  agent_id?: string;
  status?: string;
  metadata?: ApiMetadata;
  analysis?: ApiAnalysis;
  transcript?: ApiTranscriptTurn[];
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, unknown>;
  };
}

// The list endpoint returns summaries, not full conversations.
interface ApiConversationSummary {
  conversation_id?: string;
  agent_id?: string;
}

function dcValue(dcr: Record<string, unknown>, key: string): string | null {
  const entry = dcr?.[key] as Record<string, unknown> | undefined;
  if (!entry) return null;
  const v = entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

// `fallbackId` is the id we asked for. The payload normally echoes it back, but
// the record is useless without one, so the caller's id stands in if it doesn't.
function mapConversation(d: ApiConversation, fallbackId: string): CallRecord {
  const m: ApiMetadata = d.metadata ?? {};
  const a: ApiAnalysis = d.analysis ?? {};
  const dcr: Record<string, unknown> = a.data_collection_results ?? {};
  const dyn: Record<string, unknown> =
    d.conversation_initiation_client_data?.dynamic_variables ?? {};
  const phoneCall: ApiPhoneCall = m.phone_call ?? {};

  const fields: TripFields = {
    destination: dcValue(dcr, "destination"),
    num_travelers: dcValue(dcr, "num_travelers"),
    travel_month: dcValue(dcr, "travel_month"),
    special_requests: dcValue(dcr, "special_requests"),
    whatsapp_number: dcValue(dcr, "whatsapp_number"),
    callback_time: dcValue(dcr, "callback_time"),
  };

  // Dynamic variables are caller-supplied and untyped, so read them defensively.
  const dynStr = (key: string): string =>
    typeof dyn[key] === "string" ? (dyn[key] as string).trim() : "";

  const name = dynStr("callee_name") || dcValue(dcr, "lead_name") || null;
  const phone =
    dynStr("mobile_number") ||
    phoneCall.external_number ||
    phoneCall.to_number ||
    fields.whatsapp_number ||
    null;

  const qualifiedRaw = dcr?.["lead_qualified"] as Record<string, unknown> | undefined;
  const qualified =
    qualifiedRaw && "value" in qualifiedRaw && typeof qualifiedRaw.value === "boolean"
      ? (qualifiedRaw.value as boolean)
      : null;

  const turns: ApiTranscriptTurn[] = Array.isArray(d.transcript) ? d.transcript : [];
  const transcript: TranscriptTurn[] = turns
    .map((t) => ({
      role: String(t?.role ?? "agent"),
      text: String(t?.message ?? ""),
      secs: t?.time_in_call_secs ?? null,
    }))
    .filter((t) => t.text.trim() !== "");

  return {
    conversation_id: d.conversation_id ?? fallbackId,
    name,
    phone,
    status: d.status ?? "unknown",
    call_successful: a.call_successful ?? null,
    title: a.call_summary_title ?? null,
    summary: a.transcript_summary ?? null,
    duration_secs: m.call_duration_secs ?? null,
    started_at_unix: m.start_time_unix_secs ?? null,
    language: m.main_language ?? null,
    qualified,
    fields,
    transcript,
  };
}

async function getConversationDetail(id: string): Promise<CallRecord | null> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    headers: { "xi-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const d: ApiConversation | null = await res.json().catch(() => null);
  if (!d) return null;
  return mapConversation(d, id);
}

// List recent conversations for our agent, then hydrate each with its full
// detail (summary + collected fields) in parallel. Plenty fast for a demo.
//
// ISOLATION: the API key has workspace-wide access — it can technically see every
// agent in the workspace (e.g. the Sarthak Singapore agent). We query by agent_id
// so ElevenLabs only returns THIS agent's calls, and we ALSO defensively drop any
// row whose agent_id isn't ours. Result: this dashboard can never show another
// agent's calls, regardless of which API key is used.
export async function listCalls(limit = 30): Promise<CallRecord[]> {
  const agent = agentId();
  const res = await fetch(
    `${API_BASE}/conversations?agent_id=${agent}&page_size=${limit}`,
    { headers: { "xi-api-key": apiKey() }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`conversations ${res.status}`);
  const data: { conversations?: ApiConversationSummary[] } = await res.json();
  const ids = (data.conversations ?? [])
    .filter((c) => c?.agent_id === agent)
    .map((c) => c?.conversation_id)
    .filter((id): id is string => typeof id === "string");
  const details = await Promise.all(
    ids.map((id) => getConversationDetail(id).catch(() => null)),
  );
  return details.filter((c): c is CallRecord => c !== null);
}
