import { homeServices } from "@/data/services";
import { Container } from "../ui/Container";
import { SectionHeading } from "./SectionHeading";
import { ServiceCard } from "../ui/ServiceCard";
import { Reveal } from "../ui/Reveal";

export function ServicesOverview() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            eyebrow="One desk, everything handled"
            title={
              <>
                From the first flight to the
                <br className="hidden sm:block" /> last sunset — we&apos;ve got
                it.
              </>
            }
            className="max-w-xl"
          />
          <p className="max-w-md text-ink-soft">
            No more juggling ten tabs and three agents. Hotels, tickets,
            transfers, visas and the whole itinerary, all from one team that
            picks up the phone.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {homeServices.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 0.1}>
              <ServiceCard {...s} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
