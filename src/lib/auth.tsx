"use client";

/**
 * Branded DEMO auth — client-side only (localStorage).
 *
 * This is a front-end demonstration of the login/signup + booking-gate flow so
 * the client can see how it looks. It is NOT secure and stores users in the
 * browser. When TBO production + payments go live, swap this provider's guts
 * for real server-side auth (the component API — useAuth() — stays the same).
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

export type User = { name: string; email: string };
type StoredUser = User & { hash: string };

const USERS_KEY = "rs_users";
const SESSION_KEY = "rs_session";

async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeUsers(u: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}

type AuthContextValue = {
  user: User | null;
  /** false until we've read localStorage on the client (avoids UI flash). */
  ready: boolean;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const normEmail = (e: string) => e.trim().toLowerCase();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const email = localStorage.getItem(SESSION_KEY);
      if (email) {
        const found = readUsers().find((u) => u.email === email);
        if (found) setUser({ name: found.name, email: found.email });
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const e = normEmail(email);
      const n = name.trim();
      if (!n) throw new Error("Please enter your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        throw new Error("Please enter a valid email address.");
      if (password.length < 6)
        throw new Error("Password must be at least 6 characters.");
      const users = readUsers();
      if (users.some((u) => u.email === e))
        throw new Error("An account with this email already exists. Try logging in.");
      const hash = await hashPassword(password);
      users.push({ name: n, email: e, hash });
      writeUsers(users);
      localStorage.setItem(SESSION_KEY, e);
      setUser({ name: n, email: e });
    },
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const e = normEmail(email);
    const found = readUsers().find((u) => u.email === e);
    if (!found) throw new Error("No account found for this email. Please sign up.");
    const hash = await hashPassword(password);
    if (hash !== found.hash) throw new Error("Incorrect password. Please try again.");
    localStorage.setItem(SESSION_KEY, e);
    setUser({ name: found.name, email: found.email });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
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
