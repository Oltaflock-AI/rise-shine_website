"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { photo } from "@/data/packages";
import { site } from "@/data/site";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { GoogleReviews } from "../ui/GoogleReviews";
import { cn } from "@/lib/cn";

const heroPhotos = [
  "photo-1528181304800-259b08848526",
  "photo-1514282401047-d79a71a590e8",
  "photo-1512453979798-5ea266f8880c",
];

export type HeroReviews = { rating: number; count: number; url: string };

export function Hero({ reviews }: { reviews?: HeroReviews }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setActive((a) => (a + 1) % heroPhotos.length),
      6000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative flex min-h-dvh items-center overflow-hidden bg-navy text-white">
      <div className="absolute inset-0">
        {heroPhotos.map((p, i) => (
          <Image
            key={p}
            src={photo(p, 1920)}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className={cn(
              "object-cover transition-opacity duration-[1600ms] ease-out",
              i === active ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>

      {/* brand wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 12% 110%, rgba(226,30,38,0.5) 0%, rgba(141,25,28,0.3) 28%, rgba(8,50,73,0) 60%), linear-gradient(105deg, rgba(8,50,73,0.92) 0%, rgba(8,50,73,0.6) 42%, rgba(8,50,73,0.12) 78%)",
        }}
        aria-hidden
      />
      {/* rising-sun glow */}
      <div
        className="pointer-events-none absolute -bottom-[22%] -left-[8%] h-[560px] w-[560px] animate-sunrise rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(226,30,38,0.8) 0%, rgba(141,25,28,0.45) 35%, rgba(8,50,73,0) 70%)",
          filter: "blur(6px)",
        }}
        aria-hidden
      />

      <Container className="relative z-10 w-full">
        <div className="max-w-2xl pt-24">
          <span className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-2 pl-2.5 pr-4 text-[0.82rem] font-medium backdrop-blur">
            <span className="grad-red rounded-full px-2.5 py-1 text-[0.72rem] font-bold tracking-wide">
              EST. {site.established}
            </span>
            Ahmedabad&apos;s trusted travel house
          </span>

          <h1 className="h-xl text-white">
            Every great journey
            <br />
            begins at{" "}
            <span className="text-script text-[1.12em] font-bold text-white">
              sunrise<span className="text-red">.</span>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg font-light text-white/85">
            We plan thinking of you: your pace, your people, your budget. And
            we sweat the little details so your holiday turns out exceptional.
            Domestic, international and at sea.
          </p>

          <div className="mt-9 flex flex-wrap gap-3.5">
            <Button href="/packages" arrow>
              Explore Journeys
            </Button>
            <Button href="/plan-my-trip" variant="light">
              Get a Free Itinerary
            </Button>
          </div>

          <div className="mt-12">
            <GoogleReviews tone="dark" {...reviews} />
          </div>
        </div>
      </Container>

      {/* slide dots */}
      <div className="absolute bottom-40 right-8 z-10 hidden flex-col gap-2.5 lg:flex">
        {heroPhotos.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full transition-all duration-300",
              i === active
                ? "h-6 w-2.5 bg-red"
                : "h-2.5 w-2.5 bg-white/40 hover:bg-white/70",
            )}
          />
        ))}
      </div>

      <div
        className="absolute bottom-36 left-6 z-10 hidden items-center gap-3 text-[0.72rem] uppercase tracking-[0.2em] text-white/60 [writing-mode:vertical-rl] lg:flex"
        aria-hidden
      >
        Scroll
        <span className="h-11 w-px bg-gradient-to-b from-white/60 to-transparent" />
      </div>
    </section>
  );
}
