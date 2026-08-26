"use client";

/**
 * Auth provider — backed by Supabase Auth (email + password).
 *
 * The public API (`useAuth()` → user / ready / login / signup / logout) is
 * intentionally stable, so every consumer (Header, AuthScreen, AccountView)
 * keeps working untouched. What changed under it is the engine: real
 * server-verified sessions in httpOnly cookies (via @supabase/ssr), with data
 * protected by Row Level Security — not the browser.
 *
 * Signup collects name, mobile number and email:
 * `signup(name, email, phone, password)`, in the order the form asks. The phone
 * is normalised to E.164 before it is stored, and lands both in
 * `user_metadata.phone` and — via the `on_auth_user_created` trigger — in
 * `profiles.phone` (migration 0009). `user.phone` is "" for accounts created
 * before the field existed; treat it as optional when reading.
 *
 * The site still runs before Supabase is configured: with no env keys,
 * `ready` becomes true with a null user and auth calls throw a friendly notice.
 *
 * Supabase dashboard note: for instant login-after-signup (the current UX),
 * turn OFF "Confirm email" under Auth → Providers → Email. Leave it ON and
 * signup will instead prompt the user to confirm via the emailed link.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { isDiallableIndianNumber, normalisePhone } from "@/lib/phone";

export type User = { name: string; email: string; phone: string };

type AuthContextValue = {
  user: User | null;
  /** false until we've resolved the session on the client (avoids UI flash). */
  ready: boolean;
  signup: (
    name: string,
    email: string,
    phone: string,
    password: string,
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED =
  "Accounts aren't available just yet. Please reach us on WhatsApp or by phone and we'll help right away.";

/** Derive a display name from Supabase user metadata, falling back to the email. */
function toUser(u: SupabaseUser | null): User | null {
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (u.email ? u.email.split("@")[0] : "Traveller");
  // `phone` is our own metadata key, not Supabase's native `u.phone` — that one
  // belongs to SMS-OTP auth, which we do not use. Accounts created before the
  // field was collected have no phone, hence the empty-string fallback.
  const phone =
    (typeof meta.phone === "string" && meta.phone) || u.phone || "";
  return { name, email: u.email ?? "", phone };
}

/** Turn Supabase's terse auth errors into copy that fits the brand voice. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email or password doesn't match. Please try again.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try logging in.";
  if (m.includes("password should be at least"))
    return "Password must be at least 6 characters.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Please enter a valid email address.";
  if (m.includes("phone")) return "Please enter a valid mobile number.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    const supabase = createClient();
    // getUser() re-validates the JWT with Supabase (getSession would not).
    supabase.auth.getUser().then(({ data }) => {
      setUser(toUser(data.user));
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user ?? null));
    });
    return () => subscription.unsubscribe();
  }, []);

  const signup = useCallback(
    async (name: string, email: string, phone: string, password: string) => {
      const n = name.trim();
      if (!n) throw new Error("Please enter your name.");
      // Store E.164, not what was typed. The number is the join key between an
      // account and a callback/voice-call record (callback_queue.phone,
      // voice_calls.lead_phone), and "98765 43210" would never match "+919876543210".
      const p = normalisePhone(phone);
      if (!isDiallableIndianNumber(p))
        throw new Error("Please enter a valid mobile number, e.g. 98765 43210.");
      if (!supabaseConfigured) throw new Error(NOT_CONFIGURED);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: n, phone: p },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      if (error) throw new Error(friendly(error.message));
      if (!data.session) {
        // "Confirm email" is ON — no session until the link is clicked.
        throw new Error(
          "Almost there — we've emailed you a confirmation link. Confirm it, then log in.",
        );
      }
      setUser(toUser(data.user));

      // Welcome email, best-effort and deliberately not awaited-for-success: the
      // account exists either way, and a mail failure must not read as a failed
      // signup. The route takes no body and mails the session's own address.
      fetch("/api/account/welcome", { method: "POST" }).catch(() => {});
    },
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) throw new Error(NOT_CONFIGURED);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(friendly(error.message));
    setUser(toUser(data.user));
  }, []);

  const logout = useCallback(() => {
    setUser(null); // optimistic — the onAuthStateChange listener confirms it
    if (supabaseConfigured) createClient().auth.signOut().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, ready, signup, login, logout }),
    [user, ready, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
