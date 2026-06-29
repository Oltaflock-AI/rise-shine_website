import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { photo } from "@/data/packages";
import { Container } from "../ui/Container";

/** Dark navy hero used at the top of every interior page. */
export function PageHero({
  title,
  subtitle,
  photoId,
  crumb,
}: {
  title: ReactNode;
  subtitle?: string;
  photoId: string;
  crumb: string;
}) {
  return (
    <section className="relative overflow-hidden bg-navy pb-20 pt-36 text-white sm:pt-40">
      <Image
        src={photo(photoId, 1600)}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-30"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 90% at 8% 120%, rgba(226,30,38,0.4), transparent 55%), linear-gradient(110deg, rgba(8,50,73,0.94), rgba(8,50,73,0.5))",
        }}
        aria-hidden
      />
      <Container className="relative">
        <nav aria-label="Breadcrumb" className="mb-4 text-[0.85rem] font-medium text-white/70">
          <Link href="/" className="transition-colors hover:text-white">
            Home
          </Link>{" "}
          / <span className="text-white">{crumb}</span>
        </nav>
        <h1 className="h-lg max-w-3xl text-white">{title}</h1>
        {subtitle && (
          <p className="mt-4 max-w-xl text-lg text-white/85">{subtitle}</p>
        )}
      </Container>
    </section>
  );
}
