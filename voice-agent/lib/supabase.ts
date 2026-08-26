// Supabase clients for the dashboard. SERVER ONLY — never import from a
// client component (service key + cookie access).
//
// Two clients with two jobs:
//   authClient()    — anon key + session cookies. Answers "who is signed in".
//   serviceClient() — service-role key. Reads/writes CRM data (voice_calls,
//                     callback_queue, dashboard_access), all RLS-locked tables.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — add it to voice-agent/.env.local`);
  return v;
}

export async function authClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Route handlers may refresh the session; server components cannot
          // write cookies and Next throws — swallow, the read still worked.
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {}
        },
      },
    },
  );
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
