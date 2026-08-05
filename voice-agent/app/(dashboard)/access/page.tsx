"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IconInfo, IconTrash, IconUsers } from "@/components/icons";
import {
  ROLES,
  ROLE_INFO,
  can,
  type AccessMember,
  type Role,
} from "@/lib/access";

interface Snapshot {
  members: AccessMember[];
  viewer: { email: string; role: Role; simulated: boolean } | null;
  authEnabled: boolean;
  persistent: boolean;
}

function fmtAdded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AccessPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");

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
      body: JSON.stringify({ email, role }),
    });
    if (added) {
      setEmail("");
      setRole("viewer");
    }
  }

  const onChangeRole = (member: AccessMember, next: Role) =>
    mutate("/api/access", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ email: member.email, role: next }),
    });

  const onRemove = (member: AccessMember) => {
    if (!window.confirm(`Remove access for ${member.email}?`)) return;
    void mutate(`/api/access?email=${encodeURIComponent(member.email)}`, { method: "DELETE" });
  };

  const members = snap?.members ?? [];
  const canManage = can(snap?.viewer?.role ?? null, "manage_access");

  return (
    <>
      <PageHeader title="Team Access" subtitle="Who can open this dashboard, and what they can do" />

      {snap && !snap.authEnabled && (
        <div className="notice">
          <IconInfo className="notice-icon" />
          <div>
            <strong>Sign-in is not live yet.</strong> This list is being kept ready — it
            is saved and enforced by the server, but until the login screen ships
            anyone who can open this page is treated as an admin. Adding people now
            means access works the day sign-in is switched on.
          </div>
        </div>
      )}

      {snap && !snap.persistent && (
        <div className="notice warn">
          <IconInfo className="notice-icon" />
          <div>
            <strong>Changes are not being saved to disk.</strong> This copy is running
            somewhere with a read-only filesystem, so the list will reset when the
            server restarts.
          </div>
        </div>
      )}

      {error && <div className="notice warn"><IconInfo className="notice-icon" /><div>{error}</div></div>}

      {canManage && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Give someone access</div>
            <IconUsers className="panel-head-icon" />
          </div>
          <div className="panel-body">
            <form className="access-form" onSubmit={onAdd}>
              <input
                className="input"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email address"
              />
              <select
                className="select"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                aria-label="Role"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                ))}
              </select>
              <button className="btn btn-inline" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add"}
              </button>
            </form>
            <p className="access-hint">{ROLE_INFO[role].blurb}</p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Team · {members.length}</div>
        </div>
        <div className="panel-body flush">
          {!snap ? (
            <div className="panel-empty">Loading…</div>
          ) : members.length === 0 ? (
            <div className="panel-empty">
              Nobody has been added yet. Set <code>DASHBOARD_ADMIN_EMAILS</code> in
              <code>.env.local</code> to seed the first admin, or add an email above.
            </div>
          ) : (
            <div className="member-table">
              <div className="member-row member-head">
                <span>Email</span>
                <span>Role</span>
                <span>Added</span>
                <span />
              </div>
              {members.map((m) => (
                <div className="member-row" key={m.email}>
                  <span className="member-email">{m.email}</span>
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
                  <span className="member-added">
                    {fmtAdded(m.addedAt)}
                    {m.addedBy && <em className="member-by"> by {m.addedBy}</em>}
                  </span>
                  {canManage ? (
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => onRemove(m)}
                      disabled={busy}
                      aria-label={`Remove ${m.email}`}
                      title="Remove access"
                    >
                      <IconTrash className="i" />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">What each role can do</div>
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
            The dashboard is read-only today, so viewers and editors currently see the
            same thing. Editor exists so that lead actions land on a permission that is
            already being checked.
          </p>
        </div>
      </div>
    </>
  );
}
