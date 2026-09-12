"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCalls } from "@/lib/useCalls";
import { PageHeader } from "@/components/PageHeader";
import { Kpi } from "@/components/Kpi";
import { WeeklyTrend } from "@/components/WeeklyTrend";
import {
  RANGE_LABEL,
  compare,
  deltaLabel,
  weeklyBuckets,
  type Range,
  type TrendRow,
} from "@/lib/trend";
import {
  fmtDuration,
  fmtWhen,
  initial,
  hasCallback,
} from "@/lib/format";
import { leadScore } from "@/lib/lead-score";
import {
  IconPhone,
  IconCheck,
  IconCalendar,
  IconClock,
  IconPlane,
} from "@/components/icons";

export default function Overview() {
  const { calls, loading } = useCalls();
  const [range, setRange] = useState<Range>("week");
  const [trendRows, setTrendRows] = useState<TrendRow[] | null>(null);

  // Full history from voice_calls, fetched once per visit. If it cannot be
  // read the KPIs fall back to the live feed (last 25 calls) so the page still
  // shows numbers — labelled as such below.
  useEffect(() => {
    let alive = true;
    fetch("/api/trend", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (alive && r.ok && Array.isArray(j?.rows)) setTrendRows(j.rows);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);

  const rows: TrendRow[] = useMemo(
    () =>
      trendRows ??
      calls.map((c) => ({
        started_at: c.started_at_unix ? new Date(c.started_at_unix * 1000).toISOString() : null,
        duration_secs: c.duration_secs,
        qualified: c.qualified,
        callback_time: c.fields.callback_time,
      })),
    [trendRows, calls],
  );

  const cmp = useMemo(() => compare(rows, range), [rows, range]);
  const weeks = useMemo(() => weeklyBuckets(rows, 12), [rows]);
  const m = cmp.current;
  const prev = cmp.previous;
  const delta = (cur: number, before: number | undefined) =>
    deltaLabel(cur, before ?? null, cmp.previousLabel);

  // Rates are measured against the right denominator: pickup over every call
  // placed, qualification over the ones that actually connected — a batch of
  // unanswered numbers must not read as poor qualifying.
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  const topDest = useMemo(() => {
    const dests = new Map<string, number>();
    for (const c of calls) {
      const d = c.fields.destination?.trim();
      if (d) dests.set(d, (dests.get(d) ?? 0) + 1);
    }
    return [...dests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
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
      <PageHeader title="Overview" subtitle="What the voice agent has produced so far — calls answered, leads worth chasing and callbacks to keep" />

      {/* The five numbers that describe the funnel, in funnel order:
          placed → picked up → qualified → how long → booked. Sliced by the
          period toggle; week and month also say how they compare to the
          period before. */}
      <div className="kpi-bar">
        <div className="seg" role="tablist" aria-label="Period">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              className={`seg-btn${range === r ? " active" : ""}`}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {trendRows === null && !loading && (
          <span className="dim kpi-note">Showing the latest {calls.length} calls only</span>
        )}
      </div>
      <div className="kpis kpis-5">
        <Kpi
          label="Calls placed"
          value={m.total}
          sub={delta(m.total, prev?.total) ?? `${m.connected} connected · ${fmtDuration(m.talkSecs)} talk time`}
          icon={<IconPhone className="i" />}
        />
        <Kpi
          label="Pickup rate"
          value={pct(m.connected, m.total)}
          sub={m.total ? `${m.connected} of ${m.total} answered` : "no calls in this period"}
          icon={<IconPhone className="i" />}
        />
        <Kpi
          label="Qualified leads"
          value={m.qualified}
          sub={delta(m.qualified, prev?.qualified) ?? (m.connected ? `${pct(m.qualified, m.connected)} of connected` : "—")}
          icon={<IconCheck className="i" />}
        />
        <Kpi
          label="Avg call length"
          value={m.connected ? fmtDuration(m.avgSecs) : "—"}
          sub="per connected call"
          icon={<IconClock className="i" />}
        />
        <Kpi
          label="Callbacks booked"
          value={m.callbacks}
          sub={delta(m.callbacks, prev?.callbacks) ?? (m.connected ? `${pct(m.callbacks, m.connected)} of connected` : "—")}
          icon={<IconCalendar className="i" />}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Calls per week</div>
            <div className="panel-sub">Last 12 weeks, Monday to Sunday · darker bar is the qualified share</div>
          </div>
        </div>
        <div className="panel-body">
          <WeeklyTrend weeks={weeks} />
        </div>
      </div>

      <div className="two-col">
        {/* Priority leads */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Priority leads</div>
              <div className="panel-sub">Highest score first — ring these back first</div>
            </div>
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
              <div className="panel-title">Top destinations</div>
              <IconPlane className="panel-head-icon" />
            </div>
            <div className="panel-body">
              {topDest.length === 0 ? (
                <div className="panel-empty sm">No destinations captured yet.</div>
              ) : (
                <div className="bars">
                  {topDest.map(([dest, count]) => {
                    const max = topDest[0][1];
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
              <div className="panel-title">Upcoming callbacks</div>
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
          <div className="panel-title">Recent calls</div>
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
