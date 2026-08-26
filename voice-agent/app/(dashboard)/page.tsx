"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCalls } from "@/lib/useCalls";
import { PageHeader } from "@/components/PageHeader";
import { Kpi } from "@/components/Kpi";
import {
  fmtDuration,
  fmtWhen,
  initial,
  isConnected,
  hasCallback,
} from "@/lib/format";
import { leadScore } from "@/lib/lead-score";
import {
  IconPhone,
  IconCheck,
  IconCalendar,
  IconClock,
  IconStar,
  IconPlane,
} from "@/components/icons";

export default function Overview() {
  const { calls, loading } = useCalls();

  const m = useMemo(() => {
    const total = calls.length;
    const connected = calls.filter(isConnected).length;
    const qualified = calls.filter((c) => c.qualified === true).length;
    const callbacks = calls.filter(hasCallback).length;
    const durs = calls.map((c) => c.duration_secs ?? 0).filter((d) => d > 0);
    const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

    const dests = new Map<string, number>();
    for (const c of calls) {
      const d = c.fields.destination?.trim();
      if (d) dests.set(d, (dests.get(d) ?? 0) + 1);
    }
    const topDest = [...dests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Rates are measured against the right denominator: answer rate over every
    // call placed, qualification over the ones that actually connected — a
    // batch of unanswered numbers must not read as poor qualifying.
    const answerRate = total ? Math.round((connected / total) * 100) : 0;
    const qualRate = connected ? Math.round((qualified / connected) * 100) : 0;
    const hot = calls.filter((c) => leadScore(c).tier === "hot").length;
    const warm = calls.filter((c) => leadScore(c).tier === "warm").length;
    const talkSecs = calls.reduce((sum, c) => sum + (c.duration_secs ?? 0), 0);

    return {
      total, connected, qualified, callbacks, avg, topDest,
      answerRate, qualRate, hot, warm, talkSecs,
    };
  }, [calls]);

  // Ranked by lead score, not recency: the top of this list should be the call
  // worth ringing back first.
  const priority = useMemo(
    () =>
      [...calls]
        .filter((c) => leadScore(c).tier !== "cold")
        .sort(
          (a, b) =>
            leadScore(b).score - leadScore(a).score ||
            (b.started_at_unix ?? 0) - (a.started_at_unix ?? 0),
        )
        .slice(0, 6),
    [calls],
  );

  const upcomingCallbacks = useMemo(
    () =>
      [...calls]
        .filter(hasCallback)
        .sort((a, b) => (b.started_at_unix ?? 0) - (a.started_at_unix ?? 0))
        .slice(0, 5),
    [calls],
  );

  return (
    <>
      <PageHeader title="Overview" subtitle="AI voice sales engine · live travel pipeline" />

      <div className="kpis">
        <Kpi label="Voice Calls" value={m.total} sub={m.total ? `${m.answerRate}% answered` : "none yet"} icon={<IconPhone className="i" />} />
        <Kpi label="Hot Leads" value={m.hot} sub={`${m.warm} warm behind them`} icon={<IconStar className="i" />} />
        <Kpi label="Qualified Leads" value={m.qualified} sub={m.connected ? `${m.qualRate}% of connected calls` : "—"} icon={<IconCheck className="i" />} />
        <Kpi label="Callbacks Booked" value={m.callbacks} sub="1–4 PM slots locked" icon={<IconCalendar className="i" />} />
      </div>

      <div className="kpis">
        <Kpi label="Connected Calls" value={m.connected} sub={`of ${m.total} placed`} icon={<IconPhone className="i" />} />
        <Kpi label="Avg Call Time" value={fmtDuration(m.avg)} sub="per connected call" icon={<IconClock className="i" />} />
        <Kpi label="Total Talk Time" value={fmtDuration(m.talkSecs)} sub="across every call" icon={<IconClock className="i" />} />
        <Kpi label="Callback Rate" value={m.connected ? `${Math.round((m.callbacks / m.connected) * 100)}%` : "—"} sub="connected calls that booked" icon={<IconCalendar className="i" />} />
      </div>

      <div className="two-col">
        {/* Priority leads */}
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Priority Leads · highest score first</div>
            <Link href="/leads" className="panel-link">All leads →</Link>
          </div>
          <div className="panel-body flush">
            {loading ? (
              <div className="panel-empty">Loading…</div>
            ) : priority.length === 0 ? (
              <div className="panel-empty">No warm or hot leads yet — they appear here ranked by score.</div>
            ) : (
              <div className="row-stripe">
                {priority.map((c) => (
                  <Link key={c.conversation_id} href={`/calls/${c.conversation_id}`} className="lead-row">
                    <div className="avatar sm">{initial(c.name, c.phone)}</div>
                    <div className="lead-main">
                      <div className="lead-name">{c.name ?? c.phone}</div>
                      <div className="lead-sub">
                        {c.fields.destination ?? "Destination TBD"}
                        {c.fields.travel_month ? ` · ${c.fields.travel_month}` : ""}
                      </div>
                    </div>
                    <span className={`badge score-${leadScore(c).tier}`}>{leadScore(c).label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Top Destinations</div>
              <IconPlane className="panel-head-icon" />
            </div>
            <div className="panel-body">
              {m.topDest.length === 0 ? (
                <div className="panel-empty sm">No destinations captured yet.</div>
              ) : (
                <div className="bars">
                  {m.topDest.map(([dest, count]) => {
                    const max = m.topDest[0][1];
                    return (
                      <div className="bar-row" key={dest}>
                        <span className="bar-label">{dest}</span>
                        <span className="bar-track">
                          <span className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                        </span>
                        <span className="bar-val num">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Upcoming Callbacks</div>
              <IconCalendar className="panel-head-icon" />
            </div>
            <div className="panel-body flush">
              {upcomingCallbacks.length === 0 ? (
                <div className="panel-empty sm">No callbacks booked yet.</div>
              ) : (
                <div className="row-stripe">
                  {upcomingCallbacks.map((c) => (
                    <Link key={c.conversation_id} href={`/calls/${c.conversation_id}`} className="cb-row">
                      <div className="cb-main">
                        <div className="cb-name">{c.name ?? c.phone}</div>
                        <div className="cb-sub">{c.fields.destination ?? "—"}</div>
                      </div>
                      <span className="cb-time">{c.fields.callback_time}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Recent Calls</div>
          <Link href="/calls" className="panel-link">All calls →</Link>
        </div>
        <div className="panel-body flush">
          {calls.length === 0 ? (
            <div className="panel-empty">No calls have reached the voice pipeline yet.</div>
          ) : (
            <div className="row-stripe">
              {calls.slice(0, 5).map((c) => (
                <Link key={c.conversation_id} href={`/calls/${c.conversation_id}`} className="lead-row">
                  <div className="avatar sm">{initial(c.name, c.phone)}</div>
                  <div className="lead-main">
                    <div className="lead-name">{c.name ?? c.phone ?? "Unknown lead"}</div>
                    <div className="lead-sub">{c.title ?? c.fields.destination ?? "Travel enquiry"}</div>
                  </div>
                  <span className="lead-when">{fmtWhen(c.started_at_unix)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
