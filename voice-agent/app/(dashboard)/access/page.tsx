"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IconCheck, IconChevron, IconInfo, IconTrash, IconUsers } from "@/components/icons";
import { initial } from "@/lib/format";
import {
  ROLES,
  ROLE_INFO,
  can,
  type AccessMember,
  type Role,
} from "@/lib/access";
import { fmtWhen } from "@/lib/format";

interface LoginEvent {
  id: number;
  email: string;
  ok: boolean;
  reason:
    | "ok"
    | "unknown_user"
    | "wrong_password"
    | "locked"
    | "inactive"
    // Password-reset steps share this log so the account's whole story is in
    // one place; they are recorded with ok = true.
    | "reset_requested"
    | "reset_done";
  ip: string | null;
  at: string;
}

interface Snapshot {
  members: AccessMember[];
  viewer: { email: string; role: Role; simulated: boolean } | null;
  authEnabled: boolean;
  persistent: boolean;
  events: LoginEvent[] | null;
}

const REASON_LABEL: Record<LoginEvent["reason"], string> = {
  ok: "Signed in",
  unknown_user: "Unknown email",
  wrong_password: "Wrong password",
  locked: "Locked out",
  inactive: "Deactivated",
  reset_requested: "Reset link sent",
  reset_done: "Password reset",
};

