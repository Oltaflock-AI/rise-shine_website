import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/sections/PageHero";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { StatsBand } from "@/components/sections/StatsBand";
import { Accreditations } from "@/components/sections/Accreditations";
import { CTABand } from "@/components/sections/CTABand";
import { Container } from "@/components/ui/Container";
import { Feature } from "@/components/ui/Feature";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { aboutStats, values } from "@/data/content";
import { photo } from "@/data/packages";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Rise & Shine Travels listens first, then plans. Since 2009 we've crafted flexible, creative and detail-obsessed journeys from Ahmedabad to the world.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        crumb="About"
        photoId="photo-1469474968028-56623f02e42e"
        title={
          <>
            We listen first.
            <br />
            Then we plan.
          </>
        }
        subtitle="Rise & Shine always works thinking of you — your needs, but above all, your expectations."
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
            <Reveal className="relative">
              <div
                className="grad-red absolute -left-5 -top-5 -z-10 hidden aspect-square w-3/5 animate-morph opacity-90 lg:block"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-brand-lg shadow-brand-lg">
                <Image
                  src={photo("photo-1507525428034-b723cf961d3e", 900)}
                  alt="Travellers watching the sunrise on a quiet beach"
                  width={900}
                  height={1050}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-3 flex items-center gap-3.5 rounded-2xl bg-white p-4 pr-6 shadow-brand sm:-right-6">
                <span className="grad-red grid h-12 w-12 place-items-center rounded-xl text-lg font-extrabold text-white">
                  15+
                </span>
                <div>
                  <div className="text-[1.2rem] font-bold leading-tight text-navy">
                    Years
                  </div>
                  <div className="text-[0.78rem] text-muted">
                    of crafting journeys
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <SectionHeading
                eyebrow="Our story"
                title={
                  <>
                    Every detail is important — so we care for the{" "}
                    <span className="text-script text-[1.12em] text-red">
                      little things
                    </span>
                    .
                  </>
                }
              />
              <p className="mt-4 text-ink-soft">
                &ldquo;Rise &amp; Shine Co.&rdquo; always works thinking of you, of
                your needs, but above all, your expectations. We know that every
                detail is important, and for this reason we make our best effort
                to care for all those little things that will always make the
                difference, so that your trip will be exceptional.
              </p>
              <p className="mt-4 text-ink-soft">
                Our service is flexible and creative in the design of itineraries
                — and we&apos;re diligent in selecting our transport personnel,
                guides and everyone involved in the operation. That&apos;s the
                Rise &amp; Shine difference.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="bg-cream-2 py-20 sm:py-28">
        <Container>
          <SectionHeading
            center
            eyebrow="What guides us"
            title="The values behind every itinerary"
            className="mb-12"
          />
          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={(i % 2) * 0.1}>
                <Feature {...v} />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <StatsBand stats={aboutStats} />
      <Accreditations />

      <CTABand
        title="Let's craft your next journey together."
        text="Share your dream destination and we'll handle the rest — flights, stays, sightseeing and more."
        photoId="photo-1476514525535-07fb3b4ae5f1"
      >
        <Button href="/plan-my-trip" arrow>
          Start Planning
        </Button>
        <Button href="/packages" variant="light">
          Browse Packages
        </Button>
      </CTABand>
    </>
  );
}
