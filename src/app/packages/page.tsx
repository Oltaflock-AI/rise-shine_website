import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PackageCard } from "@/components/ui/PackageCard";
import {
  categoryMeta,
  getByCategory,
  type PackageCategory,
} from "@/data/packages";

export const metadata: Metadata = {
  title: "Holiday Packages",
  description:
    "Curated domestic, international and cruise holiday packages — flexible, fully managed and priced right. Browse Rise & Shine Travels' itineraries.",
  alternates: { canonical: "/packages" },
};

const order: PackageCategory[] = ["domestic", "international", "cruise"];

export default function PackagesPage() {
  return (
    <>
      <PageHero
        crumb="Packages"
        photoId="photo-1500835556837-99ac94a94552"
        title="Find your perfect holiday"
        subtitle="Curated itineraries across India and the world — flexible, fully managed and priced right."
      />

      <section className="py-20 sm:py-28">
        <Container>
          {order.map((cat, idx) => {
            const meta = categoryMeta[cat];
            const list = getByCategory(cat).slice(0, 3);
            return (
              <div key={cat} className={idx > 0 ? "mt-20" : ""}>
                <div className="mb-8 flex items-end justify-between gap-6">
                  <div>
                    <Eyebrow>{meta.label}</Eyebrow>
                    <h2 className="h-md">{meta.title}</h2>
                  </div>
                  <Button
                    href={`/packages/${cat}`}
                    variant="ghost"
                    arrow
                    className="hidden flex-none sm:inline-flex"
                  >
                    See all
                  </Button>
                </div>
                <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p, i) => (
                    <Reveal key={p.slug} delay={(i % 3) * 0.1}>
                      <PackageCard pkg={p} priority={idx === 0 && i === 0} />
                    </Reveal>
                  ))}
                </div>
                <div className="mt-8 text-center sm:hidden">
                  <Button href={`/packages/${cat}`} variant="ghost" arrow>
                    See all {meta.label}
                  </Button>
                </div>
              </div>
            );
          })}
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
