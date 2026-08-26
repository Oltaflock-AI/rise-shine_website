"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useCall, useCalls } from "@/lib/useCalls";
import {
  fmtAbsolute,
  fmtDuration,
  initial,
} from "@/lib/format";
import { leadScore } from "@/lib/lead-score";
import {
  IconArrowLeft,
  IconStar,
  IconPlane,
  IconUsers,
  IconCalendar,
  IconPhone,
  IconClock,
  IconCheck,
} from "@/components/icons";

const DETAIL_FIELDS = [
  { key: "destination", label: "Destination", Icon: IconPlane },
  { key: "num_travelers", label: "Travelers", Icon: IconUsers },
  { key: "travel_month", label: "Travel month", Icon: IconCalendar },
  { key: "special_requests", label: "Special requests", Icon: IconStar },
  { key: "callback_time", label: "Callback locked", Icon: IconClock },
  { key: "whatsapp_number", label: "Contact number", Icon: IconPhone },
] as const;

export default function CallDetail() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const call = useCall(id);
  const { loading } = useCalls();
  const [showTranscript, setShowTranscript] = useState(true);

  if (!call) {
    return (
      <>
        <Link href="/calls" className="back-link"><IconArrowLeft className="bl-icon" /> Voice Calls</Link>
        <div className="panel"><div className="panel-empty">{loading ? "Loading call…" : "Call not found."}</div></div>
      </>
    );
  }

  const processing = call.status === "processing" || call.status === "in-progress";
  const failed = call.status === "failed" || call.call_successful === "failure";
  const filledFields = DETAIL_FIELDS.filter((f) => call.fields[f.key]);
  const score = leadScore(call);

  return (
    <>
      <Link href="/calls" className="back-link"><IconArrowLeft className="bl-icon" /> Voice Calls</Link>

      {/* Header */}
      <div className="detail-head">
        <div className="avatar lg">{initial(call.name, call.phone)}</div>
        <div className="detail-id">
          <h1 className="detail-name">{call.name ?? call.phone ?? "Unknown lead"}</h1>
          <div className="detail-meta">
            {call.phone ?? "—"} · {fmtDuration(call.duration_secs)} · {fmtAbsolute(call.started_at_unix)}
            {call.language ? ` · ${call.language.toUpperCase()}` : ""}
          </div>
        </div>
        <div className="detail-badges">
          <span className={`badge score-${score.tier}`} title="Lead score out of 100">{score.label}</span>
          {call.qualified === true && <span className="badge q"><IconStar className="badge-star" /> Qualified</span>}
          {processing ? (
            <span className="badge proc"><span className="live-spark" />Processing</span>
          ) : failed ? (
            <span className="badge fail">{call.call_successful === "failure" ? "Not qualified" : "Failed"}</span>
          ) : (
            <span className="badge ok"><IconCheck className="badge-star" /> Success</span>
          )}
        </div>
      </div>

      {/* Recording — streamed through our own gated proxy, never the API key */}
      {!processing && (call.duration_secs ?? 0) > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Call Recording</div>
            <span className="panel-sub">{fmtDuration(call.duration_secs)}</span>
          </div>
          <div className="panel-body">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript below IS the caption */}
            <audio
              className="recording"
              controls
              preload="none"
              src={`/api/conversations/${encodeURIComponent(call.conversation_id)}/audio`}
            />
            <p className="access-hint">
              If the player is empty the call has no stored audio — recordings appear
              once ElevenLabs finishes processing.
            </p>
          </div>
        </div>
      )}

      {/* Trip details */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Trip Details · what Priya collected</div>
          <span className="panel-sub">{filledFields.length} captured fields</span>
        </div>
        <div className="panel-body">
          {filledFields.length === 0 ? (
            <div className="panel-empty sm">
              {processing ? "Details will appear once the call finishes." : "No trip details were captured on this call."}
            </div>
          ) : (
            <div className="detail-grid">
              {filledFields.map(({ key, label, Icon }) => (
                <div className="detail-field" key={key}>
                  <span className="df-icon"><Icon className="i" /></span>
                  <div className="df-text">
                    <span className="df-label">{label}</span>
                    <span className="df-value">{call.fields[key]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="detail-cols">
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Call Summary</div></div>
          <div className="panel-body">
            {call.summary || call.title ? (
              <div className="bubble">
                {call.title && <div className="bubble-title">{call.title}</div>}
                <span className="bubble-text">{call.summary ?? "Call completed."}</span>
              </div>
            ) : (
              <div className="bubble muted">{processing ? "Summary pending — call still processing." : "No summary available."}</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Transcript</div>
            <button className="panel-link as-btn" onClick={() => setShowTranscript((s) => !s)}>
              {showTranscript ? "Hide" : `Show (${call.transcript.length})`}
            </button>
          </div>
          {showTranscript && (
            <div className="panel-body">
              {call.transcript.length === 0 ? (
                <div className="panel-empty sm">No transcript available.</div>
              ) : (
                <div className="transcript">
                  {call.transcript.map((t, i) => {
                    const isAgent = /agent|assistant|bot/i.test(t.role);
                    return (
                      <div className={`turn ${isAgent ? "agent" : "user"}`} key={i}>
                        <span className="who">{isAgent ? "Priya" : "Lead"}</span>
                        <span className="msg">{t.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