function fmtAdded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AccessPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  // Inline "reset password" row: which member is open, and the draft password.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  // The attempt log is an audit trail, not a daily read — it starts folded.
  const [showEvents, setShowEvents] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/access", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the team list.");
      setSnap(j);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the team list.");
    }
  }, []);

  useEffect(() => {
    // Scheduled rather than called inline — see the same note in lib/useCalls.tsx.
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // Every mutation replaces the list with the server's copy instead of patching
  // local state, so a rejected change (last admin, duplicate email) can never
  // leave the screen showing something the server didn't agree to.
  const mutate = useCallback(async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch(url, { ...init, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "That change did not go through.");
      setSnap((prev) =>
        prev ? { ...prev, members: j.members, persistent: j.persistent } : prev,
      );
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change did not go through.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const headers = { "Content-Type": "application/json" };

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const added = await mutate("/api/access", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, role, password }),
    });
    if (added) {
      setNotice(`${email.trim().toLowerCase()} can now sign in with the password you set.`);
      setEmail("");
      setRole("viewer");
      setPassword("");
    }
  }

  const onChangeRole = (member: AccessMember, nextRole: Role) =>
    mutate("/api/access", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ email: member.email, role: nextRole }),
    });

  async function onResetPassword(e: React.FormEvent, member: AccessMember) {
    e.preventDefault();
    const ok = await mutate("/api/access", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ email: member.email, password: resetPw }),
    });
    if (ok) {
      setNotice(`Password reset for ${member.email}. Their other sessions were signed out.`);
      setResetFor(null);
      setResetPw("");
    }
  }

  const onRemove = (member: AccessMember) => {
    if (!window.confirm(`Remove access for ${member.email}? They will be signed out immediately.`)) return;
    void mutate(`/api/access?email=${encodeURIComponent(member.email)}`, { method: "DELETE" });
  };

  async function onChangeOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers,
        body: JSON.stringify({ current, next }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not change your password.");
      setCurrent("");
      setNext("");
      setError(null);
      setNotice("Your password was changed. Other devices were signed out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  const members = snap?.members ?? [];
  const refused = snap?.events?.filter((ev) => !ev.ok).length ?? 0;
  const latest = snap?.events?.[0] ?? null;
  const canManage = can(snap?.viewer?.role ?? null, "manage_access");
  const signedIn = !!snap?.viewer && !snap.viewer.simulated;

  return (
    <>
      <PageHeader title="Team Access" subtitle="Who can open this dashboard and what each person is allowed to do" />

      {snap && !snap.authEnabled && (
        <div className="notice">
          <IconInfo className="notice-icon" />
          <div>
            <strong>Sign-in is off on this copy.</strong> Local development only:
            anyone who can open this page is treated as an admin. On the hosted
            dashboard every visitor signs in with the credentials on this list.
          </div>
        </div>
      )}

      {error && <div className="notice warn"><IconInfo className="notice-icon" /><div>{error}</div></div>}
      {notice && <div className="notice"><IconInfo className="notice-icon" /><div>{notice}</div></div>}

      {canManage && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Add a team member</div>
            <IconUsers className="panel-head-icon" />
          </div>
          <div className="panel-body">
            <form className="access-form access-form-add" onSubmit={onAdd}>
              <label className="field">
                <span className="label">Email</span>
                <input
                  className="input"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="label">Initial password</span>
                <input
                  className="input"
                  type="password"
                  placeholder="10+ characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span className="label">Role</span>
                <select
                  className="select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-inline" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add member"}
              </button>
            </form>
            <p className="access-hint">
              <b>{ROLE_INFO[role].label}:</b> {ROLE_INFO[role].blurb} Share the
              password with them directly; they can change it once signed in.
            </p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Team<span className="panel-count num">{members.length}</span></div>
        </div>
        <div className="panel-body flush">
          {!snap ? (
            <div className="panel-empty">Loading…</div>
          ) : members.length === 0 ? (
            <div className="panel-empty">
              Nobody has been added yet. Set <code>DASHBOARD_ADMIN_EMAILS</code> and
              <code>DASHBOARD_ADMIN_PASSWORD</code> to seed the first admin, or add an
              account above.
            </div>
          ) : (
            <div className="member-table">
              <div className="member-row member-head">
                <span>Member</span>
                <span>Role</span>
                <span>Added</span>
                <span className="member-actions-head">{canManage ? "Actions" : ""}</span>
              </div>
              {members.map((m) => {
                const isYou = !!snap?.viewer && !snap.viewer.simulated && snap.viewer.email === m.email;
                const open = resetFor === m.email;
                return (
                  <div className={`member-row${open ? " open" : ""}`} key={m.email}>
                    <span className="trip-lead">
                      <span className="avatar sm">{initial(m.email, null)}</span>
                      <span className="trip-lead-text">
                        <span className="member-email">
                          {m.email}
                          {isYou && <span className="badge q you">you</span>}
                        </span>
                      </span>
                    </span>
                    <span>
                      {canManage ? (
                        <select
                          className="select sm"
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void onChangeRole(m, e.target.value as Role)}
                          aria-label={`Role for ${m.email}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge q">{ROLE_INFO[m.role].label}</span>
                      )}
                    </span>
                    <span className="member-added">
                      {fmtAdded(m.addedAt)}
                      {m.addedBy && <em className="member-by">by {m.addedBy}</em>}
                    </span>
                    {canManage ? (
                      <span className="member-actions">
                        <button
                          className={`btn-quiet${open ? " active" : ""}`}
                          type="button"
                          onClick={() => {
                            setResetFor(open ? null : m.email);
                            setResetPw("");
                          }}
                          disabled={busy}
                        >
                          {open ? "Cancel" : "Reset password"}
                        </button>
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => onRemove(m)}
                          disabled={busy || isYou}
                          aria-label={`Remove ${m.email}`}
                          title={isYou ? "You cannot remove yourself" : "Remove access"}
                        >
                          <IconTrash className="i" />
                        </button>
                      </span>
                    ) : (
                      <span />
                    )}
                    {open && (
                      <form className="member-reset" onSubmit={(e) => void onResetPassword(e, m)}>
                        <input
                          className="input"
                          type="password"
                          placeholder={`New password for ${m.email} (10+ characters)`}
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                          minLength={10}
                          required
                          autoComplete="new-password"
                          autoFocus
                          aria-label={`New password for ${m.email}`}
                        />
                        <button className="btn btn-inline" type="submit" disabled={busy}>
                          <IconCheck className="btn-icon" /> {busy ? "Saving…" : "Save password"}
                        </button>
                        <span className="member-reset-hint">Their other sessions are signed out when this saves.</span>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {signedIn && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Your password</div>
          </div>
          <div className="panel-body">
            <form className="access-form access-form-pw" onSubmit={onChangeOwnPassword}>
              <label className="field">
                <span className="label">Current password</span>
                <input
                  className="input"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className="field">
                <span className="label">New password</span>
                <input
                  className="input"
                  type="password"
                  placeholder="10+ characters"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button className="btn btn-inline" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
            <p className="access-hint">Signed in as <b>{snap?.viewer?.email}</b>. Changing it signs out your other devices.</p>
          </div>
        </div>
      )}

      {snap?.events && (
        <div className={`panel panel-fold${showEvents ? " open" : ""}`}>
          <button
            type="button"
            className="panel-head panel-fold-head"
            onClick={() => setShowEvents((v) => !v)}
            aria-expanded={showEvents}
            aria-controls="signin-log"
          >
            <div>
              <div className="panel-title">
                Sign-in history
                <span className="panel-count num">{snap.events.length}</span>
                {refused > 0 && <span className="badge fail">{refused} refused</span>}
              </div>
              <div className="panel-sub">
                {latest
                  ? `Last attempt ${fmtWhen(Date.parse(latest.at) / 1000)} · ${latest.email} · ${REASON_LABEL[latest.reason].toLowerCase()}`
                  : "Every attempt is recorded, refused ones included."}
              </div>
            </div>
            <span className="panel-fold-toggle">
              {showEvents ? "Hide" : "Show"}
              <IconChevron className="panel-fold-chevron" />
            </span>
          </button>
          {showEvents && (
            <div className="panel-body flush" id="signin-log">
              {snap.events.length === 0 ? (
                <div className="panel-empty">No sign-in attempts yet.</div>
              ) : (
                <div className="member-table">
                  <div className="event-row member-head">
                    <span>Email</span>
                    <span>Result</span>
                    <span>When</span>
                    <span>IP address</span>
                  </div>
                  {snap.events.map((ev) => (
                    <div className="event-row" key={ev.id}>
                      <span className="member-email">{ev.email}</span>
                      <span>
                        <span className={`badge ${ev.ok ? "q" : "fail"}`}>{REASON_LABEL[ev.reason]}</span>
                      </span>
                      <span className="member-added" title={ev.at}>{fmtWhen(Date.parse(ev.at) / 1000)}</span>
                      <span className="dim num">{ev.ip ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Roles explained</div>
        </div>
        <div className="panel-body">
          <div className="role-legend">
            {ROLES.map((r) => (
              <div className="role-def" key={r}>
                <span className="role-name">{ROLE_INFO[r].label}</span>
                <span className="role-blurb">{ROLE_INFO[r].blurb}</span>
              </div>
            ))}
          </div>
          <p className="access-hint">
            Five wrong passwords lock an account for 15 minutes. Accounts here are
            separate from customer accounts on the website — a customer login never
            opens this dashboard.
          </p>
        </div>
      </div>
    </>
  );
}
