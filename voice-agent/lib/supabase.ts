// Supabase client for the dashboard. SERVER ONLY — never import from a client
// component (service key).
//
// One client, one job: the service-role key reads and writes the RLS-locked
// tables — dashboard_users / dashboard_sessions / dashboard_login_events (the
// dashboard's own sign-in, see dashboard-auth.ts), voice_calls and
// callback_queue. The dashboard does NOT use Supabase Auth: that is the main
// site's customer pool, and no customer credential may open this app.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — add it to voice-agent/.env.local`);
  return v;
}

let service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(
      env("NEXT_PUBLIC_SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return service;
}
