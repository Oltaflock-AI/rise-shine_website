/**
 * Flight portal verification (Jul 2026) wanted the sign-in flow disabled;
 * HOTEL portal verification (Aug 2026) requires the opposite — TBO does an
 * end-to-end run with a demo login, and the account view is where booking
 * management (hotel cancellation) lives. Auth is therefore back ON.
 * Flip to true to hide the login gate, header auth UI and /login + /signup.
 */
export const AUTH_DISABLED = false;
