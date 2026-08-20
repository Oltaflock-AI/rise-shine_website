import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  MapPin,
  MessageCircle,
  Plane,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { CTABand } from "@/components/sections/CTABand";
import { LightItineraryDetail } from "@/components/sections/LightItineraryDetail";
import { LiveFare } from "@/components/ui/LiveFare";
import { site } from "@/data/site";
import { waHref } from "@/lib/whatsapp";
import { CATALOG_PACKAGES, PACKAGE_LIST, isCatalogPackage } from "@/data/catalog";
import type { CatalogPackage, PackageCategory } from "@/data/catalog/types";
import { getLightItinerary, lightItineraries } from "@/data/itineraries";

const CATEGORY_LABEL: Record<PackageCategory, string> = {
  domestic: "Domestic",
  international: "International",
  cruise: "Cruise",
};

const STANDARD_INCLUSIONS = [
  "Airfare / transport from Ahmedabad as per the itinerary (indicative, confirmed on quote)",
  "Hotels on twin-sharing with daily breakfast (meal plan as chosen)",
  "Airport, station and sightseeing transfers by private vehicle",
  "Sightseeing as listed in the day-by-day plan",
  "Rise & Shine on-call support through your journey",
];

const STANDARD_EXCLUSIONS = [
  "Visa fees and travel insurance (assistance available)",
  "Monument, activity and optional-tour entry fees unless specified",
  "Meals not mentioned, personal expenses, tips and laundry",
  "Anything not listed under inclusions",
];

export function generateStaticParams() {
  return [
    ...PACKAGE_LIST.map((p) => ({ category: p.category, slug: p.key })),
    ...lightItineraries.map((i) => ({ category: i.category, slug: i.slug })),
  ];
}

function resolve(
  category: string,
  slug: string,
): CatalogPackage | null {
  if (!isCatalogPackage(slug)) return null;
  const pkg = CATALOG_PACKAGES[slug];
  return pkg.category === category ? pkg : null;
}

