// Shared types — safe to import from both server (lib/elevenlabs.ts) and client
// components. Keep this file free of any Node/secret code so client bundles stay clean.

export interface TranscriptTurn {
  role: string;
  text: string;
  secs: number | null;
}

// The fields Priya asks for on every call. These drive the trip chips and call
// detail view.
export interface TripFields {
  destination: string | null;
  num_travelers: string | null;
  travel_month: string | null;
  special_requests: string | null;
  whatsapp_number: string | null;
  callback_time: string | null;
}

export interface CallRecord {
  conversation_id: string;
  name: string | null;
  phone: string | null;
  status: string; // raw ElevenLabs status (done / processing / failed …)
  call_successful: string | null; // success | failure | unknown
  title: string | null; // short headline ElevenLabs generates
  summary: string | null; // narrative "message" about the call
  duration_secs: number | null;
  started_at_unix: number | null;
  language: string | null;
  qualified: boolean | null;
  fields: TripFields; // structured collected fields (may be all null)
  transcript: TranscriptTurn[];
}
