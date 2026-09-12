"use client";

import { site } from "@/data/site";
import { Container } from "../ui/Container";
import { GoogleReviews } from "../ui/GoogleReviews";

export type HeroReviews = { rating: number; count: number; url: string };

/**
 * The OTA layout the client chose on 12-Sep-2026 (over the photo-carousel hero
 * with the card laid on top — kept in `HeroPhoto.tsx`): a short navy band
 * carries one line of copy and the search card hangs off its bottom edge into
 * the cream page. The widget IS the hero — it has to be on screen at first
 * paint on a phone, which the old full-viewport hero never managed.
 */
export function Hero({ reviews }: { reviews?: HeroReviews }) {
  return (
    <section className="relative overflow-hidden bg-navy pb-24 pt-28 text-white sm:pb-28 sm:pt-32">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 80% at 0% 120%, rgba(226,30,38,0.55) 0%, rgba(141,25,28,0.25) 35%, rgba(8,50,73,0) 65%), radial-gradient(60% 70% at 100% 0%, rgba(255,255,255,0.08) 0%, rgba(8,50,73,0) 60%)",
        }}
        aria-hidden
      />
      <Container className="relative z-10 text-center">
        <span className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-2 pl-2.5 pr-4 text-[0.82rem] font-medium backdrop-blur">
          <span className="grad-red rounded-full px-2.5 py-1 text-meta font-bold tracking-wide">
            EST. {site.established}
          </span>
          Ahmedabad&apos;s trusted travel house
        </span>
        <h1 className="h-lg mx-auto max-w-3xl text-white">
          Book flights &amp; hotels at{" "}
          <span className="text-script text-[1.12em] font-bold text-white">
            sunrise<span className="text-red">.</span>
          </span>
        </h1>
        <div className="mt-4 flex justify-center">
          <GoogleReviews tone="dark" {...reviews} />
        </div>
      </Container>
    </section>
  );
}
