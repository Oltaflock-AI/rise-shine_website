import { Hero } from "@/components/sections/Hero";
import { SearchBar } from "@/components/sections/SearchBar";
import { Marquee } from "@/components/sections/Marquee";
import { ServicesOverview } from "@/components/sections/ServicesOverview";
import { FeaturedItineraries } from "@/components/sections/FeaturedItineraries";
import { AboutSplit } from "@/components/sections/AboutSplit";
import { StatsBand } from "@/components/sections/StatsBand";
import { Testimonials } from "@/components/sections/Testimonials";
import { Accreditations } from "@/components/sections/Accreditations";
import { CTABand } from "@/components/sections/CTABand";
import { Button } from "@/components/ui/Button";
import { site } from "@/data/site";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SearchBar />
      <Marquee />
      <ServicesOverview />
      <FeaturedItineraries />
      <AboutSplit />
      <StatsBand />
      <Testimonials />
      <Accreditations soft />
      <CTABand
        title="Tell us where you'd love to wake up next."
        text="Share your dream destination and we'll craft a personalised itinerary and quote — free of charge, no pressure."
        photoId="photo-1530841377377-3ff06c0ca713"
      >
        <Button href="/plan-my-trip" arrow>
          Plan My Trip
        </Button>
        <Button href={site.phone.landlineHref} variant="light">
          Call {site.phone.landlineDisplay}
        </Button>
      </CTABand>
    </>
  );
}
