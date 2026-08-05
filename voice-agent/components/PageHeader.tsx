"use client";

import { useCalls } from "@/lib/useCalls";
import { fmtWhen } from "@/lib/format";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { error, lastSync } = useCalls();
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className={`sync${error ? " sync-error" : ""}`} title={error ?? undefined}>
        <span className="dot" /> {error ? "Data connection unavailable" : `Live · synced ${fmtWhen(Math.floor(lastSync.getTime() / 1000))}`}
      </div>
    </div>
  );
}
