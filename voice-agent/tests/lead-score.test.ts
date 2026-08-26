import { describe, expect, it } from "vitest";
import { leadScore } from "@/lib/lead-score";
import type { CallRecord } from "@/lib/types";

function call(over: Partial<CallRecord> = {}, fields: Partial<CallRecord["fields"]> = {}): CallRecord {
  return {
    conversation_id: "conv_x",
    name: "Asha",
    phone: "+919000000000",
    status: "done",
    call_successful: "success",
    title: null,
    summary: null,
    duration_secs: 180,
    started_at_unix: 1_700_000_000,
    language: "hi",
    qualified: null,
    fields: {
      destination: null,
      num_travelers: null,
      travel_month: null,
      special_requests: null,
      whatsapp_number: null,
      callback_time: null,
      ...fields,
    },
    transcript: [],
    ...over,
  };
}

describe("leadScore", () => {
  it("a fully captured, qualified call is hot", () => {
    const s = leadScore(
      call({ qualified: true }, {
        destination: "Bali",
        travel_month: "December",
        num_travelers: "4",
        whatsapp_number: "+919000000000",
        callback_time: "2 PM",
      }),
    );
    expect(s.score).toBe(100);
    expect(s.tier).toBe("hot");
    expect(s.label).toBe("Hot · 100");
  });

  it("a decent unqualified call with details lands warm", () => {
    const s = leadScore(call({}, { destination: "Dubai", travel_month: "October" }));
    // 10 + 10 + 10 (duration ≥120s) = 30 → cold; add callback → 45 warm
    expect(s.tier).toBe("cold");
    const s2 = leadScore(call({}, { destination: "Dubai", travel_month: "October", callback_time: "3 PM" }));
    expect(s2.score).toBe(45);
    expect(s2.tier).toBe("warm");
  });

  it("a call that never connected is always cold zero", () => {
    const s = leadScore(
      call({ status: "failed", duration_secs: 0, qualified: true }, { destination: "Goa" }),
    );
    expect(s.score).toBe(0);
    expect(s.tier).toBe("cold");
  });

  it("short calls earn the smaller duration credit", () => {
    expect(leadScore(call({ duration_secs: 60, qualified: true })).score).toBe(45);
    expect(leadScore(call({ duration_secs: 180, qualified: true })).score).toBe(50);
  });
});
