import { Hero } from "@/components/sections/Hero";
import { SearchBar } from "@/components/sections/SearchBar";
import { RecentSearches } from "@/components/ui/RecentSearches";
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
import { getGoogleReviews } from "@/lib/google-reviews";

export default async function HomePage() {
  // Slim, serializable slice for the client-side Hero badge; Testimonials
  // fetches the full feed itself (the underlying GETs are memoized per render).
  const live = await getGoogleReviews();
  const reviews = live
    ? { rating: live.rating, count: live.count, url: live.url }
    : undefined;
  return (
    <>
      <Hero reviews={reviews} />
      <SearchBar />
      <div className="mx-auto mb-2 max-w-6xl px-4 sm:px-6">
        <RecentSearches className="pt-6" />
      </div>
      {/* Packages first — the "offers" strip the OTA layout puts under the widget. */}
      <FeaturedItineraries />
      <Marquee />
      <ServicesOverview />
      <AboutSplit />
      <StatsBand />
      <Testimonials />
      <Accreditations soft />
      <CTABand
        title="Tell us where you'd love to wake up next."
        text="Share your dream destination and we'll craft a personalised itinerary and quote, free of charge and no pressure."
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
