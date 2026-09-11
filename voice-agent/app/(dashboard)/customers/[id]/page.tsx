import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireCapability } from "@/lib/session";
import { getCustomer, type CustomerBooking } from "@/lib/customers";
import { bookingStatusLabel, describeEvent, fmtAgo, fmtDate, fmtDateTime, fmtInr, PAX_TYPE } from "@/lib/customer-format";
import { initial } from "@/lib/format";
import {
  IconArrowLeft,
  IconCalendar,
  IconCard,
  IconHotel,
  IconInfo,
  IconMail,
  IconPhone,
  IconPlane,
  IconUsers,
} from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One customer, everything the site knows about them. Read-only. PAN and
// passport numbers arrive here already masked (lib/customers.ts) — there is no
// "reveal" on purpose; TBO holds the full document.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Panel({
  title,
  sub,
  count,
  children,
}: {
  title: string;
  sub?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">{title}</div>
          {sub && <div className="panel-sub">{sub}</div>}
        </div>
        {count != null && <span className="badge">{count}</span>}
      </div>
      <div className="panel-body flush">{children}</div>
    </div>
  );
}

function Field({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="detail-field">
      <div className="df-icon">{icon}</div>
      <div className="df-text">
        <span className="df-label">{label}</span>
        <span className={`df-value${mono ? " mono" : ""}`}>{value ?? "—"}</span>
      </div>
    </div>
  );
}

