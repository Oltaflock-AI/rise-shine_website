"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { navItems, site } from "@/data/site";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { cn } from "@/lib/cn";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navText = scrolled ? "text-ink" : "text-white";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-cream/92 py-3 shadow-[0_8px_30px_rgba(8,50,73,0.08)] backdrop-blur-md"
          : "py-5",
      )}
    >
      <Container>
        <nav className="flex items-center justify-between gap-6">
          {/* Logo — white over the dark hero, red once scrolled */}
          <Link
            href="/"
            className="relative flex items-center"
            aria-label={`${site.name} — home`}
          >
            <Image
              src="/brand/logo-white.png"
              alt={site.name}
              width={216}
              height={81}
              priority
              className={cn(
                "h-9 w-auto transition-opacity duration-300 sm:h-11",
                scrolled && "opacity-0",
              )}
            />
            <Image
              src="/brand/logo.png"
              alt=""
              width={216}
              height={81}
              priority
              className={cn(
                "absolute left-0 top-0 h-9 w-auto transition-opacity duration-300 sm:h-11",
                scrolled ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>

          {/* Desktop nav */}
          <ul className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <li key={item.href} className="group relative">
                <Link
                  href={item.href}
                  className={cn(
                    "relative inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-[0.95rem] font-medium transition-colors",
                    "after:absolute after:inset-x-4 after:bottom-1.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-red after:transition-transform after:duration-300 hover:after:scale-x-100",
                    navText,
                    isActive(item.href) && "after:scale-x-100",
                  )}
                >
                  {item.label}
                  {item.children && (
                    <ChevronDown size={15} strokeWidth={2.2} aria-hidden />
                  )}
                </Link>
                {item.children && (
                  <ul className="invisible absolute left-0 top-[120%] min-w-[220px] translate-y-2 rounded-2xl bg-white p-2.5 opacity-0 shadow-brand transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="flex items-center rounded-xl px-3.5 py-3 text-[0.92rem] font-medium text-ink transition-colors hover:bg-cream-2 hover:text-red"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {/* CTA + burger */}
          <div className="flex items-center gap-2">
            <Button
              href="/plan-my-trip"
              arrow
              className="hidden lg:inline-flex"
            >
              Plan My Trip
            </Button>
            <button
              type="button"
              className={cn(
                "grid h-11 w-11 place-items-center rounded-full lg:hidden",
                navText,
              )}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={26} />
            </button>
          </div>
        </nav>
      </Container>

      {/* Mobile menu */}
      <div
        className={cn(
          "grad-navy fixed inset-0 z-50 flex flex-col px-8 pb-10 pt-24 transition-transform duration-300 lg:hidden",
          menuOpen ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full text-white"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        >
          <X size={28} />
        </button>
        <nav className="flex flex-col">
          {navItems.map((item) => (
            <div key={item.href}>
              <Link
                href={item.href}
                className="block border-b border-white/15 py-3.5 font-script text-3xl text-white"
              >
                {item.label}
              </Link>
              {item.children && (
                <div className="flex flex-col gap-1 py-2 pl-4">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="py-1.5 text-[0.95rem] text-white/80"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Button href="/plan-my-trip" arrow fullWidth className="mt-7">
            Plan My Trip
          </Button>
        </nav>
      </div>
    </header>
  );
}
