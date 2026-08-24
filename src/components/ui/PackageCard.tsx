import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import { categoryMeta, type Package } from "@/data/packages";

/** Itinerary card. Links to the package detail page. */
export function PackageCard({
  pkg,
  priority = false,
}: {
  pkg: Package;
  priority?: boolean;
}) {
  return (
    <Link
      href={pkg.href}
      className="group flex h-full flex-col overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-brand-lg"
    >
      <div className="relative aspect-[4/3.2] overflow-hidden">
        {pkg.heroImage ? (
          <Image
            src={pkg.heroImage}
            alt={`${pkg.title}, ${pkg.location}`}
            fill
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            priority={priority}
          />
        ) : (
          <div
            className="grad-navy absolute inset-0 flex items-center justify-center px-6 text-center transition-transform duration-700 ease-out group-hover:scale-105"
            aria-hidden
          >
            <span className="text-script text-[2.1rem] leading-tight text-white/95">
              {pkg.title}
            </span>
          </div>
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-navy/55 via-transparent to-transparent"
          aria-hidden
        />
        <span className="grad-red absolute left-4 top-4 rounded-full px-3 py-1.5 text-meta font-bold uppercase tracking-wide text-white">
          {categoryMeta[pkg.category].label}
        </span>
        <span className="absolute bottom-3.5 left-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white drop-shadow">
          <Calendar size={14} strokeWidth={2.2} aria-hidden />{" "}
          {pkg.durationLabel ?? `${pkg.nights}N / ${pkg.days}D`}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-6">
        <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-muted">
          <MapPin size={14} className="text-red" aria-hidden /> {pkg.location}
        </span>
        <h3 className="line-clamp-2 text-[1.3rem] transition-colors group-hover:text-red">
          {pkg.title}
        </h3>
        <p className="line-clamp-2 text-[0.9rem] text-muted">{pkg.description}</p>

        <div className="mt-auto flex items-center justify-between border-t border-dashed border-line pt-4">
          <span className="inline-flex flex-col leading-tight">
            <span className="text-meta font-semibold uppercase tracking-wide text-muted">
              Starting price
            </span>
            <span className="text-[1.05rem] font-bold text-navy">
              On enquiry
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-2 px-4 py-2 text-[0.85rem] font-semibold text-navy transition-colors group-hover:bg-red group-hover:text-white">
            View itinerary
            <ArrowRight
              size={15}
              strokeWidth={2.2}
              className="transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
