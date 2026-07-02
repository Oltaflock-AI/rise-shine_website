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

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Founded in 2011 by Hardik Patel and Alpesh, Rise & Shine Travel is an Ahmedabad travel house that has planned journeys across 30+ countries for travellers of 55 nationalities.",
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
        subtitle="An Ahmedabad travel house since 2011, planning journeys people remember for travellers of every kind."
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
                  src="/brand/founders.webp"
                  alt="Rise & Shine Travel founders Hardik Patel and Alpesh"
                  width={820}
                  height={1459}
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="h-auto w-full object-cover"
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
                    Two founders who chose{" "}
                    <span className="text-script text-[1.12em] text-red">
                      travel
                    </span>{" "}
                    over the family business.
                  </>
                }
              />
              <p className="mt-4 text-ink-soft">
                Rise &amp; Shine Travel began in 2011, when Hardik Patel and
                Alpesh left a settled government construction business to build
                something around what they loved most: travel. What started as
                two friends planning trips has grown into one of
                Ahmedabad&apos;s most trusted travel houses.
              </p>
              <p className="mt-4 text-ink-soft">
                Fifteen-plus years on, we&apos;ve planned journeys across 30+
                countries for travellers of 55 nationalities, from families
                and honeymooners to corporate teams, with a 98% success rate
                on the visas we file. As members of ADTOI, IATTE, TAG, Gujarat
                Tourism, TAFI and BNI, we bring that experience to every
                itinerary.
              </p>
              <p className="mt-4 text-ink-soft">
                We still work the way we started: we listen first, plan around
                your pace and your people, and happily sweat the small details
                that turn a good trip into one you talk about for years.
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
        text="Share your dream destination and we'll handle the rest: flights, stays, sightseeing and more."
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
