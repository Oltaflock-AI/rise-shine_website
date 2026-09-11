import Image from "next/image";
import { Clock, ExternalLink, MapPin, Navigation, PenLine, Phone } from "lucide-react";
import { site } from "@/data/site";
import type { GooglePlace } from "@/lib/google-place";
import { buttonClass } from "./Button";
import { OpenNow } from "./OpenNow";
import { Stars } from "./Stars";

/**
 * The Google Business Profile listing, rendered like a Maps knowledge card:
 * cover photo, name, rating, live open/closed, address, phone, hours and the
 * Directions / Write-a-review links. Given `null` (no key, API down) it falls
 * back to the NAP in `data/site.ts` so /contact never loses the panel.
 */
export function GooglePlaceCard({ place }: { place: GooglePlace | null }) {
  const name = place?.name ?? site.name;
  const rating = place?.rating ?? site.reviews.rating;
  const count = place?.count ?? site.reviews.count;
  const address = place?.address ?? site.address.full;
  const phone = place?.phone ?? {
    display: site.phone.landlineDisplay,
    href: site.phone.landlineHref,
  };
  const placeUrl = place?.links.place ?? site.reviews.url;
  const directions =
    place?.links.directions ??
    `https://www.google.com/maps/dir/?api=1&destination=${site.address.geo.lat},${site.address.geo.lng}`;
  const ratingText = rating.toFixed(1);
  const ratingLabel = `Rated ${ratingText} out of 5 from ${count} Google reviews`;

  return (
    <aside
      aria-label={`${name} on Google`}
      className="flex h-full flex-col overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand"
    >
      {place?.photo && (
        <div className="relative aspect-[16/9] w-full bg-cream-3">
          <Image
            src={place.photo.url}
            alt={`${name} office`}
            fill
            sizes="(min-width: 1024px) 380px, 100vw"
            className="object-cover"
          />
          {place.photo.credit && (
            <span className="absolute bottom-1.5 right-2 rounded bg-black/45 px-1.5 py-0.5 text-meta text-white/90">
              Photo: {place.photo.credit}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <p className="mb-1 text-meta font-semibold uppercase tracking-[0.14em] text-muted">
            Google listing
          </p>
          <h3 className="text-[1.3rem] leading-tight">{name}</h3>
          {place?.category && (
            <p className="mt-0.5 text-[0.88rem] text-muted">{place.category}</p>
          )}
        </div>

        <a
          href={placeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${ratingLabel}. Read them on Google`}
          className="inline-flex items-center gap-2.5 text-[0.9rem] text-muted hover:underline"
        >
          <b className="text-[1.05rem] font-semibold text-ink">{ratingText}</b>
          <Stars className="text-red" size={15} label={ratingLabel} />
          <span>({count} reviews)</span>
        </a>

        {place?.status === "CLOSED_PERMANENTLY" ? (
          <p className="text-[0.88rem] font-semibold text-red">Permanently closed</p>
        ) : place?.status === "CLOSED_TEMPORARILY" ? (
          <p className="text-[0.88rem] font-semibold text-red">Temporarily closed</p>
        ) : place?.hours ? (
          <OpenNow periods={place.hours.periods} />
        ) : null}

        <ul className="flex flex-col gap-3 text-[0.9rem] leading-relaxed text-ink-soft">
          <li className="flex gap-3">
            <MapPin size={18} className="mt-0.5 flex-none text-red" aria-hidden />
            <span>{address}</span>
          </li>
          <li className="flex gap-3">
            <Phone size={18} className="mt-0.5 flex-none text-red" aria-hidden />
            <a href={phone.href} className="font-semibold text-ink hover:text-red">
              {phone.display}
            </a>
          </li>
          <li className="flex gap-3">
            <Clock size={18} className="mt-0.5 flex-none text-red" aria-hidden />
            {place?.hours && place.hours.weekdays.length > 0 ? (
              <details className="group min-w-0 flex-1">
                <summary className="cursor-pointer list-none font-semibold text-ink hover:text-red [&::-webkit-details-marker]:hidden">
                  Opening hours
                  <span className="ml-1 font-normal text-muted group-open:hidden">
                    · show
                  </span>
                </summary>
                <ul className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.85rem]">
                  {place.hours.weekdays.map((line) => {
                    const [day, ...rest] = line.split(": ");
                    return (
                      <li key={day} className="contents">
                        <span className="text-muted">{day}</span>
                        <span>{rest.join(": ")}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : (
              <span>{site.hours}</span>
            )}
          </li>
        </ul>

        <div className="mt-auto flex flex-wrap gap-2.5 pt-2">
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: "primary", size: "sm" })}
          >
            <Navigation size={16} aria-hidden />
            Directions
          </a>
          {place?.links.review && (
            <a
              href={place.links.review}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              <PenLine size={16} aria-hidden />
              Write a review
            </a>
          )}
        </div>

        <a
          href={placeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-muted hover:text-red"
        >
          View on Google Maps
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>
    </aside>
  );
}
