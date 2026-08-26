// Lead scoring — pure and client-safe (no Node APIs, no secrets).
//
// The score is a 0–100 reading of how much of a booking this call already is,
// built only from things Priya actually captured. Weights, out loud:
//
//   +40  ElevenLabs' own lead_qualified analysis said yes
//   +15  a callback window was locked (they agreed to be sold to)
//   +10  destination captured        +10  travel month captured
//   +10  a WhatsApp number captured   +5  party size captured
//   +10  a real conversation (≥120s of talk; ≥45s earns +5)
//
// A call that never connected can only ever be cold. Tiers: ≥70 Hot,
// ≥40 Warm, else Cold. Change weights here and nowhere else — the badge on
// every page and the Overview "Hot Leads" KPI all call this one function.

import type { CallRecord } from "./types";

export type LeadTier = "hot" | "warm" | "cold";

export interface LeadScore {
  score: number;
  tier: LeadTier;
  label: string; // "Hot · 82"
}

export function leadScore(c: CallRecord): LeadScore {
  let score = 0;
  if (c.qualified === true) score += 40;
  if (c.fields.callback_time) score += 15;
  if (c.fields.destination) score += 10;
  if (c.fields.travel_month) score += 10;
  if (c.fields.whatsapp_number) score += 10;
  if (c.fields.num_travelers) score += 5;
  const secs = c.duration_secs ?? 0;
  if (secs >= 120) score += 10;
  else if (secs >= 45) score += 5;

  // Never connected → nothing above can be trusted; the lead is cold by definition.
  if (secs <= 0 || c.status === "failed") score = 0;

  score = Math.min(100, score);
  const tier: LeadTier = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  const label = `${tier === "hot" ? "Hot" : tier === "warm" ? "Warm" : "Cold"} · ${score}`;
  return { score, tier, label };
}
