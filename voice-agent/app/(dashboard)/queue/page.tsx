import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireCapability } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";
import { fmtWhen } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The OUTBOUND half of the voice picture: rows the main site's /request-a-call
// form parked in callback_queue, waiting for (or already through) the
// dispatcher. voice_calls — what actually happened on the line — is the other
// half, shown on the leads page.

interface QueueRow {
  id: string;
  name: string;
  phone: string;
  status: "pending" | "calling" | "done" | "failed" | "cancelled";
  due_at: string;
  attempts: number;
  conversation_id: string | null;
  last_error: string | null;
  source: string | null;
  created_at: string;
}

const GROUPS: { title: string; statuses: QueueRow["status"][]; empty: string }[] = [
  { title: "Waiting to be dialled", statuses: ["pending", "calling"], empty: "Nothing queued right now." },
  { title: "Completed", statuses: ["done"], empty: "No completed callbacks yet." },
  { title: "Failed / cancelled", statuses: ["failed", "cancelled"], empty: "No failures. Good." },
];

export default async function QueuePage() {
  const guard = await requireCapability("view");
  if (!guard.ok) redirect("/login");

  const { data, error } = await serviceClient()
    .from("callback_queue")
    .select("id, name, phone, status, due_at, attempts, conversation_id, last_error, source, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as QueueRow[];

  return (
    <>
      <PageHeader
        title="Callback Queue"
        subtitle="Requests from /request-a-call, waiting for or already through the dialler"
      />
      {error ? (
        <div className="panel">
          <div className="panel-body">
            <p className="err">Could not read the queue: {error.message}</p>
          </div>
        </div>
      ) : (
        GROUPS.map(({ title, statuses, empty }) => {
          const group = rows.filter((r) => statuses.includes(r.status));
          return (
            <div className="panel" key={title}>
              <div className="panel-head">
                <div className="panel-title">{title}</div>
                <span className="badge">{group.length}</span>
              </div>
              <div className="panel-body flush">
                {group.length === 0 ? (
                  <div className="panel-empty">{empty}</div>
                ) : (
                  <div className="trip-table">
                    <div className="trip-row trip-head">
                      <span>Lead</span>
                      <span>Phone</span>
                      <span>Due</span>
                      <span>Attempts</span>
                      <span>Status</span>
                      <span>Detail</span>
                    </div>
                    {group.map((r) => (
                      <div className="trip-row" key={r.id}>
                        <span className="trip-name">{r.name}</span>
                        <span className="num">{r.phone}</span>
                        <span>{fmtWhen(Date.parse(r.due_at) / 1000)}</span>
                        <span className="num">{r.attempts}</span>
                        <span><span className="chip">{r.status}</span></span>
                        <span className="dim">{r.last_error ?? r.source ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
