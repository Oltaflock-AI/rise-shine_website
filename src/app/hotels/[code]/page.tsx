import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Star,
  MapPin,
  Clock,
  Utensils,
  ShieldCheck,
  TriangleAlert,
  BedDouble,
  Check,
  Images as ImagesIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { BookButton } from "@/components/ui/BookButton";
import { searchHotels, type HotelRoomOffer } from "@/lib/tbo-hotel";
import { hotelInfo } from "@/lib/tbo-hotel-static";
import { cityByCode } from "@/lib/hotel-city-search";
import { site } from "@/data/site";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hotel Rooms & Rates",
  robots: { index: false },
};

/** TBO cancel-policy dates arrive as "DD-MM-YYYY hh:mm:ss" → ISO for formatDate. */
function tboDateToISO(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "Free cancellation before X" when the rate's first charge window starts later. */
function freeCancelUntil(room: HotelRoomOffer): string | null {
  const policies = room.cancelPolicies;
  if (!policies?.length || !room.isRefundable) return null;
  if ((policies[0]?.charge ?? 0) > 0) return null;
  const firstCharged = policies.find((p) => (p.charge ?? 0) > 0);
  const iso = firstCharged ? tboDateToISO(firstCharged.fromDate) : "";
  return iso ? formatDate(iso) : null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

/** TBO facility strings are messy — keep short, display-worthy ones. */
function curateFacilities(list: string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of list) {
    const t = f.trim();
    const key = t.toLowerCase();
    if (t.length < 3 || t.length > 34 || seen.has(key)) continue;
    seen.add(key);
    out.push(t[0].toUpperCase() + t.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

export default async function HotelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { code } = await params;
  const sp = await searchParams;

  const rooms = Math.min(6, Math.max(1, parseInt(sp.rooms || "1", 10) || 1));
  const adultsPerRoom = Math.min(8, Math.max(1, parseInt(sp.adults || "2", 10) || 2));
  const childAges = (sp.ages || "")
    .split(",")
    .map((a) => parseInt(a, 10))
    .filter((a) => Number.isFinite(a) && a >= 1 && a <= 17)
    .slice(0, Math.min(4, Math.max(0, parseInt(sp.children || "0", 10) || 0)));

  const backToResults = sp.city
    ? `/hotels?city=${encodeURIComponent(sp.city)}&checkIn=${sp.checkIn ?? ""}&checkOut=${sp.checkOut ?? ""}&rooms=${rooms}&adults=${adultsPerRoom}${childAges.length ? `&children=${childAges.length}&ages=${childAges.join(",")}` : ""}`
    : "/hotels";
  const cityLabel = (sp.city && cityByCode(sp.city)?.label) || "";

  // Static content is independent of dates; rooms need a stay window.
  const hasStay = Boolean(sp.checkIn && sp.checkOut && sp.checkOut > sp.checkIn!);
  const [info, res] = await Promise.all([
    hotelInfo(code),
    hasStay
      ? searchHotels({
          checkInISO: sp.checkIn!,
          checkOutISO: sp.checkOut!,
          hotelCodes: [code],
          nationality: "IN",
          rooms: Array.from({ length: rooms }, () => ({
            adults: adultsPerRoom,
            childrenAges: childAges.length ? childAges : undefined,
          })),
        })
      : Promise.resolve(null),
  ]);

  const offer = res?.ok ? res.offers.find((o) => o.hotelCode === code) ?? res.offers[0] : undefined;
  const roomOptions = offer?.rooms ?? [];
  const nights = hasStay ? nightsBetween(sp.checkIn!, sp.checkOut!) : 1;
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: offer?.currency || "INR",
    maximumFractionDigits: 0,
  });
  const name = info?.name || `Hotel ${code}`;
  const gallery = info?.images?.slice(0, 5) ?? [];
  const facilities = curateFacilities(info?.facilities ?? []);

  return (
    <>
      <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
        <Container>
          <nav aria-label="Breadcrumb" className="mb-3 text-[0.85rem] font-medium text-white/70">
            <Link href="/" className="hover:text-white">Home</Link> /{" "}
            <Link href={backToResults} className="hover:text-white">Hotels{cityLabel ? ` · ${cityLabel}` : ""}</Link> /{" "}
            <span className="text-white">{name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="h-md text-white">{name}</h1>
            {(info?.rating ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400" aria-label={`${info!.rating} star`}>
                {Array.from({ length: info!.rating }).map((_, i) => (
                  <Star key={i} size={16} fill="currentColor" strokeWidth={0} aria-hidden />
                ))}
              </span>
            )}
          </div>
          {info?.address && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-white/80">
              <MapPin size={14} aria-hidden /> {info.address}
            </p>
          )}
          {hasStay && (
            <p className="mt-1 text-[0.9rem] text-white/70">
              {formatDate(sp.checkIn)} → {formatDate(sp.checkOut)} · {nights} night{nights > 1 ? "s" : ""} · {rooms} room{rooms > 1 ? "s" : ""} ·{" "}
              {adultsPerRoom + childAges.length} guest{adultsPerRoom + childAges.length > 1 ? "s" : ""}/room
            </p>
          )}
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          {/* ── gallery ── */}
          {gallery.length > 0 && (
            <div className="mb-10 grid gap-2 overflow-hidden rounded-brand-lg sm:grid-cols-4 sm:grid-rows-2">
              {gallery.map((src, i) => (
                <div
                  key={i}
                  className={cn(
                    "relative h-40 bg-cream sm:h-auto",
                    i === 0 ? "sm:col-span-2 sm:row-span-2 sm:min-h-[21rem]" : "sm:min-h-[10rem]",
                    i > 0 && "hidden sm:block",
                  )}
                >
                  <Image
                    src={src}
                    alt={`${name} photo ${i + 1}`}
                    fill
                    sizes={i === 0 ? "(min-width: 640px) 50vw, 100vw" : "25vw"}
                    className="object-cover"
                    priority={i === 0}
                  />
                  {i === gallery.length - 1 && (info?.images?.length ?? 0) > gallery.length && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[0.75rem] font-semibold text-white">
                      <ImagesIcon size={13} aria-hidden /> {info!.images.length} photos
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {/* ── rooms ── */}
            <div>
              <h2 className="mb-4 text-[1.2rem] font-bold text-ink">
                {hasStay ? `Room options (${roomOptions.length})` : "Room options"}
              </h2>

              {!hasStay ? (
                <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
                  <BedDouble className="mx-auto mb-3 text-red" aria-hidden />
                  <p className="mb-4 text-muted">Pick your dates to see live room rates.</p>
                  <Button href={backToResults} arrow>Choose dates</Button>
                </div>
              ) : !roomOptions.length ? (
                <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
                  <TriangleAlert className="mx-auto mb-3 text-red" aria-hidden />
                  <p className="mb-1 font-semibold text-ink">No rooms available for these dates</p>
                  <p className="mb-4 text-muted">
                    Try different dates, or send us the stay and we&apos;ll check with the hotel directly.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button href={`/plan-my-trip?service=Hotel&destination=${encodeURIComponent(cityLabel || name)}`} arrow>
                      Enquire
                    </Button>
                    <Button href={site.phone.whatsappHref} variant="light">WhatsApp Us</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {roomOptions.map((room, i) => {
                    const freeUntil = freeCancelUntil(room);
                    const query: Record<string, string> = {
                      bookingCode: room.bookingCode,
                      hotel: name,
                      city: cityLabel,
                      checkIn: sp.checkIn!,
                      checkOut: sp.checkOut!,
                      nights: String(nights),
                      rooms: String(rooms),
                      adults: String(adultsPerRoom),
                      ...(childAges.length ? { children: String(childAges.length), ages: childAges.join(",") } : {}),
                      fare: String(room.totalFare),
                      currency: offer?.currency || "INR",
                      room: room.name,
                      meal: room.mealType ?? "",
                      refundable: room.isRefundable ? "1" : "0",
                    };
                    return (
                      <div
                        key={`${room.bookingCode}-${i}`}
                        className="flex flex-col gap-3 rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <h3 className="text-[0.98rem] font-bold text-ink">{room.name || "Room"}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem]">
                            <span className="inline-flex items-center gap-1 text-muted">
                              <Utensils size={13} className="text-red" aria-hidden />
                              {(room.mealType || "Room Only").replace(/_/g, " ")}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                room.isRefundable ? "font-medium text-green-700" : "text-muted",
                              )}
                            >
                              <ShieldCheck size={13} aria-hidden />
                              {freeUntil
                                ? `Free cancellation before ${freeUntil}`
                                : room.isRefundable
                                  ? "Refundable"
                                  : "Non-refundable"}
                            </span>
                          </div>
                          {room.inclusion && (
                            <p className="mt-1 truncate text-[0.78rem] text-muted/90">
                              {room.inclusion.toLowerCase().replace(/,/g, " · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-none items-end justify-between gap-4 sm:flex-col sm:items-end">
                          <div className="text-right">
                            <div className="text-[1.15rem] font-extrabold text-navy">{money.format(room.totalFare)}</div>
                            <div className="text-[0.72rem] text-muted">
                              total · {nights} night{nights > 1 ? "s" : ""} · incl. taxes
                            </div>
                          </div>
                          <BookButton query={query} path="/hotels/checkout" label="Book" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── about ── */}
            <aside className="h-fit space-y-6">
              {(info?.checkInTime || info?.checkOutTime) && (
                <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
                  <h3 className="mb-2 text-[0.95rem] font-bold text-ink">Check-in / Check-out</h3>
                  <p className="flex items-center gap-2 text-[0.88rem] text-muted">
                    <Clock size={14} className="text-red" aria-hidden />
                    {info.checkInTime ?? "—"} / {info.checkOutTime ?? "—"}
                  </p>
                </div>
              )}

              {facilities.length > 0 && (
                <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
                  <h3 className="mb-3 text-[0.95rem] font-bold text-ink">Amenities</h3>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {facilities.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[0.83rem] text-muted">
                        <Check size={14} className="mt-0.5 flex-none text-red" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {info?.description && (
                <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
                  <h3 className="mb-2 text-[0.95rem] font-bold text-ink">About this property</h3>
                  {/* Supplier text can embed HTML — strip to plain text, never inject. */}
                  <p className="line-clamp-[14] whitespace-pre-line text-[0.85rem] leading-relaxed text-muted">
                    {info.description
                      .replace(/<br\s*\/?>/gi, "\n")
                      .replace(/<\/p>/gi, "\n\n")
                      .replace(/<[^>]+>/g, "")
                      .replace(/&amp;/g, "&")
                      .replace(/&nbsp;/g, " ")
                      .trim()}
                  </p>
                </div>
              )}
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
