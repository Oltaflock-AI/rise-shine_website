import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { CTABand } from "@/components/sections/CTABand";
import { Container } from "@/components/ui/Container";
import { InfoCard } from "@/components/ui/InfoCard";
import { Feature } from "@/components/ui/Feature";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { howItWorks, services } from "@/data/services";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Hotels, flights, car rentals, cruises, custom tours, visa & passport help and travel insurance — every travel need handled by one Ahmedabad team.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        crumb="Services"
        photoId="photo-1436491865332-7a61a109cc05"
        title="One agency, every travel need"
        subtitle="From the first flight booking to the last hotel check-out — and the visa paperwork in between — we handle it all."
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <Reveal key={s.title} delay={(i % 3) * 0.1}>
                <InfoCard icon={s.icon} title={s.title}>
                  {s.description}
                </InfoCard>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-cream-2 py-20 sm:py-28">
        <Container>
          <SectionHeading
            center
            eyebrow="How it works"
            title="Planning made effortless"
            className="mb-12"
          />
          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
            {howItWorks.map((s, i) => (
              <Reveal key={s.step} delay={(i % 2) * 0.1}>
                <Feature
                  number={s.step}
                  title={s.title}
                  description={s.description}
                />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <CTABand
        title="Need a specific service?"
        text="Hotels, flights, visas or a full holiday — send us your requirement and we'll get right back to you."
        photoId="photo-1476514525535-07fb3b4ae5f1"
      >
        <Button href="/plan-my-trip" arrow>
          Send Enquiry
        </Button>
        <Button href={site.phone.landlineHref} variant="light">
          Call Us
        </Button>
      </CTABand>
    </>
  );
}
