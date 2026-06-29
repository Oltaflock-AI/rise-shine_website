import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PackageCard } from "@/components/ui/PackageCard";
import {
  categoryMeta,
  getByCategory,
  type PackageCategory,
} from "@/data/packages";
import { cn } from "@/lib/cn";

const categories: PackageCategory[] = ["domestic", "international", "cruise"];

function isCategory(value: string): value is PackageCategory {
  return (categories as string[]).includes(value);
}

export function generateStaticParams() {
  return categories.map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  if (!isCategory(category)) return {};
  const meta = categoryMeta[category];
  return {
    title: meta.title,
    description: meta.blurb,
    alternates: { canonical: `/packages/${category}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!isCategory(category)) notFound();

  const meta = categoryMeta[category];
  const list = getByCategory(category);

  return (
    <>
      <PageHero
        crumb={meta.title}
        photoId={meta.photoId}
        title={meta.title}
        subtitle={meta.blurb}
      />

      <section className="py-16 sm:py-24">
        <Container>
          {/* Category switcher */}
          <div className="mb-12 flex flex-wrap justify-center gap-2.5">
            {categories.map((c) => (
              <Link
                key={c}
                href={`/packages/${c}`}
                aria-current={c === category ? "page" : undefined}
                className={cn(
                  "rounded-full px-6 py-3 text-[0.93rem] font-semibold transition-all",
                  c === category
                    ? "grad-red text-white shadow-brand-red"
                    : "border border-line bg-white text-muted hover:text-red",
                )}
              >
                {categoryMeta[c].label}
              </Link>
            ))}
          </div>

          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 3) * 0.1}>
                <PackageCard pkg={p} priority={i < 3} />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <CTABand
        title="Don't see your dream destination?"
        text="We build fully custom itineraries. Tell us where you'd like to go and we'll do the rest."
        photoId="photo-1452421822248-d4c2b47f0c81"
      >
        <Button href="/plan-my-trip" arrow>
          Request a Custom Trip
        </Button>
      </CTABand>
    </>
  );
}
