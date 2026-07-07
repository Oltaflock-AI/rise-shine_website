"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, UserRound, LayoutGrid, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const initial = (name: string) => (name.trim()[0] || "?").toUpperCase();
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Account";

/** Desktop auth control: "Log in / Sign up" when logged out, account menu when in. */
export function HeaderAuth({ scrolled }: { scrolled: boolean }) {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = scrolled ? "text-ink" : "text-white";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!ready) return <span className="hidden h-9 w-24 lg:block" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(
          "hidden items-center gap-1.5 rounded-full px-3 py-2.5 text-[0.95rem] font-medium transition-colors hover:text-red lg:inline-flex",
          tone,
        )}
      >
        <UserRound size={18} aria-hidden />
        Log in / Sign up
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition-colors",
          scrolled ? "hover:bg-cream-2" : "hover:bg-white/10",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-red text-[0.9rem] font-bold text-white">
          {initial(user.name)}
        </span>
        <span className={cn("text-[0.92rem] font-semibold", tone)}>{firstName(user.name)}</span>
        <ChevronDown size={15} className={cn("transition-transform", tone, open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] min-w-[220px] overflow-hidden rounded-2xl bg-white p-2 shadow-brand"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[0.9rem] font-bold text-ink">{user.name}</p>
            <p className="truncate text-[0.78rem] text-muted">{user.email}</p>
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.9rem] font-medium text-ink transition-colors hover:bg-cream-2 hover:text-red"
          >
            <LayoutGrid size={17} aria-hidden /> My account
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.9rem] font-medium text-ink transition-colors hover:bg-cream-2 hover:text-red"
          >
            <LogOut size={17} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** Mobile auth block inside the slide-out menu. */
export function HeaderAuthMobile({ onNavigate }: { onNavigate: () => void }) {
  const { user, ready, logout } = useAuth();
  if (!ready) return null;

  if (!user) {
    return (
      <div className="mt-7 flex flex-col gap-3">
        <Link
          href="/login"
          onClick={onNavigate}
          className="flex min-h-12 items-center justify-center rounded-full border-[1.6px] border-white/45 bg-white/10 font-semibold text-white backdrop-blur"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          onClick={onNavigate}
          className="grad-red flex min-h-12 items-center justify-center rounded-full font-semibold text-white shadow-brand-red"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-7 rounded-2xl bg-white/10 p-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-red text-base font-bold text-white">
          {initial(user.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-white">{user.name}</p>
          <p className="truncate text-[0.8rem] text-white/70">{user.email}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href="/account"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/15 py-2.5 text-[0.9rem] font-semibold text-white"
        >
          <LayoutGrid size={16} aria-hidden /> Account
        </Link>
        <button
          onClick={() => {
            logout();
            onNavigate();
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/15 py-2.5 text-[0.9rem] font-semibold text-white"
        >
          <LogOut size={16} aria-hidden /> Log out
        </button>
      </div>
    </div>
  );
}
