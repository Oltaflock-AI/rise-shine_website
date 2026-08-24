import { MapPin, Navigation, Landmark, Phone, Globe } from "lucide-react";

/**
 * Where the hotel is, and what is near it.
 *
 * Both facts are already in TBO's HotelDetails and were going unused: `Map`
 * carries "lat|long", and `Attractions` is an ordered list of 20-odd nearby
 * landmarks. A hotel page that shows neither leaves the guest to guess whether
 * "Deira" is anywhere near the things they came to see.
 *
 * The map is OpenStreetMap's embed, which needs no API key and therefore no
 * key on the client — the Google Maps embed would mean shipping a browser-
 * visible key and restricting it, for the same picture. "Get directions" still
 * hands off to Google Maps, which is what people actually navigate with.
 */
export function HotelLocation({
  name,
  address,
  lat,
  lng,
  attractions,
  phone,
  website,
}: {
  name: string;
  address?: string;
  lat?: string;
  lng?: string;
  attractions?: string[];
  /** The hotel's own line and site — TBO sends both; useful once booked. */
  phone?: string;
  website?: string;
}) {
  const la = Number(lat);
  const ln = Number(lng);
  const hasPoint =
    Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0);
  const near = (attractions ?? []).slice(0, 8);
  if (!hasPoint && !near.length && !address && !phone && !website) return null;

  // A small box around the point — OSM's embed frames by bounding box, not zoom.
  const d = 0.008;
  const bbox = `${ln - d}%2C${la - d}%2C${ln + d}%2C${la + d}`;
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la}%2C${ln}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${la}%2C${ln}`;

  return (
    <div className="overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3.5">
        <div className="min-w-0">
          <h3 className="text-[1rem] font-bold text-ink">Location</h3>
          {address && (
            <p className="mt-1 flex items-start gap-1.5 text-[0.88rem] text-muted">
              <MapPin
                size={14}
                className="mt-0.5 flex-none text-red"
                aria-hidden
              />
              {address}
            </p>
          )}
        </div>
        {hasPoint && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-full border-[1.6px] border-line px-4 text-[0.85rem] font-semibold text-ink transition-colors hover:border-red hover:text-red"
          >
            <Navigation size={14} aria-hidden /> Get directions
          </a>
        )}
      </div>

      {hasPoint && (
        <iframe
          src={osm}
          title={`Map showing ${name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-64 w-full border-0 border-y border-line"
        />
      )}

      {(phone || website) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-5 pt-4 text-[0.88rem]">
          {phone && (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-red"
            >
              <Phone size={13} className="text-red" aria-hidden />
              {phone}
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-red"
            >
              <Globe size={13} className="text-red" aria-hidden />
              Hotel website
            </a>
          )}
        </div>
      )}

      {near.length > 0 && (
        <div className="p-5 pt-4">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-meta font-bold uppercase tracking-[0.08em] text-red">
            <Landmark size={13} aria-hidden /> What&apos;s nearby
          </h4>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {near.map((a) => (
              <li
                key={a}
                className="flex items-start gap-2 text-[0.88rem] text-ink"
              >
                <span
                  className="mt-[0.45rem] h-1.5 w-1.5 flex-none rounded-full bg-red"
                  aria-hidden
                />
                {a}
              </li>
            ))}
          </ul>
          {(attractions?.length ?? 0) > near.length && (
            <p className="mt-2.5 text-meta text-muted">
              …and {attractions!.length - near.length} more within reach.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
