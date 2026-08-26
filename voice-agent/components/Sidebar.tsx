"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCalls } from "@/lib/useCalls";
import { fmtWhen } from "@/lib/format";
import {
  IconOverview,
  IconPhone,
  IconPlane,
  IconUsers,
} from "@/components/icons";

export function Sidebar() {
  const pathname = usePathname();
  const { calls, error, lastSync } = useCalls();

  const qualified = calls.filter((c) => c.qualified === true).length;

  const items = [
    { href: "/", label: "Overview", Icon: IconOverview, exact: true },
    { href: "/calls", label: "Voice Calls", Icon: IconPhone, count: calls.length },
    { href: "/queue", label: "Callback Queue", Icon: IconPhone },
    { href: "/leads", label: "Trips & Leads", Icon: IconPlane, count: qualified },
  ];

  const adminItems = [{ href: "/access", label: "Team Access", Icon: IconUsers }];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
        <img src="/brand/logo.png" alt="Rise & Shine Travels" className="brand-logo" />
        <span className="brand-sub">AI Sales Engine</span>
      </Link>

      <nav className="nav" aria-label="Primary">
        <div className="nav-group-label">Workspace</div>
        {items.map(({ href, label, Icon, count, exact }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${isActive(href, exact) ? " active" : ""}`}
            aria-current={isActive(href, exact) ? "page" : undefined}
          >
            <Icon className="nav-icon" />
            <span className="nav-label">{label}</span>
            {count != null && count > 0 && <span className="nav-count">{count}</span>}
          </Link>
        ))}

        <div className="nav-group-label">Settings</div>
        {adminItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${isActive(href) ? " active" : ""}`}
            aria-current={isActive(href) ? "page" : undefined}
          >
            <Icon className="nav-icon" />
            <span className="nav-label">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className={`sync-mini${error ? " sync-error-text" : ""}`} title={error ?? undefined}>
          <span className="dot" /> {error ? "Data unavailable" : `Live · ${fmtWhen(Math.floor(lastSync.getTime() / 1000))}`}
        </div>
        <button
          type="button"
          className="btn-quiet"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
        <div className="sidebar-org">Powered by Oltaflock · v1.1</div>
      </div>
    </aside>
  );
}