function BookingRow({ b }: { b: CustomerBooking }) {
  const st = bookingStatusLabel(b.kind, b.status);
  return (
    <div className="trip-row book-row">
      <span className="trip-lead">
        {b.kind === "hotel" ? <IconHotel className="trip-plane" /> : <IconPlane className="trip-plane" />}
        <span className="trip-lead-text">
          <span className="trip-name">{b.label}</span>
          <span className="trip-when">{b.sub ?? (b.kind === "hotel" ? "Hotel" : "Flight")} · booked {fmtDate(b.created_at)}</span>
        </span>
      </span>
      <span>
        {fmtDate(b.start)}
        {b.end ? ` – ${fmtDate(b.end)}` : ""}
      </span>
      <span className="num">{b.ref ?? "—"}</span>
      <span className="num">{fmtInr(b.amount_paid_inr ?? b.fare_inr)}</span>
      <span>
        <span className={`badge ${st.tone}`}>{st.label}</span>
      </span>
      {b.passengers.length > 0 && (
        <span className="book-pax">
          {b.passengers.map((p, i) => (
            <span key={i}>
              <b>{p.name || "—"}</b>
              {p.pax_type ? ` · ${PAX_TYPE[p.pax_type] ?? p.pax_type}` : ""}
              {p.is_lead ? " · lead" : ""}
              {p.ticket_number ? ` · tkt ${p.ticket_number}` : ""}
              {p.pan ? ` · PAN ${p.pan}` : ""}
              {p.passport_no ? ` · passport ${p.passport_no}` : ""}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("view");
  if (!guard.ok) redirect("/login");

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const d = await getCustomer(id);
  if (!d) notFound();
  const c = d.customer;
  const name = c.full_name ?? c.email ?? "Customer";

  const timelineTone = (event: string) =>
    event === "booking_confirmed" ? "ok" : event === "booking_failed" ? "fail" : event === "payment_opened" || event === "checkout_started" ? "warm" : "";

  return (
    <>
      <Link href="/customers" className="back-link">
        <IconArrowLeft className="bl-icon" /> Customers
      </Link>
      <PageHeader title={name} subtitle={`Customer since ${fmtDate(c.signed_up_at)} · last active ${fmtAgo(c.last_active_at)}`} />

      <div className="cust-head">
        <div className="detail-head" style={{ marginBottom: 0 }}>
          <div className="avatar lg">{initial(c.full_name, c.email)}</div>
          <div>
            <h2 className="detail-name">{name}</h2>
            <div className="detail-meta">
              {c.email ?? "no email"}
              {c.phone ? ` · ${c.phone}` : ""}
            </div>
          </div>
        </div>
        <div className="cust-flags">
          {c.booking_count > 0 ? <span className="badge ok">Has booked</span> : <span className="badge">Never booked</span>}
          {c.email_confirmed_at ? <span className="badge ok">Email verified</span> : <span className="badge proc">Email unverified</span>}
          {d.marketing && (
            <span className={`badge ${d.marketing.subscribed ? "q" : ""}`}>
              {d.marketing.subscribed ? "On offers list" : "Unsubscribed"}
            </span>
          )}
        </div>
      </div>

      {d.warnings.length > 0 && (
        <div className="notice warn">
          <IconInfo className="notice-icon" />
          <div>
            <strong>Some sections could not be read.</strong>
            <ul className="warn-list">
              {d.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Bookings</div>
          <div className="kpi-val num">{c.booking_count}</div>
          <div className="kpi-sub">confirmed, flights + hotels</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total paid</div>
          <div className="kpi-val num">{fmtInr(c.total_spent_inr)}</div>
          <div className="kpi-sub">customer payments</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Last trip</div>
          <div className="kpi-val" style={{ fontSize: 19 }}>{c.last_trip_label ?? "—"}</div>
          <div className="kpi-sub">{c.last_trip_date ? fmtDate(c.last_trip_date) : "no trips yet"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Last sign-in</div>
          <div className="kpi-val" style={{ fontSize: 19 }}>{fmtAgo(c.last_sign_in_at)}</div>
          <div className="kpi-sub">{c.last_sign_in_at ? fmtDateTime(c.last_sign_in_at) : "never signed in"}</div>
        </div>
      </div>

      <Panel title="Account" sub="What the customer entered on the website">
        <div className="panel-body">
          <div className="detail-grid cols-3">
            <Field icon={<IconMail className="i" />} label="Email" value={c.email} />
            <Field icon={<IconPhone className="i" />} label="Phone" value={c.phone} mono />
            <Field icon={<IconCalendar className="i" />} label="Date of birth" value={c.dob ? fmtDate(c.dob) : null} />
            <Field icon={<IconCard className="i" />} label="GSTIN" value={c.gstin} mono />
            <Field icon={<IconCalendar className="i" />} label="Signed up" value={fmtDateTime(c.signed_up_at)} />
            <Field icon={<IconInfo className="i" />} label="Activity logged" value={`${c.event_count} event${c.event_count === 1 ? "" : "s"}`} />
          </div>
        </div>
      </Panel>

      <Panel title="Bookings" sub="Mirror of confirmed TBO bookings — TBO stays canonical" count={d.bookings.length}>
        {d.bookings.length === 0 ? (
          <div className="panel-empty">No bookings on this account.</div>
        ) : (
          <div className="trip-table">
            <div className="trip-row book-row trip-head">
              <span>Trip</span>
              <span>Dates</span>
              <span>Ref</span>
              <span>Paid</span>
              <span>Status</span>
            </div>
            {d.bookings.map((b) => (
              <BookingRow key={b.id} b={b} />
            ))}
          </div>
        )}
      </Panel>

      <div className="two-col">
        <Panel title="Payments" sub="Cashfree ledger, by order" count={d.payments.length}>
          {d.payments.length === 0 ? (
            <div className="panel-empty sm">No payments recorded.</div>
          ) : (
            <div className="trip-table">
              <div className="trip-row pay-row trip-head">
                <span>Order</span>
                <span>Payment</span>
                <span>Amount</span>
                <span>Status</span>
                <span>When</span>
              </div>
              {d.payments.map((p) => (
                <div className="trip-row pay-row" key={p.cf_payment_id}>
                  <span className="num">{p.cf_order_id ?? "—"}</span>
                  <span className="num">{p.cf_payment_id}</span>
                  <span className="num">{fmtInr(p.amount_inr)}</span>
                  <span>
                    <span className={`badge ${p.status === "captured" || p.status === "success" ? "ok" : p.status === "refunded" ? "proc" : "fail"}`}>
                      {p.status}
                    </span>
                  </span>
                  <span className="dim">{fmtDate(p.refunded_at ?? p.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Voice calls & callbacks" sub={c.phone ? `Matched on ${c.phone}` : "No phone on the account, so nothing to match"} count={d.calls.length + d.callbacks.length}>
          {d.calls.length + d.callbacks.length === 0 ? (
            <div className="panel-empty sm">No calls with this number.</div>
          ) : (
            <div className="trip-table">
              {d.callbacks.map((cb) => (
                <div className="trip-row call-row" key={cb.id}>
                  <span className="dim">{fmtDate(cb.created_at)}</span>
                  <span>
                    <span className="chip">{cb.status}</span>
                  </span>
                  <span>
                    Callback requested{cb.source ? ` via ${cb.source}` : ""} · {cb.attempts} attempt{cb.attempts === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
              {d.calls.map((v) => (
                <Link className="trip-row call-row" key={v.conversation_id} href={`/calls/${v.conversation_id}`}>
                  <span className="dim">{fmtDate(v.started_at)}</span>
                  <span>{v.qualified ? <span className="badge ok">Qualified</span> : <span className="badge">Call</span>}</span>
                  <span>
                    {v.destination ? <b>{v.destination} · </b> : null}
                    {v.summary ?? "No summary"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="two-col">
        <Panel title="Saved travellers" sub="Prefill list from past checkouts — PAN and passport masked" count={d.travellers.length}>
          {d.travellers.length === 0 ? (
            <div className="panel-empty sm">Nothing saved yet.</div>
          ) : (
            <div className="trip-table">
              <div className="trip-row trav-row trip-head">
                <span>Name</span>
                <span>Type</span>
                <span>DOB</span>
                <span>PAN</span>
                <span>Passport</span>
              </div>
              {d.travellers.map((t) => (
                <div className="trip-row trav-row" key={t.id}>
                  <span className="trip-lead">
                    <IconUsers className="trip-plane" />
                    <span className="trip-lead-text">
                      <span className="trip-name">{[t.title, t.first_name, t.last_name].filter(Boolean).join(" ")}</span>
                      <span className="trip-when">
                        {t.nationality ?? ""}
                        {t.nationality ? " · " : ""}last used {fmtDate(t.last_used_at)}
                      </span>
                    </span>
                  </span>
                  <span>{PAX_TYPE[t.pax_type] ?? t.pax_type}</span>
                  <span>{fmtDate(t.dob)}</span>
                  <span className="num">{t.pan ?? "—"}</span>
                  <span className="num">
                    {t.passport_no ?? "—"}
                    {t.passport_expiry ? <span className="trip-when">exp {fmtDate(t.passport_expiry)}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Addresses" sub="Billing / contact address book" count={d.addresses.length}>
          {d.addresses.length === 0 ? (
            <div className="panel-empty sm">No saved addresses.</div>
          ) : (
            <div className="trip-table">
              {d.addresses.map((a) => (
                <div className="trip-row addr-row" key={a.id}>
                  <span>
                    <span className="trip-name">
                      {a.label ? `${a.label} · ` : ""}
                      {a.address1}
                      {a.address2 ? `, ${a.address2}` : ""}
                    </span>
                    <span className="trip-when">
                      {[a.city, a.state, a.pin, a.country_code].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="num">{a.phone ?? "—"}</span>
                  <span className="dim">{a.email ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {d.enquiries.length > 0 && (
        <Panel title="Enquiries" sub="Logged-in enquiries recorded on the account" count={d.enquiries.length}>
          <div className="trip-table">
            {d.enquiries.map((e) => (
              <div className="trip-row enq-row" key={e.id}>
                <span className="dim">{fmtDate(e.created_at)}</span>
                <span>{e.destination ?? e.package_key ?? "—"}</span>
                <span>{e.message ?? "—"}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Activity" sub="Key actions while signed in — searches, checkouts, bookings, enquiries (last 300)" count={d.events.length}>
        {d.events.length === 0 ? (
          <div className="panel-empty">Nothing logged yet. Activity starts recording from the customer&rsquo;s next signed-in visit.</div>
        ) : (
          <div className="timeline">
            {d.events.map((e) => {
              const line = describeEvent(e);
              return (
                <div className="tl-row" key={e.id}>
                  <span className={`tl-dot ${timelineTone(e.event)}`} />
                  <span>
                    <div className="tl-title">{line.title}</div>
                    {line.detail && <div className="tl-detail">{line.detail}</div>}
                  </span>
                  <span className="tl-when" title={e.occurred_at}>
                    {fmtDateTime(e.occurred_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
