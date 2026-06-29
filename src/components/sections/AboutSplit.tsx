import Image from "next/image";
import { whyUs } from "@/data/content";
import { photo } from "@/data/packages";
import { Container } from "../ui/Container";
import { SectionHeading } from "./SectionHeading";
import { Feature } from "../ui/Feature";
import { Button } from "../ui/Button";
import { Reveal } from "../ui/Reveal";

export function AboutSplit() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <Reveal className="relative">
            <div
              className="grad-red absolute -right-5 -top-5 -z-10 hidden aspect-square w-3/5 animate-morph opacity-90 lg:block"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-brand-lg shadow-brand-lg">
              <Image
                src={photo("photo-1488646953014-85cb44e25828", 900)}
                alt="Two travellers planning a journey with a map"
                width={900}
                height={1050}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-3 flex items-center gap-3.5 rounded-2xl bg-white p-4 pr-6 shadow-brand sm:-left-6">
              <span className="grad-red grid h-12 w-12 place-items-center rounded-xl text-lg font-extrabold text-white">
                15+
              </span>
              <div>
                <div className="text-[1.2rem] font-bold leading-tight text-navy">
                  Years
                </div>
                <div className="text-[0.78rem] text-muted">
                  of happy travellers
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <SectionHeading
              eyebrow="Why Rise & Shine"
              title={
                <>
                  It&apos;s the{" "}
                  <span className="text-script text-[1.12em] text-red">
                    little things
                  </span>{" "}
                  that make a trip unforgettable.
                </>
              }
            />
            <p className="mt-4 text-ink-soft">
              We know every detail matters. That&apos;s why we&apos;re diligent
              about the people behind your trip — the drivers, the guides, the
              partners on the ground — and flexible and creative in how we design
              each itinerary. You get a holiday that fits you, not a package off
              a shelf.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {whyUs.map((f) => (
                <Feature key={f.title} {...f} />
              ))}
            </div>
            <Button href="/about" variant="navy" arrow className="mt-9">
              Our Story
            </Button>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
