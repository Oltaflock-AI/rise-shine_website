import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireCapability } from "@/lib/session";
import { customerStats, isCustomerSort, listCustomers, PAGE_SIZE, type CustomerSort } from "@/lib/customers";
import { fmtAgo, fmtDate, fmtInr } from "@/lib/customer-format";
import { initial } from "@/lib/format";
import { IconHotel, IconPlane, IconSearch } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every account on the main site, one row each, searchable and sortable in
// SQL through the customer_directory view (migration 0018). Read-only: this
// page and its detail page never write to the customer's record.

const SORT_LABEL: Record<CustomerSort, string> = {
  active: "Last active",
  newest: "Newest",
  spent: "Top spenders",
  name: "Name",
};

function href(q: string, sort: CustomerSort, page: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (sort !== "active") sp.set("sort", sort);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/customers?${s}` : "/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const guard = await requireCapability("view");
  if (!guard.ok) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const sort: CustomerSort = isCustomerSort(sp.sort) ? sp.sort : "active";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [list, stats] = await Promise.all([listCustomers({ q, sort, page }), customerStats()]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Customers" subtitle="Everyone with a website account — what they booked, what they paid and when they were last active" />

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Accounts</div>
          <div className="kpi-val num">{stats.accounts}</div>
          <div className="kpi-sub">signed up on the site</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Have booked</div>
          <div className="kpi-val num">{stats.buyers}</div>
          <div className="kpi-sub">at least one confirmed booking</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bookings this month</div>
          <div className="kpi-val num">{stats.bookingsThisMonth}</div>
          <div className="kpi-sub">flights + hotels, confirmed</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Paid this month</div>
          <div className="kpi-val num">{fmtInr(stats.revenueThisMonthInr)}</div>
          <div className="kpi-sub">customer payments, not margin</div>
        </div>
      </div>

      <form className="toolbar" action="/customers" method="get">
        <input
          className="search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, email or phone…"
          aria-label="Search customers"
        />
        {sort !== "active" && <input type="hidden" name="sort" value={sort} />}
        <button type="submit" className="btn btn-inline">
          <IconSearch className="i" /> Search
        </button>
        <div className="seg" role="group" aria-label="Sort">
          {(Object.keys(SORT_LABEL) as CustomerSort[]).map((s) => (
            <Link key={s} href={href(q, s, 1)} className={`seg-btn${s === sort ? " active" : ""}`}>
              {SORT_LABEL[s]}
            </Link>
          ))}
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">{q ? `Results for “${q}”` : "All customers"}</div>
            <div className="panel-sub">
              {list.total} account{list.total === 1 ? "" : "s"}
              {pages > 1 ? ` · page ${page} of ${pages}` : ""}
            </div>
          </div>
          {(stats.error || list.error) && <span className="badge fail">Partial data</span>}
        </div>
        <div className="panel-body flush">
          {list.error ? (
            <div className="panel-empty">
              Could not read the customer directory: {list.error}
              <br />
              <span className="dim">Has migration 0018 (customer_directory view) been run?</span>
            </div>
          ) : list.rows.length === 0 ? (
            <div className="panel-empty">{q ? "No customer matches that search." : "No accounts yet."}</div>
          ) : (
            <div className="trip-table">
              <div className="trip-row cust-row trip-head">
                <span>Customer</span>
                <span>Phone</span>
                <span>Signed up</span>
                <span>Bookings</span>
                <span>Spent</span>
                <span>Last trip</span>
                <span>Last active</span>
              </div>
              {list.rows.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="trip-row cust-row">
                  <span className="trip-lead">
                    <span className="avatar sm">{initial(c.full_name, c.email)}</span>
                    <span className="trip-lead-text">
                      <span className="trip-name">{c.full_name ?? "—"}</span>
                      <span className="trip-when">{c.email ?? "no email"}</span>
                    </span>
                  </span>
                  <span className="num">{c.phone ?? "—"}</span>
                  <span>{fmtDate(c.signed_up_at)}</span>
                  <span className="num">{c.booking_count}</span>
                  <span className="num">{c.booking_count ? fmtInr(c.total_spent_inr) : "—"}</span>
                  <span>
                    {c.last_trip_label ? (
                      <span className="trip-dest">
                        {c.last_trip_kind === "hotel" ? <IconHotel className="trip-plane" /> : <IconPlane className="trip-plane" />}
                        <span>
                          {c.last_trip_label}
                          <span className="trip-when">{fmtDate(c.last_trip_date)}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </span>
                  <span title={c.last_active_at}>{fmtAgo(c.last_active_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        {pages > 1 && (
          <div className="pager">
            {page > 1 ? <Link href={href(q, sort, page - 1)} className="panel-link">← Newer</Link> : <span />}
            <span className="dim">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, list.total)} of {list.total}
            </span>
            {page < pages ? <Link href={href(q, sort, page + 1)} className="panel-link">Older →</Link> : <span />}
          </div>
        )}
      </div>
    </>
  );
}