/** Light (library) itinerary matching category + slug, else null. */
function resolveLight(category: string, slug: string) {
  const it = getLightItinerary(slug);
  return it && it.category === category ? it : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { category, slug } = await params;
  const pkg = resolve(category, slug);
  if (pkg) {
    const title = `${pkg.tourName} · ${pkg.durationNights}N/${pkg.durationDays}D`;
    const description = `${pkg.tagline}. ${pkg.durationDays}-day ${CATEGORY_LABEL[pkg.category]} package covering ${pkg.routeSummary}, planned from Ahmedabad by Rise & Shine Travels.`;
    return {
      title,
      description,
      alternates: { canonical: `/packages/${pkg.category}/${pkg.key}` },
      openGraph: {
        title: `${pkg.tourName} · Rise & Shine Travels`,
        description,
        images: [{ url: pkg.heroImageUrl }],
      },
    };
  }
  const it = resolveLight(category, slug);
  if (it) {
    const label = it.category === "domestic" ? "Domestic" : "International";
    const description = `${it.tagline} A customisable ${it.minNights}–${it.maxNights}-night ${label} itinerary covering ${it.region}, planned from Ahmedabad by Rise & Shine Travels.`;
    return {
      title: `${it.name} Tour Packages`,
      description,
      alternates: { canonical: `/packages/${it.category}/${it.slug}` },
    };
  }
  return {};
}

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;

  const it = resolveLight(category, slug);
  if (it) return <LightItineraryDetail it={it} />;

  const pkg = resolve(category, slug);
  if (!pkg) notFound();

  const enquiryHref = `/plan-my-trip?package=${encodeURIComponent(pkg.key)}`;
  const waText = `Hi Rise & Shine! I'm interested in the ${pkg.tourName} (${pkg.durationNights}N/${pkg.durationDays}D) package. Please share a quote and availability.`;
  const waLink = waHref(waText);
  const isDomestic = pkg.category === "domestic";
  const showVisa = !!pkg.visa && !isDomestic;

  const quickFacts = [
    { icon: CalendarDays, label: "Duration", value: `${pkg.durationNights} nights / ${pkg.durationDays} days` },
    { icon: Route, label: "Route", value: pkg.routeSummary },
    { icon: Plane, label: "Flights", value: pkg.flightRouteLabel },
    {
      icon: ShieldCheck,
      label: "Visa",
      value: isDomestic ? "No visa required" : "Visa assistance included",
    },
  ];

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-navy pb-14 pt-32 text-white sm:pb-16 sm:pt-40">
        <Image
          src={pkg.heroImageUrl}
          alt={pkg.title}
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-30"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 90% at 8% 120%, rgba(226,30,38,0.4), transparent 55%), linear-gradient(110deg, rgba(8,50,73,0.95), rgba(8,50,73,0.55))",
          }}
          aria-hidden
        />
        <Container className="relative">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-1.5 text-[0.85rem] font-medium text-white/70"
          >
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <span aria-hidden>/</span>
            <Link href="/packages" className="hover:text-white">
              Packages
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/packages/${pkg.category}`} className="hover:text-white">
              {CATEGORY_LABEL[pkg.category]}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-white">{pkg.name}</span>
          </nav>

          <span className="grad-red mb-4 inline-block rounded-full px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wide">
            {CATEGORY_LABEL[pkg.category]} · {pkg.durationNights}N / {pkg.durationDays}D
          </span>
          <h1 className="h-lg max-w-3xl text-white">{pkg.title}</h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">{pkg.tagline}</p>

          <div className="mt-8 flex flex-wrap gap-3.5">
            <Button href={enquiryHref} arrow>
              Enquire About This Package
            </Button>
            {waLink && (
              <Button href={waLink} variant="light">
                Chat on WhatsApp
              </Button>
            )}
          </div>
        </Container>
      </section>

      {/* ---------- Quick facts ---------- */}
      <section className="border-b border-line bg-white">
        <Container>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 py-8 lg:grid-cols-4">
            {quickFacts.map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <span className="grad-red mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-xl text-white">
                  <f.icon size={18} strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                    {f.label}
                  </dt>
                  <dd className="text-[0.95rem] font-semibold text-ink">
                    {f.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ---------- Body ---------- */}
      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-14">
            {/* Main column */}
            <div className="min-w-0">
              {/* Day-by-day */}
              <div className="mb-4 flex items-center gap-2.5">
                <Sparkles size={20} className="text-red" aria-hidden />
                <h2 className="h-md">Day-by-day itinerary</h2>
              </div>
              <div className="relative mt-8 space-y-8 border-l-2 border-line pl-8">
                {pkg.narrativeDays.map((d) => (
                  <Reveal key={d.dayIndex} className="relative">
                    <span className="grad-red absolute -left-[41px] grid h-8 w-8 place-items-center rounded-full text-[0.8rem] font-bold text-white ring-4 ring-cream">
                      {d.dayIndex + 1}
                    </span>
                    <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="text-[1.15rem] font-bold text-ink">
                          Day {d.dayIndex + 1}: {d.headline}
                        </h3>
                        <span className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-muted">
                          <MapPin size={13} className="text-red" aria-hidden />
                          {d.cityLabel}
                        </span>
                      </div>
                      <ul className="mt-4 space-y-3.5">
                        {d.activities.map((a, ai) => (
                          <li key={ai} className="flex gap-3.5">
                            <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-red/70" aria-hidden />
                            <div>
                              <p className="text-[0.95rem] font-semibold text-ink">
                                {a.period}: {a.title}
                              </p>
                              <p className="text-[0.9rem] text-ink-soft">
                                {a.detail}
                              </p>
                              {a.place && (
                                <a
                                  href={a.place.mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[0.8rem] font-medium text-red hover:underline"
                                >
                                  <MapPin size={12} aria-hidden /> {a.place.name}
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {d.overnight && d.overnight !== "Departure" && (
                        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-cream-2 px-3 py-1.5 text-[0.8rem] font-medium text-navy">
                          <BedDouble size={13} className="text-red" aria-hidden />
                          Overnight: {d.overnight}
                        </p>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Flights */}
              <div className="mt-14">
                <div className="mb-5 flex items-center gap-2.5">
                  <Plane size={20} className="text-red" aria-hidden />
                  <h2 className="h-md">Flights</h2>
                </div>
                {pkg.arrivalAirport && (
                  <LiveFare to={pkg.arrivalAirport} nights={pkg.durationNights} />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {[pkg.flights.outbound, pkg.flights.inbound].map((leg) => (
                    <div
                      key={leg.label}
                      className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm"
                    >
                      <div className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                        {leg.label}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold text-ink">
                        {leg.route}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.85rem] text-ink-soft">
                        <span>{leg.dep} → {leg.arr}</span>
                        <span>{leg.dur}</span>
                        <span>{leg.stops}</span>
                      </div>
                      <div className="mt-1 text-[0.82rem] text-muted">
                        {pkg.flights.carrier}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[0.82rem] text-muted">
                  {pkg.flights.fareNote}
                </p>
              </div>

              {/* Hotels */}
              <div className="mt-14">
                <div className="mb-5 flex items-center gap-2.5">
                  <BedDouble size={20} className="text-red" aria-hidden />
                  <h2 className="h-md">Where you&apos;ll stay</h2>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand-sm">
                  {pkg.hotels.map((h, hi) => (
                    <li key={hi} className="flex items-center justify-between gap-4 p-5">
                      <div>
                        <div className="font-semibold text-ink">{h.name}</div>
                        <div className="text-[0.85rem] text-muted">{h.area}</div>
                      </div>
                      <div className="flex flex-none items-center gap-4 text-[0.82rem] text-muted">
                        <span aria-label={`${h.stars} star`} className="text-red">
                          {"★".repeat(h.stars)}
                        </span>
                        <span>{h.nights} {h.nights === 1 ? "night" : "nights"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.82rem] text-muted">
                  Representative hotels, similar or better confirmed with your quote.
                </p>
              </div>

              {/* Good to know / intel */}
              <div className="mt-14">
                <div className="mb-5 flex items-center gap-2.5">
                  <Sparkles size={20} className="text-red" aria-hidden />
                  <h2 className="h-md">Good to know</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <IntelCard tone="do" title="Do" items={pkg.intel.do} />
                  <IntelCard tone="miss" title="Don't miss" items={pkg.intel.miss} />
                  <IntelCard tone="skip" title="Skip / avoid" items={pkg.intel.skip} />
                </div>
                {pkg.intel.diet && (
                  <p className="mt-4 text-[0.85rem] text-ink-soft">
                    <span className="font-semibold text-ink">Food: </span>
                    {pkg.intel.diet}
                  </p>
                )}
              </div>

              {/* Visa */}
              {showVisa && pkg.visa && (
                <div className="mt-14">
                  <div className="mb-5 flex items-center gap-2.5">
                    <ShieldCheck size={20} className="text-red" aria-hidden />
                    <h2 className="h-md">Visa</h2>
                  </div>
                  <dl className="grid gap-x-6 gap-y-3 rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm sm:grid-cols-2">
                    {[
                      ["Type", pkg.visa.type],
                      ["Validity", pkg.visa.validity],
                      ["Processing", pkg.visa.processing],
                      ["Fee", pkg.visa.fee],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                          {k}
                        </dt>
                        <dd className="text-[0.9rem] text-ink">{v}</dd>
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <dt className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                        Documents
                      </dt>
                      <dd className="text-[0.9rem] text-ink">{pkg.visa.docs}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Inclusions / exclusions */}
              <div className="mt-14 grid gap-6 sm:grid-cols-2">
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                  <h3 className="mb-4 text-[1.05rem] font-bold text-ink">
                    What&apos;s included
                  </h3>
                  <ul className="space-y-2.5">
                    {STANDARD_INCLUSIONS.map((t) => (
                      <li key={t} className="flex gap-2.5 text-[0.9rem] text-ink-soft">
                        <Check size={17} className="mt-0.5 flex-none text-green-600" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                  <h3 className="mb-4 text-[1.05rem] font-bold text-ink">
                    Not included
                  </h3>
                  <ul className="space-y-2.5">
                    {STANDARD_EXCLUSIONS.map((t) => (
                      <li key={t} className="flex gap-2.5 text-[0.9rem] text-ink-soft">
                        <X size={17} className="mt-0.5 flex-none text-muted" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Sticky enquiry aside */}
            <aside className="lg:relative">
              <div className="lg:sticky lg:top-28">
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand">
                  <div className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">
                    {CATEGORY_LABEL[pkg.category]} · {pkg.durationNights}N / {pkg.durationDays}D
                  </div>
                  <div className="mt-1 text-[1.2rem] font-bold leading-tight text-ink">
                    {pkg.tourName}
                  </div>
                  <div className="mt-1 text-[0.85rem] text-muted">
                    {pkg.routeSummary}
                  </div>

                  <div className="my-5 border-t border-dashed border-line pt-5">
                    <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
                      Starting price
                    </div>
                    <div className="text-[1.5rem] font-extrabold text-navy">
                      On enquiry
                    </div>
                    <p className="mt-1 text-[0.82rem] text-muted">
                      Tell us your dates and travellers for a free, tailored quote.
                    </p>
                  </div>

                  <Button href={enquiryHref} arrow fullWidth>
                    Enquire About This Package
                  </Button>
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center justify-center gap-2 rounded-full border border-line py-3 text-[0.9rem] font-semibold text-navy transition-colors hover:border-red hover:text-red"
                    >
                      <MessageCircle size={16} aria-hidden /> Chat on WhatsApp
                    </a>
                  )}
                  <a
                    href={site.phone.landlineHref}
                    className="mt-3 block text-center text-[0.85rem] text-muted hover:text-red"
                  >
                    or call {site.phone.landlineDisplay}
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {/* Mobile sticky enquire bar */}
      <div className="sticky inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white/95 px-4 py-3 pr-[84px] shadow-[0_-6px_24px_rgba(8,50,73,0.1)] backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.9rem] font-bold text-ink">
            {pkg.tourName}
          </div>
          <div className="text-[0.75rem] text-muted">
            {pkg.durationNights}N / {pkg.durationDays}D · On enquiry
          </div>
        </div>
        <Link
          href={enquiryHref}
          className="grad-red inline-flex flex-none items-center gap-1.5 rounded-full px-5 py-3 text-[0.9rem] font-semibold text-white shadow-brand-red"
        >
          Enquire <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
        </Link>
      </div>

      <CTABand
        title="Want to tweak this trip?"
        text="Change the dates, add cities or upgrade the hotels. We build every itinerary around you."
        photoId="photo-1452421822248-d4c2b47f0c81"
      >
        <Button href={enquiryHref} arrow>
          Get a Free Quote
        </Button>
        <Button href="/packages" variant="light">
          Browse More Packages
        </Button>
      </CTABand>
    </>
  );
}

function IntelCard({
  tone,
  title,
  items,
}: {
  tone: "do" | "miss" | "skip";
  title: string;
  items: string[];
}) {
  if (!items?.length) return null;
  const accent =
    tone === "skip" ? "text-muted" : tone === "miss" ? "text-red" : "text-green-600";
  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
      <h3 className={`mb-3 text-[0.95rem] font-bold ${accent}`}>{title}</h3>
      <ul className="space-y-2 text-[0.86rem] text-ink-soft">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${tone === "skip" ? "bg-muted" : tone === "miss" ? "bg-red" : "bg-green-600"}`} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
