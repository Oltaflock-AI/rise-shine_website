"use client";

import { useMemo, useState } from "react";
import { useCalls } from "@/lib/useCalls";
import { PageHeader } from "@/components/PageHeader";
import { CallCard } from "@/components/CallCard";

type Filter = "all" | "qualified" | "callback" | "other";

export default function VoiceCalls() {
  const { calls, loading } = useCalls();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return calls.filter((c) => {
      if (filter === "qualified" && c.qualified !== true) return false;
      if (filter === "callback" && !c.fields.callback_time) return false;
      if (filter === "other" && c.qualified === true) return false;
      if (!needle) return true;
      const hay = [c.name, c.phone, c.title, c.summary, c.fields.destination]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [calls, q, filter]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "qualified", label: "Qualified" },
    { key: "callback", label: "Callback booked" },
    { key: "other", label: "Other" },
  ];

  return (
    <>
      <PageHeader title="Voice Calls" subtitle="Every call Priya placed · click any card for full insights" />

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search by name, phone, destination…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="seg" role="tablist" aria-label="Filter calls">
          {filters.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`seg-btn${filter === f.key ? " active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="panel"><div className="panel-empty">Loading calls…</div></div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <div className="panel-empty">
            {calls.length === 0
              ? "No calls have reached the voice pipeline yet."
              : "No calls match your search."}
          </div>
        </div>
      ) : (
        <div className="feed">
          {filtered.map((c) => (
            <CallCard key={c.conversation_id} call={c} />
          ))}
        </div>
      )}
    </>
  );
}
