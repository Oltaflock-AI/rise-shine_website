/**
 * Itinerary / package catalogue.
 *
 * PLACEHOLDER DATA — seeded with representative trips so the pages are fully
 * designed and shippable. The client will supply their real custom itineraries
 * later; replacing or adding them is a single edit to the `packages` array
 * below (no component or layout changes needed).
 */

export type PackageCategory = "domestic" | "international" | "cruise";

export type Package = {
  slug: string;
  title: string;
  category: PackageCategory;
  location: string;
  days: number;
  /** "From" price per person, in INR (number so it can be formatted/compared). */
  priceFrom: number;
  rating: number;
  description: string;
  /** Unsplash photo id — full URL built via `photo()`. */
  photoId: string;
  featured?: boolean;
};

/** Build an optimized Unsplash URL from a photo id. */
export function photo(id: string, w = 800): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

export const categoryMeta: Record<
  PackageCategory,
  { label: string; title: string; blurb: string; photoId: string }
> = {
  domestic: {
    label: "Domestic",
    title: "Domestic Escapes",
    blurb:
      "Discover the beauty of India — backwaters, palaces, peaks and beaches, all fully managed and priced right.",
    photoId: "photo-1506905925346-21bda4d32df4",
  },
  international: {
    label: "International",
    title: "International Holidays",
    blurb:
      "Island honeymoons to alpine adventures — international getaways with flights, stays and sightseeing handled.",
    photoId: "photo-1514282401047-d79a71a590e8",
  },
  cruise: {
    label: "Cruise",
    title: "Cruise Voyages",
    blurb:
      "The right cabin, route and onboard package for an unforgettable holiday at sea.",
    photoId: "photo-1548574505-5e239809ee19",
  },
};

export const packages: Package[] = [
  // ---------------- Domestic ----------------
  {
    slug: "kerala-backwaters-hills",
    title: "Backwaters & Misty Hills",
    category: "domestic",
    location: "Kerala, India",
    days: 6,
    priceFrom: 28500,
    rating: 4.9,
    description:
      "Houseboat nights on the backwaters, Munnar's tea country and the old soul of Kochi.",
    photoId: "photo-1602216056096-3b40cc0c9944",
    featured: true,
  },
  {
    slug: "royal-rajasthan",
    title: "Royal Rajasthan",
    category: "domestic",
    location: "Rajasthan, India",
    days: 7,
    priceFrom: 32900,
    rating: 4.8,
    description: "Forts, palaces and desert nights under a canopy of stars.",
    photoId: "photo-1477587458883-47145ed94245",
  },
  {
    slug: "valleys-of-kashmir",
    title: "Valleys of Kashmir",
    category: "domestic",
    location: "Kashmir, India",
    days: 5,
    priceFrom: 26500,
    rating: 5.0,
    description: "Dal Lake houseboats and the green meadows of Gulmarg.",
    photoId: "photo-1506905925346-21bda4d32df4",
  },
  {
    slug: "goa-beach-break",
    title: "Goa Beach Break",
    category: "domestic",
    location: "Goa, India",
    days: 4,
    priceFrom: 18900,
    rating: 4.7,
    description: "Sun, sand and sundowners along the Konkan coast.",
    photoId: "photo-1512343879784-a960bf40e7f2",
  },
  {
    slug: "shimla-manali",
    title: "Shimla & Manali",
    category: "domestic",
    location: "Himachal Pradesh, India",
    days: 6,
    priceFrom: 24500,
    rating: 4.8,
    description: "Pine forests, snow points and scenic mountain drives.",
    photoId: "photo-1476514525535-07fb3b4ae5f1",
  },
  {
    slug: "andaman-islands",
    title: "Andaman Islands",
    category: "domestic",
    location: "Andaman, India",
    days: 5,
    priceFrom: 34900,
    rating: 4.9,
    description: "Radhanagar beach, scuba diving and easy island hopping.",
    photoId: "photo-1507525428034-b723cf961d3e",
  },

  // ---------------- International ----------------
  {
    slug: "maldives-overwater-honeymoon",
    title: "Overwater Honeymoon",
    category: "international",
    location: "Maldives",
    days: 5,
    priceFrom: 89900,
    rating: 5.0,
    description: "A private villa over a turquoise lagoon — flights included.",
    photoId: "photo-1514282401047-d79a71a590e8",
    featured: true,
  },
  {
    slug: "bali-island-magic",
    title: "Bali Island Magic",
    category: "international",
    location: "Bali, Indonesia",
    days: 6,
    priceFrom: 64500,
    rating: 4.9,
    description: "Ubud rice terraces and serene private-pool villas.",
    photoId: "photo-1537996194471-e657df975ab4",
  },
  {
    slug: "dazzling-dubai",
    title: "Dazzling Dubai",
    category: "international",
    location: "Dubai, UAE",
    days: 5,
    priceFrom: 58900,
    rating: 4.8,
    description: "Desert safaris, the Burj Khalifa and dhow-cruise dinners.",
    photoId: "photo-1512453979798-5ea266f8880c",
  },
  {
    slug: "magical-mauritius",
    title: "Magical Mauritius",
    category: "international",
    location: "Mauritius",
    days: 7,
    priceFrom: 78000,
    rating: 5.0,
    description: "Lagoon resorts, catamaran days and scenic island drives.",
    photoId: "photo-1544550581-5f7ceaf7f992",
  },
  {
    slug: "thailand-explorer",
    title: "Thailand Explorer",
    category: "international",
    location: "Thailand",
    days: 6,
    priceFrom: 52500,
    rating: 4.7,
    description: "The buzz of Bangkok and the beaches of Phi Phi.",
    photoId: "photo-1528181304800-259b08848526",
  },
  {
    slug: "swiss-and-paris",
    title: "Swiss & Paris",
    category: "international",
    location: "Switzerland · France",
    days: 9,
    priceFrom: 165000,
    rating: 4.9,
    description: "Alpine rail journeys, the Jungfrau and a Paris finale.",
    photoId: "photo-1506905925346-21bda4d32df4",
  },

  // ---------------- Cruise ----------------
  {
    slug: "southeast-asia-cruise",
    title: "Southeast Asia at Sea",
    category: "cruise",
    location: "Singapore · Malaysia",
    days: 7,
    priceFrom: 74000,
    rating: 4.8,
    description: "A balcony cabin, all meals and a new port every morning.",
    photoId: "photo-1548574505-5e239809ee19",
    featured: true,
  },
  {
    slug: "mediterranean-voyage",
    title: "Mediterranean Voyage",
    category: "cruise",
    location: "Italy · France · Spain",
    days: 8,
    priceFrom: 128000,
    rating: 4.9,
    description: "Italy, France and Spain — all-inclusive at sea.",
    photoId: "photo-1530841377377-3ff06c0ca713",
  },
  {
    slug: "caribbean-islands",
    title: "Caribbean Islands",
    category: "cruise",
    location: "Caribbean",
    days: 9,
    priceFrom: 152000,
    rating: 5.0,
    description: "Turquoise waters, suite living and white-sand stops.",
    photoId: "photo-1599640842225-85d111c60e6b",
  },
];

export const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const formatPrice = (n: number) => priceFormatter.format(n);

export const getByCategory = (c: PackageCategory) =>
  packages.filter((p) => p.category === c);

export const featuredPackages = packages.filter((p) => p.featured);
