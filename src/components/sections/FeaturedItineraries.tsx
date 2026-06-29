import { featuredPackages } from "@/data/packages";
import { Container } from "../ui/Container";
import { SectionHeading } from "./SectionHeading";
import { PackageCard } from "../ui/PackageCard";
import { Button } from "../ui/Button";
import { Reveal } from "../ui/Reveal";

export function FeaturedItineraries() {
  return (
    <section className="bg-cream-2 py-20 sm:py-28">
      <Container>
        <div className="mb-12 flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Travellers love these"
            title="Journeys worth waking up for"
          />
          <Button
            href="/packages"
            variant="ghost"
            arrow
            className="hidden flex-none sm:inline-flex"
          >
            All packages
          </Button>
        </div>
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {featuredPackages.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 0.1}>
              <PackageCard pkg={p} priority={i === 0} />
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center sm:hidden">
          <Button href="/packages" variant="ghost" arrow>
            All packages
          </Button>
        </div>
      </Container>
    </section>
  );
}
