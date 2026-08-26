"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCalls } from "@/lib/useCalls";
import { PageHeader } from "@/components/PageHeader";
import { initial, fmtWhen } from "@/lib/format";
import { leadScore } from "@/lib/lead-score";
import { IconPlane } from "@/components/icons";

// One voice_calls row from /api/crm — the post-call webhook's record, joined
// to the callback queue on phone so the lead's whole lifecycle is one line.
interface CrmCall {
  conversation_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  summary: string | null;
  qualified: boolean | null;
  destination: string | null;
  started_at: string | null;
  call_successful: string | null;
  queue_status: string | null;
}

export default function Leads() {
  const { calls, loading } = useCalls();
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [crm, setCrm] = useState<CrmCall[] | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/crm")
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setCrmError(json?.error ?? `CRM request failed (${res.status})`);
        else setCrm(json.calls ?? []);
      })
      .catch(() => alive && setCrmError("CRM request failed."));
    return () => {
      alive = false;
    };
  }, []);

  // Highest score first: the follow-up list should open on the best lead, not
  // merely the newest one. Recency breaks ties.
  const rows = useMemo(() => {
    return [...calls]
      .filter((c) => (qualifiedOnly ? c.qualified === true : true))
      .sort(
        (a, b) =>
          leadScore(b).score - leadScore(a).score ||
          (b.started_at_unix ?? 0) - (a.started_at_unix ?? 0),
      );
  }, [calls, qualifiedOnly]);

  const qualifiedCount = calls.filter((c) => c.qualified === true).length;

  return (
    <>
      <PageHeader title="Trips & Leads" subtitle="Qualified travel enquiries ready for your expert team" />

      <div className="kpis kpis-3">
        <div className="kpi">
          <div className="kpi-label">Qualified Leads</div>
          <div className="kpi-val num">{qualifiedCount}</div>
          <div className="kpi-sub">ready to follow up</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Callbacks Booked</div>
          <div className="kpi-val num">{calls.filter((c) => c.fields.callback_time).length}</div>
          <div className="kpi-sub">1–4 PM slots</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Enquiries</div>
          <div className="kpi-val num">{calls.length}</div>
          <div className="kpi-sub">all calls</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">{qualifiedOnly ? "Qualified Leads" : "All Leads"}</div>
          <label className="switch">
            <input type="checkbox" checked={qualifiedOnly} onChange={(e) => setQualifiedOnly(e.target.checked)} />
            <span>Qualified only</span>
          </label>
        </div>
        <div className="panel-body flush">
          {loading ? (
            <div className="panel-empty">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="panel-empty">
              {qualifiedOnly ? "No qualified leads yet — they show up here after a successful call." : "No leads yet."}
            </div>
          ) : (
            <div className="trip-table">
              <div className="trip-row trip-head">
                <span>Lead</span>
                <span>Destination</span>
                <span>Travelers</span>
                <span>Month</span>
                <span>Callback</span>
                <span>Score</span>
              </div>
              {rows.map((c) => (
                <Link key={c.conversation_id} href={`/calls/${c.conversation_id}`} className="trip-row">
                  <span className="trip-lead">
                    <span className="avatar sm">{initial(c.name, c.phone)}</span>
                    <span className="trip-lead-text">
                      <span className="trip-name">{c.name ?? c.phone ?? "Unknown"}</span>
                      <span className="trip-when">{fmtWhen(c.started_at_unix)}</span>
                    </span>
                  </span>
                  <span className="trip-dest">
                    {c.fields.destination ? (
                      <><IconPlane className="trip-plane" /> {c.fields.destination}</>
                    ) : <span className="dim">—</span>}
                  </span>
                  <span>{c.fields.num_travelers ?? <span className="dim">—</span>}</span>
                  <span>{c.fields.travel_month ?? <span className="dim">—</span>}</span>
                  <span className="trip-cb">{c.fields.callback_time ?? <span className="dim">—</span>}</span>
                  <span>
                    <span className={`badge score-${leadScore(c).tier}`}>{leadScore(c).label}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">CRM Records</div>
          <div className="panel-sub">from the post-call webhook, joined to the callback queue</div>
        </div>
        <div className="panel-body flush">
          {crmError ? (
            <div className="panel-empty err">{crmError}</div>
          ) : crm === null ? (
            <div className="panel-empty">Loading…</div>
          ) : crm.length === 0 ? (
            <div className="panel-empty">No webhook records yet — they appear after the next completed call.</div>
          ) : (
            <div className="trip-table">
              <div className="trip-row trip-head">
                <span>Lead</span>
                <span>Destination</span>
                <span>Summary</span>
                <span>Queue</span>
                <span>Outcome</span>
                <span>When</span>
              </div>
              {crm.map((c) => (
                <Link key={c.conversation_id} href={`/calls/${c.conversation_id}`} className="trip-row">
                  <span className="trip-name">{c.lead_name ?? c.lead_phone ?? "Unknown"}</span>
                  <span>{c.destination ?? "—"}</span>
                  <span className="dim">{c.summary ? `${c.summary.slice(0, 90)}…` : "—"}</span>
                  <span>{c.queue_status ? <span className="chip">{c.queue_status}</span> : "—"}</span>
                  <span><span className="chip">{c.call_successful ?? "unknown"}</span></span>
                  <span className="trip-when">{c.started_at ? fmtWhen(Date.parse(c.started_at) / 1000) : "—"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
