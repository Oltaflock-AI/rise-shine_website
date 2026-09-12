import {describe, it, expect, vi, afterEach} from "vitest";
import {normaliseSarvamCall, voxlineSarvamPayload} from "@/lib/sarvam-call";
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
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("uses Sarvam interaction identity for Voxline recording retries", () => {
  expect(voxlineSarvamPayload({attempt_id:"dial-1",interaction_id:"date/call-1"})).toEqual({interaction_id:"date/call-1",metadata:{sarvam_attempt_id:"dial-1"}});
  expect(voxlineSarvamPayload({attempt_id:"failed-1"})).toEqual({attempt_id:"failed-1"});
});
