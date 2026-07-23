import { Quote } from "lucide-react";
import { testimonials } from "@/data/testimonials";
import { getGoogleReviews } from "@/lib/google-reviews";
import { site } from "@/data/site";
import { Container } from "../ui/Container";
import { SectionHeading } from "./SectionHeading";
import { Stars } from "../ui/Stars";
import { GoogleReviews } from "../ui/GoogleReviews";
import { Reveal } from "../ui/Reveal";

type Card = {
  initials: string;
  name: string;
  meta: string;
  rating: number;
  quote: string;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export async function Testimonials() {
  const live = await getGoogleReviews();

  const cards: Card[] = live?.reviews.length
    ? live.reviews.slice(0, 3).map((r) => ({
        initials: initialsOf(r.author),
        name: r.author,
        meta: `Google review · ${r.relativeTime}`,
        rating: r.rating,
        quote: r.text,
      }))
    : testimonials.map((t) => ({
        initials: t.initials,
        name: t.name,
        meta: `${t.trip} · ${t.date}`,
        rating: t.rating,
        quote: t.quote,
      }));

  const rating = live?.rating ?? site.reviews.rating;

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          center
          eyebrow={`Rated ${rating.toFixed(1)} on Google`}
          title="Don't take our word for it"
          className="mb-6"
        />
        <div className="mb-14 flex justify-center">
          <GoogleReviews
            rating={live?.rating}
            count={live?.count}
            url={live?.url}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((t, i) => (
            <Reveal key={`${t.name}-${i}`} delay={(i % 3) * 0.1}>
              <figure className="flex h-full flex-col gap-4 rounded-brand-lg border border-line bg-white p-8 shadow-brand-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-brand">
                <Quote className="h-8 w-8 text-red" aria-hidden />
                <Stars
                  count={t.rating}
                  className="text-red"
                  label={`${t.rating} out of 5 stars`}
                />
                <blockquote className="line-clamp-6 text-[0.96rem] text-ink-soft">
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
                      {t.meta}
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
