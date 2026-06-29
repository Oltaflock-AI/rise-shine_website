import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { PlanTripForm } from "@/components/forms/PlanTripForm";

export const metadata: Metadata = {
  title: "Plan My Trip",
  description:
    "Tell us a few details and Rise & Shine Travels will craft a personalised itinerary and quote — completely free.",
  alternates: { canonical: "/plan-my-trip" },
};

export default async function PlanMyTripPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const sp = await searchParams;
  const destination = typeof sp.destination === "string" ? sp.destination : "";

  return (
    <>
      <PageHero
        crumb="Plan My Trip"
        photoId="photo-1452421822248-d4c2b47f0c81"
        title="Plan my trip"
        subtitle="Tell us a few details and we'll craft a personalised itinerary and quote — completely free."
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <PlanTripForm defaultDestination={destination} />
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}
