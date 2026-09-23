import {describe, it, expect, vi, afterEach} from "vitest";
import {normaliseSarvamCall, sarvamAppId, sarvamConnectivity, voxlineSarvamPayload} from "@/lib/sarvam-call";
describe("Sarvam reporting", () => {
  it("maps a completed outbound without guessing ages or holiday dates", () => {
    const row = normaliseSarvamCall({attempt_id:"attempt-1",interaction_id:"interaction-1",app_id:"rise",connectivity_status:"connected",duration:45,
      final_agent_variables:{caller_name:"Test",destination:"Goa",dates:"after Diwali",party_size:"4 travellers",notes:"vegetarian",budget:"flexible",occasion:"anniversary",outcome:"inquiry_captured"},
      interaction_transcript:[{role:"agent",en_text:"Hello"},{role:"user",en_text:"Goa"}]});
    expect(row).toMatchObject({conversation_id:"attempt-1",qualified:true,num_travelers:"4 travellers",travel_month:"after Diwali"});
    expect(row?.transcript).toHaveLength(2);
  });
  it("accepts the inbound shape without connectivity status", () => {
    expect(normaliseSarvamCall({interaction_id:"inbound-1",call_length_seconds:20,destination:"Goa",outcome:"quote_requested"})?.qualified).toBe(true);
  });
  it("does not qualify a failed dial or require an interaction", () => {
    expect(normaliseSarvamCall({attempt_id:"failed-1",connectivity_status:"no_answer"})?.status).toBe("initiation_failed");
    expect(normaliseSarvamCall({})).toBeNull();
  });
});
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
describe("Sarvam outbound", () => {
  it("uses the selected provider and preserves attempt identity", async () => {
    for (const [k,v] of Object.entries({VOICE_PROVIDER:"sarvam",SARVAM_VOICE_API_KEY:"test",SARVAM_ORG_ID:"org",SARVAM_WORKSPACE_ID:"ws",SARVAM_APP_ID:"rise",SARVAM_APP_VERSION:"3",SARVAM_CONNECTION_ID:"conn",SARVAM_PHONE_NUMBER:"+917965853398",SARVAM_CALLBACK_WEBHOOK_URL:"https://example.test/hook"})) vi.stubEnv(k,v);
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({attempt_id:"attempt-1"})});vi.stubGlobal("fetch",fetcher);
    const {placeOutboundCall}=await import("@/lib/voice-outbound");
    expect(await placeOutboundCall({toNumber:"9589594181",calleeName:"Test"})).toEqual({conversationId:"attempt-1",sipCallId:null});
    const body=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.user_config.user_phone_number).toBe("+919589594181");
    expect(body.app_config.app_version).toBe(3);
    expect(body.webhook_config.metadata).toEqual({app_id:"rise",direction:"outbound",phone:"+919589594181",callee_name:"Test"});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("uses Sarvam interaction identity for Voxline recording retries", () => {
  expect(voxlineSarvamPayload({attempt_id:"dial-1",interaction_id:"date/call-1"})).toEqual({interaction_id:"date/call-1",metadata:{sarvam_attempt_id:"dial-1"}});
  expect(voxlineSarvamPayload({attempt_id:"failed-1"})).toEqual({attempt_id:"failed-1"});
});

/**
 * The shape Sarvam actually sends for an instant outbound call (every website
 * callback): `status`, `channel_info`, echoed `webhook_config` — no app_id and
 * no user number. The first route required app_id and 401'd all of them.
 */
describe("Sarvam instant-outbound webhook", () => {
  const connected = {
    attempt_id: "36cbf6ec-bbb8-4d31-b683-a81ebb2ec344", status: "connected",
    channel_info: {channel_type: "v2v", channel_provider: "vobiz", agent_phone_number: "+917971442847"},
    duration: 104.68, interaction_id: "20260919/abd47177-10:24:44-8b6ab2fe", failure_reason: null,
    final_agent_variables: {callee_name: "Nilesh", destination: "Char Dham", dates: "October", party_size: "6 travellers", outcome: "inquiry_captured"},
    webhook_config: {url: "https://example.test/hook", metadata: {app_id: "rise", direction: "outbound", phone: "+919512692508", callee_name: "Nilesh"}},
    interaction_transcript: [{role: "agent", en_text: "Hello"}, {role: "user", en_text: "Char Dham"}],
  };

  it("reads status, agent number and lead from the instant shape", () => {
    const row = normaliseSarvamCall(connected)!;
    expect(row).toMatchObject({
      conversation_id: connected.attempt_id, status: "done", qualified: true, agent_id: "rise",
      lead_phone: "+919512692508", lead_name: "Nilesh", from_number: "+917971442847", destination: "Char Dham",
    });
    expect(row.metadata.direction).toBe("outbound");
    expect(row.started_at).not.toBeNull();
  });

  it("exposes no app id when the dial predates the metadata, so the route cannot 401 it", () => {
    const bare = {...connected, webhook_config: {url: "x", metadata: null}};
    expect(sarvamAppId(bare)).toBeNull();
    expect(normaliseSarvamCall(bare)?.lead_phone).toBeNull(); // the route fills it from callback_queue
  });

  it("maps an unanswered instant call so the retry fires", () => {
    const p = {attempt_id: "a", status: "no_answer", duration: null, interaction_id: null, final_agent_variables: null};
    expect(sarvamConnectivity(p)).toBe("no_answer");
    expect(normaliseSarvamCall(p)?.status).toBe("initiation_failed");
  });

  it("marks a deployment call on the public number as inbound", () => {
    const row = normaliseSarvamCall({app_id: "rise", attempt_id: "in-1", connectivity_status: "connected",
      user_phone_number: "+919999999999", agent_phone_number: "+917971442847", duration: 30})!;
    expect(row.metadata.direction).toBe("inbound");
    expect(row.lead_phone).toBe("+919999999999");
  });
});
