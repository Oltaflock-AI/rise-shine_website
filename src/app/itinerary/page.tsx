import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

/**
 * Reserved route for the upcoming AI itinerary generator (future work).
 * Friendly "coming soon" placeholder for now — noindex, not in the nav.
 */
export const metadata: Metadata = {
  title: "AI Itinerary Generator",
  description:
    "An AI-powered trip planner from Rise & Shine Travels is on the way.",
  robots: { index: false, follow: true },
};

export default function ItineraryPage() {
  return (
    <>
      <PageHero
        crumb="Itinerary Generator"
        photoId="photo-1488085061387-422e29b40080"
        title={
          <>
            Itinerary generator{" "}
            <span className="text-script text-[0.6em] text-silver">
              coming soon
            </span>
          </>
        }
        subtitle="An AI-powered trip planner is on the way. In the meantime, our travel experts will craft your itinerary by hand."
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="h-md">Built by hand today, by AI tomorrow</h2>
            <p className="mt-4 text-ink-soft">
              We&apos;re building a smart itinerary generator to design your
              perfect trip in seconds. Until it launches, tell us what you&apos;re
              dreaming of and our team will put together a tailor-made plan — free
              of charge.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <Button href="/plan-my-trip" arrow>
                Plan My Trip
              </Button>
              <Button href="/packages" variant="ghost">
                Browse Packages
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
