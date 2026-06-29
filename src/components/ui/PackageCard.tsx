import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Calendar, MapPin, Star } from "lucide-react";
import {
  categoryMeta,
  formatPrice,
  photo,
  type Package,
} from "@/data/packages";

/** Itinerary card. Links to the enquiry form (detail pages slot in later). */
export function PackageCard({
  pkg,
  priority = false,
}: {
  pkg: Package;
  priority?: boolean;
}) {
  return (
    <Link
      href="/plan-my-trip"
      className="group flex flex-col overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-brand-lg"
    >
      <div className="relative aspect-[4/3.2] overflow-hidden">
        <Image
          src={photo(pkg.photoId, 800)}
          alt={`${pkg.title} — ${pkg.location}`}
          fill
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          priority={priority}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-navy/55 via-transparent to-transparent"
          aria-hidden
        />
        <span className="grad-red absolute left-4 top-4 rounded-full px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
          {categoryMeta[pkg.category].label}
        </span>
        <span className="absolute bottom-3.5 left-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white drop-shadow">
          <Calendar size={14} strokeWidth={2.2} aria-hidden /> {pkg.days} Days
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-6">
        <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-muted">
          <MapPin size={14} className="text-red" aria-hidden /> {pkg.location}
        </span>
        <h3 className="text-[1.3rem] transition-colors group-hover:text-red">
          {pkg.title}
        </h3>
        <p className="text-[0.9rem] text-muted">{pkg.description}</p>

        <div className="mt-auto flex items-center justify-between border-t border-dashed border-line pt-4">
          <div>
            <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
              From
            </div>
            <div className="text-[1.3rem] font-bold tabular-nums text-navy">
              {formatPrice(pkg.priceFrom)}{" "}
              <span className="text-[0.7rem] font-normal text-muted">
                / person
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-cream-2 px-3 py-1.5 text-[0.85rem] font-bold tabular-nums text-navy">
            <Star size={14} className="fill-red text-red" strokeWidth={0} />{" "}
            {pkg.rating.toFixed(1)}
          </span>
        </div>

        <span className="inline-flex items-center gap-1.5 pt-1 text-[0.82rem] font-semibold text-red opacity-0 transition-all duration-300 group-hover:opacity-100">
          Plan this trip
          <ArrowRight
            size={15}
            strokeWidth={2.2}
            className="transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
