"use client";

import Link from "next/link";
import type { CallRecord } from "@/lib/types";
import { fmtDuration, fmtWhen, initial, tripChips } from "@/lib/format";
import { IconStar, IconChevron } from "@/components/icons";

// A single call rendered as a "message" card. Clickable → call detail page.
export function CallCard({ call }: { call: CallRecord }) {
  const processing =
    call.status === "processing" || call.status === "in-progress" || call.status === "initiated";
  const failed = call.status === "failed" || call.call_successful === "failure";
  const chips = tripChips(call).slice(0, 5);

  let badge = <span className="badge ok">Success</span>;
  if (processing) badge = <span className="badge proc"><span className="live-spark" />Processing</span>;
  else if (failed)
    badge = <span className="badge fail">{call.call_successful === "failure" ? "Not qualified" : "Failed"}</span>;

  return (
    <Link href={`/calls/${call.conversation_id}`} className="card card-link">
      <div className="card-head">
        <div className="avatar">{initial(call.name, call.phone)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-name">{call.name ?? call.phone ?? "Unknown lead"}</div>
          <div className="card-meta">
            <span className="num">{call.phone ?? "—"}</span> · {fmtDuration(call.duration_secs)} · {fmtWhen(call.started_at_unix)}
          </div>
        </div>
        <div className="card-badges">
          {call.qualified === true && (
            <span className="badge q"><IconStar className="badge-star" /> Qualified</span>
          )}
          {badge}
        </div>
      </div>

      <div className="card-body">
        {call.summary || call.title ? (
          <div className="bubble">
            {call.title && <div className="bubble-title">{call.title}</div>}
            <span className="bubble-text">{call.summary ?? "Call completed."}</span>
          </div>
        ) : (
          <div className="bubble muted">
            {processing
              ? "Call in progress — the summary will appear here once it ends."
              : "No summary available."}
          </div>
        )}

        {chips.length > 0 && (
          <div className="chips">
            {chips.map((d) => (
              <div className="chip" key={d.label}>
                <span className="chip-k">{d.label}</span>
                <span className="chip-v">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="card-foot">
          <span className="card-foot-link">
            View call insights <IconChevron className="cfl-chevron" />
          </span>
          {call.language && <span className="card-foot-lang">{call.language.toUpperCase()}</span>}
        </div>
      </div>
    </Link>
  );
}
