/**
 * Flight portal verification (Jul 2026) wanted the sign-in flow disabled;
 * HOTEL portal verification (Aug 2026) requires the opposite — TBO does an
 * end-to-end run with a demo login, and the account view is where booking
 * management (hotel cancellation) lives. Auth is therefore ON by default.
 *
 * Set NEXT_PUBLIC_AUTH_DISABLED=true to hide the login gate, header auth UI
 * and /login + /signup. It is an environment variable, not a constant, on
 * purpose: on 10-Sep-2026 this file was flipped to `true` by something outside
 * the session doing the work — a stray editor buffer or a sibling agent, never
 * identified — and was swept into a commit and deployed. The login gate was
 * off in production for about six minutes. A flag that lives in Vercel's
 * environment can only change by a deliberate, audited action, and nothing
 * sitting on a laptop can write to it.
 *
 * NEXT_PUBLIC_ because it is read by client components as well as server
 * pages; it is inlined at build time, so a change needs a redeploy.
 */
export const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
