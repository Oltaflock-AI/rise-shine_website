import "server-only";

import { checkBotId } from "botid/server";
import { screenFormFields, type BotVerdict } from "@/lib/bot-guard";

/**
 * Vercel BotID verdict for the current request. Only meaningful on a path
 * listed in `instrumentation-client.ts` (`initBotId({ protect })`) — the client
 * attaches the classification headers per path, and an unlisted path is
 * classified as a bot. Local dev always answers `isBot: false`.
 *
 * Fails OPEN: a BotID outage must not close the enquiry forms, which are the
 * agency's lead pipeline. The honeypot and timing checks still run.
 */
export async function botIdSaysBot(): Promise<boolean> {
  try {
    const v = await checkBotId();
    return v.isBot;
  } catch (e) {
    console.error("[bot-guard] BotID check threw — allowing:", e);
    return false;
  }
}

/**
 * Full screen for a server-action form: hidden fields first (free), BotID
 * second. Logs the tripped reason with the source so the run is visible in
 * Vercel logs — the crawler that prompted this went unnoticed for a day
 * because nothing wrote a line.
 */
export async function screenSubmission(formData: FormData, source: string): Promise<BotVerdict> {
  let verdict = screenFormFields(formData);
  if (!verdict.bot && (await botIdSaysBot())) verdict = { bot: true, reason: "botid" };
  if (verdict.bot) console.warn(`[bot-guard] dropped ${source} submission: ${verdict.reason}`);
  return verdict;
}
