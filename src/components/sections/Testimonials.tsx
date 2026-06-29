import { Quote } from "lucide-react";
import { testimonials } from "@/data/testimonials";
import { Container } from "../ui/Container";
import { SectionHeading } from "./SectionHeading";
import { Stars } from "../ui/Stars";
import { Reveal } from "../ui/Reveal";

export function Testimonials() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow="Postcards from our travellers"
          title="Don't take our word for it"
          className="mb-12"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 0.1}>
              <figure className="flex h-full flex-col gap-4 rounded-brand-lg border border-line bg-white p-8 shadow-brand-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-brand">
                <Quote className="h-8 w-8 text-red" aria-hidden />
                <Stars
                  className="text-red"
                  label={`${t.rating} out of 5 stars`}
                />
                <blockquote className="text-[0.96rem] text-ink-soft">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3 pt-2">
                  <span className="grad-navy grid h-12 w-12 flex-none place-items-center rounded-full font-bold text-white">
                    {t.initials}
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">
                      {t.name}
                    </span>
                    <span className="block text-[0.78rem] text-muted">
                      {t.trip} · {t.date}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
