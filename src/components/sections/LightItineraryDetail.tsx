import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  MessageCircle,
  Route,
  ShieldCheck,
  Sparkles,
  Sliders,
  X,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { CTABand } from "@/components/sections/CTABand";
import { site } from "@/data/site";
import { waHref } from "@/lib/whatsapp";
import type { LightItinerary } from "@/data/itineraries/types";

const CATEGORY_LABEL = { domestic: "Domestic", international: "International" };

// Standard terms for library (sightseeing) itineraries — airfare is quoted
// separately, matching the agency's day-wise library boilerplate.
const INCLUSIONS = [
  "Accommodation on twin / double sharing with daily breakfast",
  "Private or shared transfers as per the itinerary",
  "Sightseeing as listed in the day-by-day plan",
  "Applicable permits where included and on-tour assistance",
];
const EXCLUSIONS = [
  "Airfare / train fare unless quoted separately",
  "Visa and travel insurance (assistance available)",
  "Lunch, personal expenses, optional activities, guide & camera fees",
  "GST / TCS and anything not listed under inclusions",
];

export function LightItineraryDetail({ it }: { it: LightItinerary }) {
  const isDomestic = it.category === "domestic";
  const durationLabel =
    it.minNights === it.maxNights
      ? `${it.minNights} nights`
      : `${it.minNights}–${it.maxNights} nights`;
  const enquiryHref = `/plan-my-trip?destination=${encodeURIComponent(it.name)}&journey=${
    isDomestic ? "Domestic" : "International"
  }`;
  const waText = `Hi Rise & Shine! I'm interested in a ${it.name} holiday (${durationLabel}). Please share options and a quote.`;
  const waLink = waHref(waText);

  const quickFacts = [
    { icon: CalendarDays, label: "Duration", value: `${durationLabel} (customisable)` },
    { icon: Route, label: "Highlights", value: it.region },
    { icon: Sliders, label: "Format", value: "Flexible day-wise plan" },
    {
      icon: ShieldCheck,
      label: "Visa",
      value: isDomestic ? "No visa required" : "Visa assistance included",
    },
  ];

  return (
    <>
      {/* Hero — photo if provided, else branded gradient */}
      <section className="relative overflow-hidden bg-navy pb-14 pt-32 text-white sm:pb-16 sm:pt-40">
        {it.heroImage ? (
          <Image
            src={it.heroImage}
            alt={it.name}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-30"
          />
        ) : (
          <div
            className="pointer-events-none absolute -bottom-1/4 -left-[10%] h-[560px] w-[560px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(226,30,38,0.5) 0%, rgba(141,25,28,0.3) 35%, rgba(8,50,73,0) 70%)",
            }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 90% at 8% 120%, rgba(226,30,38,0.35), transparent 55%), linear-gradient(110deg, rgba(8,50,73,0.9), rgba(8,50,73,0.5))",
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
            <Link href={`/packages/${it.category}`} className="hover:text-white">
              {CATEGORY_LABEL[it.category]}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-white">{it.name}</span>
          </nav>

          <span className="grad-red mb-4 inline-block rounded-full px-3 py-1.5 text-meta font-bold uppercase tracking-wide">
            {CATEGORY_LABEL[it.category]} · {durationLabel}
          </span>
          <h1 className="h-lg max-w-3xl text-white">{it.name}</h1>
          <p className="mt-4 max-w-xl text-lg text-white/85">{it.tagline}</p>

          <div className="mt-8 flex flex-wrap gap-3.5">
            <Button href={enquiryHref} arrow>
              Enquire About This Trip
            </Button>
            {waLink && (
              <Button href={waLink} variant="light">
                Chat on WhatsApp
              </Button>
            )}
          </div>
        </Container>
      </section>

      {/* Quick facts */}
      <section className="border-b border-line bg-white">
        <Container>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 py-8 lg:grid-cols-4">
            {quickFacts.map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <span className="grad-red mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-xl text-white">
                  <f.icon size={18} strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-meta font-bold uppercase tracking-wide text-muted">
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

      {/* Body */}
      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-14">
            <div className="min-w-0">
              <div className="mb-4 flex items-center gap-2.5">
                <Sparkles size={20} className="text-red" aria-hidden />
                <h2 className="h-md">Suggested day-by-day plan</h2>
              </div>
              <p className="mb-8 max-w-2xl text-ink-soft">
                A sample {it.maxNights}-night route. We tailor the length ({durationLabel}),
                pace, hotels and inclusions to you, just tell us your dates and group.
              </p>

              <div className="relative space-y-6 border-l-2 border-line pl-8">
                {it.itinerary.map((d) => (
                  <Reveal key={d.day} className="relative">
                    <span className="grad-red absolute -left-[41px] grid h-8 w-8 place-items-center rounded-full text-meta font-bold text-white ring-4 ring-cream">
                      {d.day}
                    </span>
                    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
                      <h3 className="text-meta font-bold uppercase tracking-wide text-red">
                        Day {d.day}
                      </h3>
                      <p className="mt-1 text-[0.95rem] text-ink-soft">{d.text}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/* Inclusions / exclusions */}
              <div className="mt-14 grid gap-6 sm:grid-cols-2">
                <div className="rounded-brand-lg border border-line bg-white p-6 shadow-brand-sm">
                  <h3 className="mb-4 text-[1.05rem] font-bold text-ink">
                    What&apos;s included
                  </h3>
                  <ul className="space-y-2.5">
                    {INCLUSIONS.map((t) => (
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
                    {EXCLUSIONS.map((t) => (
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
                  <div className="text-meta font-bold uppercase tracking-wide text-muted">
                    {CATEGORY_LABEL[it.category]} · {durationLabel}
                  </div>
                  <div className="mt-1 text-[1.2rem] font-bold leading-tight text-ink">
                    {it.name}
                  </div>
                  <div className="mt-1 text-[0.85rem] text-muted">{it.region}</div>

                  <div className="my-5 border-t border-dashed border-line pt-5">
                    <div className="text-meta font-semibold uppercase tracking-wide text-muted">
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
                    Enquire About This Trip
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
          <div className="truncate text-[0.9rem] font-bold text-ink">{it.name}</div>
          <div className="text-meta text-muted">
            {durationLabel} · On enquiry
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
        title={`Make ${it.name} your own`}
        text="Pick your dates and duration, choose your hotels, and we'll build the full quote around you."
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
