"use client";

import { useState } from "react";
import { weekLabel, type WeekBucket } from "@/lib/trend";

// Twelve weekly bars: calls placed (light) with the qualified share drawn over
// the same bar (dark). Qualified is a subset of placed, so the two overlap
// rather than stack — the dark bar can never be taller than the light one.
// Plain SVG, one hue at two strengths, legend + hover readout.

const W = 720;
const H = 168;
const PAD = { top: 12, right: 8, bottom: 26, left: 30 };

export function WeeklyTrend({ weeks }: { weeks: WeekBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / weeks.length;
  const barW = Math.min(34, slot * 0.58);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const total = weeks.reduce((s, w) => s + w.total, 0);

  // A handful of horizontal guides on round numbers.
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const guides: number[] = [];
  for (let v = step; v <= max; v += step) guides.push(v);

  const active = hover !== null ? weeks[hover] : null;

  return (
    <div className="trend">
      <div className="trend-legend" aria-hidden>
        <span className="trend-key"><i className="trend-swatch light" /> Calls placed</span>
        <span className="trend-key"><i className="trend-swatch dark" /> Qualified</span>
        <span className="trend-readout num">
          {active
            ? `Week of ${weekLabel(active.weekStart)} · ${active.total} call${active.total === 1 ? "" : "s"} · ${active.qualified} qualified`
            : total === 0
              ? "No calls in the last 12 weeks"
              : `${total} call${total === 1 ? "" : "s"} over 12 weeks`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        role="img"
        aria-label={`Calls per week for the last ${weeks.length} weeks`}
        onMouseLeave={() => setHover(null)}
      >
        {guides.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.left - 8} y={y(v) + 4} className="trend-tick" textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="trend-axis" />
        {weeks.map((w, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const x = cx - barW / 2;
          const isHover = hover === i;
          const isNow = i === weeks.length - 1;
          return (
            <g
              key={w.weekStart}
              onMouseEnter={() => setHover(i)}
              className={`trend-bar${isHover ? " hover" : ""}`}
            >
              {/* Hit target wider than the mark. */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {w.total > 0 && (
                <rect x={x} y={y(w.total)} width={barW} height={y(0) - y(w.total)} rx={4} className="trend-fill light" />
              )}
              {w.qualified > 0 && (
                <rect x={x} y={y(w.qualified)} width={barW} height={y(0) - y(w.qualified)} rx={4} className="trend-fill dark" />
              )}
              {w.total === 0 && <rect x={x} y={y(0) - 2} width={barW} height={2} rx={1} className="trend-fill empty" />}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className={`trend-label${isNow ? " now" : ""}`}
              >
                {isNow ? "This wk" : weekLabel(w.weekStart)}
              </text>
              <title>{`Week of ${weekLabel(w.weekStart)}: ${w.total} calls, ${w.qualified} qualified`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
