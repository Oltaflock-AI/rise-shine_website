"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CallRecord } from "./types";

// Shared live-data layer for the whole dashboard. One poller feeds every tab so
// navigating between Overview / Voice Calls / Leads doesn't re-fetch
// or flash empty. Reads from /api/conversations (ElevenLabs is the source).

const POLL_MS = 8000;

// Module-scope cache so a tab switch / remount seeds instantly from the last
// successful payload while the background refetch refreshes it.
let cache: CallRecord[] = [];

interface CallsCtx {
  calls: CallRecord[];
  loading: boolean;
  error: string | null;
  lastSync: Date;
  refetch: () => Promise<void>;
}

const Ctx = createContext<CallsCtx>({
  calls: [],
  loading: true,
  error: null,
  lastSync: new Date(0),
  refetch: async () => {},
});

export function CallsProvider({ children }: { children: React.ReactNode }) {
  const [calls, setCalls] = useState<CallRecord[]>(() => cache);
  const [loading, setLoading] = useState(cache.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Call data is unavailable.");
      if (Array.isArray(j.calls)) {
        cache = j.calls;
        setCalls(j.calls);
      }
      setError(null);
    } catch (caught) {
      /* keep last good data */
      setError(caught instanceof Error ? caught.message : "Call data is unavailable.");
    }
    setLastSync(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return <Ctx.Provider value={{ calls, loading, error, lastSync, refetch }}>{children}</Ctx.Provider>;
}

export const useCalls = () => useContext(Ctx);

export function useCall(id: string): CallRecord | null {
  const { calls } = useCalls();
  return calls.find((c) => c.conversation_id === id) ?? null;
}
