import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { RoomOptionsFallback } from "@/components/ui/SearchFallbacks";
import {
  Star,
  MapPin,
  Clock,
  Utensils,
  ShieldCheck,
  TriangleAlert,
  BedDouble,
  BadgePercent,
  CarFront,
  Check,
  Package,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { BookButton } from "@/components/ui/BookButton";
import { searchHotels, type HotelRoomOffer } from "@/lib/tbo-hotel";
import { RoomRateDetails } from "@/components/ui/RoomRateDetails";
import { HotelGallery } from "@/components/ui/HotelGallery";
import { RoomContentNote } from "@/components/ui/RoomContentNote";
import { HotelAmenities } from "@/components/ui/HotelAmenities";
import { HotelFees } from "@/components/ui/HotelFees";
import { HotelAbout } from "@/components/ui/HotelAbout";
import { HotelLocation } from "@/components/ui/HotelLocation";
import { matchRoomContent, type RoomContent } from "@/lib/hotel-room-match";
import {
  nationalityAllowed,
  nationalityLabel,
  normalizeNationality,
} from "@/data/nationalities";
import { hotelInfoWithRooms } from "@/lib/tbo-hotel-static";
import { cityByCode } from "@/lib/hotel-city-search";
import { site } from "@/data/site";
import { whatsappEnabled } from "@/lib/whatsapp";
import { formatDate } from "@/lib/format-date";
import { cancellationWindows } from "@/lib/hotel-cancellation";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hotel Rooms & Rates",
  robots: { index: false },
};

/**
 * "Free cancellation before X", but only while that window is still OPEN.
 *
 * TBO dates the first policy row from when the free window began, which for a
 * near-term stay is already in the past — the old check read row 0, saw a zero
 * charge and promised a refund the guest could no longer get.
 */
function freeCancelUntil(room: HotelRoomOffer): string | null {
  if (!room.isRefundable) return null;
  const active = cancellationWindows(room.cancelPolicies).find((w) => w.active);
  if (!active?.free || !active.untilISO) return null;
  return formatDate(active.untilISO) || null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
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
  const adultsPerRoom = Math.min(
    8,
    Math.max(1, parseInt(sp.adults || "2", 10) || 2),
  );
  const childAges = (sp.ages || "")
    .split(",")
    .map((a) => parseInt(a, 10))
    .filter((a) => Number.isFinite(a) && a >= 1 && a <= 17)
    .slice(0, Math.min(4, Math.max(0, parseInt(sp.children || "0", 10) || 0)));
  const nationality = normalizeNationality(sp.nat);

  const backToResults = sp.city
    ? `/hotels?city=${encodeURIComponent(sp.city)}&checkIn=${sp.checkIn ?? ""}&checkOut=${sp.checkOut ?? ""}&rooms=${rooms}&adults=${adultsPerRoom}${childAges.length ? `&children=${childAges.length}&ages=${childAges.join(",")}` : ""}&nat=${nationality}`
    : "/hotels";
  const cityLabel = (sp.city && cityByCode(sp.city)?.label) || "";

  // Static content is independent of dates; rooms need a stay window. Only the
  // static info is awaited here — the room search streams in behind Suspense.
  // TBO sells international stays to Indian nationality only — same rule the
  // results page applies, restated here because this page is linkable.
  const destinationCountry =
    (sp.city && cityByCode(sp.city)?.countryCode) || "";
  const natOk = nationalityAllowed(nationality, destinationCountry);
  const hasStay =
    Boolean(sp.checkIn && sp.checkOut && sp.checkOut > sp.checkIn!) && natOk;
  const info = await hotelInfoWithRooms(code);
  const nights = hasStay ? nightsBetween(sp.checkIn!, sp.checkOut!) : 1;
  const name = info?.name || `Hotel ${code}`;
  // Lead the mosaic with TBO's own primary photo, then the rest of the feed
  // minus that shot, so the best image is first and never appears twice.
  const galleryImages = info?.heroImage
    ? [
        info.heroImage,
        ...(info.images ?? []).filter((u) => u !== info.heroImage),
      ]
    : (info?.images ?? []);

  return (
    <>
      <section className="bg-navy pb-8 pt-28 text-white sm:pt-32">
        <Container>
          <nav
            aria-label="Breadcrumb"
            className="mb-3 text-[0.85rem] font-medium text-white/70"
          >
            <Link href="/" className="hover:text-white">
              Home
            </Link>{" "}
            /{" "}
            <Link href={backToResults} className="hover:text-white">
              Hotels{cityLabel ? ` · ${cityLabel}` : ""}
            </Link>{" "}
            / <span className="text-white">{name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="h-md text-white">{name}</h1>
            {(info?.rating ?? 0) > 0 && (
              <span
                className="flex items-center gap-0.5 text-amber-400"
                aria-label={`${info!.rating} star`}
              >
                {Array.from({ length: info!.rating }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden
                  />
                ))}
              </span>
            )}
          </div>
          {info?.address && (
            <p className="mt-2 flex items-start gap-1.5 text-[0.9rem] text-white/80">
              <MapPin size={14} className="mt-1 flex-none" aria-hidden />{" "}
              {info.address}
            </p>
          )}
          {hasStay && (
            <p className="mt-1 text-[0.9rem] text-white/70">
              {formatDate(sp.checkIn)} → {formatDate(sp.checkOut)} · {nights}{" "}
              night{nights > 1 ? "s" : ""} · {rooms} room{rooms > 1 ? "s" : ""}{" "}
              · {adultsPerRoom + childAges.length} guest
              {adultsPerRoom + childAges.length > 1 ? "s" : ""}/room
            </p>
          )}
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          {/* ── gallery ── */}
          <HotelGallery images={galleryImages} name={name} />

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {/* ── rooms ── */}
            <div>
              {!hasStay ? (
                <>
                  <h2 className="mb-4 text-[1.2rem] font-bold text-ink">
                    Room options
                  </h2>
                  <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
                    <BedDouble className="mx-auto mb-3 text-red" aria-hidden />
                    <p className="mb-4 text-muted">
                      {natOk
                        ? "Pick your dates to see live room rates."
                        : `Stays outside India are available to guests of Indian nationality — ${nationalityLabel(nationality)} can be booked for stays in India only.`}
                    </p>
                    <Button href={backToResults} arrow>
                      {natOk ? "Choose dates" : "Back to search"}
                    </Button>
                  </div>
                </>
              ) : (
                <Suspense
                  key={[
                    code,
                    sp.checkIn,
                    sp.checkOut,
                    rooms,
                    adultsPerRoom,
                    childAges.join(","),
                    nationality,
                  ].join("|")}
                  fallback={
                    <>
                      <h2 className="mb-4 text-[1.2rem] font-bold text-ink">
                        Room options
                      </h2>
                      <RoomOptionsFallback />
                    </>
                  }
                >
                  <RoomOptions
                    code={code}
                    name={name}
                    cityLabel={cityLabel}
                    countryCode={destinationCountry}
                    checkIn={sp.checkIn!}
                    checkOut={sp.checkOut!}
                    nights={nights}
                    rooms={rooms}
                    adultsPerRoom={adultsPerRoom}
                    childAges={childAges}
                    nationality={nationality}
                    roomContent={info?.rooms}
                  />
                </Suspense>
              )}
            </div>

            {/* ── about ── */}
            <aside className="h-fit space-y-6">
              {(info?.checkInTime || info?.checkOutTime) && (
                <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm">
                  <h3 className="mb-2 text-[0.95rem] font-bold text-ink">
                    Check-in / Check-out
                  </h3>
                  <p className="flex items-center gap-2 text-[0.88rem] text-muted">
                    <Clock size={14} className="text-red" aria-hidden />
                    {info.checkInTime ?? "—"} / {info.checkOutTime ?? "—"}
                  </p>
                </div>
              )}

              <HotelAmenities facilities={info?.facilities} />

              <HotelFees fees={info?.fees} />

              <HotelLocation
                name={name}
                address={info?.address}
                lat={info?.lat}
                lng={info?.lng}
                attractions={info?.attractions}
                phone={info?.phone}
                website={info?.website}
              />

              <HotelAbout description={info?.description} />
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}

/**
 * Live room list for one hotel — the slow TBO call, streamed behind Suspense so
 * the gallery/details above paint instantly.
 */
async function RoomOptions({
  code,
  name,
  cityLabel,
  countryCode,
  checkIn,
  checkOut,
  nights,
  rooms,
  adultsPerRoom,
  childAges,
  nationality,
  roomContent,
}: {
  code: string;
  name: string;
  cityLabel: string;
  /** Destination country (ISO-2) — carried to checkout to drive PAN rules. */
  countryCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adultsPerRoom: number;
  childAges: number[];
  /** Guest nationality searched with — Book must carry the same value. */
  nationality: string;
  /** Static per-room descriptions, matched to each live rate by name. */
  roomContent?: RoomContent[];
}) {
  // Single hotel, so ask for the DETAILED response: room amenities and
  // promotions ride along with the rates (portal checkpoints 18 and 24), and
  // Filters.NoOfRooms is omitted so the FULL room feed comes back (checkpoint 11).
  const res = await searchHotels({
    checkInISO: checkIn,
    checkOutISO: checkOut,
    hotelCodes: [code],
    nationality,
    rooms: Array.from({ length: rooms }, () => ({
      adults: adultsPerRoom,
      childrenAges: childAges.length ? childAges : undefined,
    })),
    detailed: true,
  });
  const offer = res.ok
    ? (res.offers.find((o) => o.hotelCode === code) ?? res.offers[0])
    : undefined;
  const roomOptions = offer?.rooms ?? [];
  // TBO portal checkpoint 16: the exact TotalFare, unrounded.
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: offer?.currency || "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <>
      <h2 className="mb-4 text-[1.2rem] font-bold text-ink">
        Room options ({roomOptions.length})
      </h2>

      {!roomOptions.length ? (
        <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
          <TriangleAlert className="mx-auto mb-3 text-red" aria-hidden />
          <p className="mb-1 font-semibold text-ink">
            No rooms available for these dates
          </p>
          <p className="mb-4 text-muted">
            Try different dates, or send us the stay and we&apos;ll check with
            the hotel directly.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              href={`/plan-my-trip?service=Hotel&destination=${encodeURIComponent(cityLabel || name)}`}
              arrow
            >
              Enquire
            </Button>
            {whatsappEnabled && (
              <Button href={site.phone.whatsappHref} variant="light">
                WhatsApp Us
              </Button>
            )}
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
              checkIn,
              checkOut,
              nights: String(nights),
              rooms: String(rooms),
              adults: String(adultsPerRoom),
              ...(childAges.length
                ? {
                    children: String(childAges.length),
                    ages: childAges.join(","),
                  }
                : {}),
              fare: String(room.totalFare),
              currency: offer?.currency || "INR",
              room: room.name,
              meal: room.mealType ?? "",
              refundable: room.isRefundable ? "1" : "0",
              ...(countryCode ? { cc: countryCode } : {}),
              nat: nationality,
            };
            return (
              <div
                key={`${room.bookingCode}-${i}`}
                className="flex flex-col gap-3 rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-[0.98rem] font-bold text-ink">
                    {room.name || "Room"}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem]">
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Utensils size={13} className="text-red" aria-hidden />
                      {(room.mealType || "Room Only").replace(/_/g, " ")}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        room.isRefundable
                          ? "font-medium text-green-700"
                          : "text-muted",
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
                  {/* Both flags ride along on every TBO rate and were never
                      shown; "transfers included" is exactly the kind of thing
                      that decides between two otherwise identical rooms. */}
                  {(room.withTransfers || room.packageFare) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {room.withTransfers && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[0.76rem] font-semibold text-sky-800">
                          <CarFront size={11} aria-hidden /> Transfers included
                        </span>
                      )}
                      {room.packageFare && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[0.76rem] font-semibold text-violet-800">
                          <Package size={11} aria-hidden /> Package rate
                        </span>
                      )}
                    </div>
                  )}
                  <RoomContentNote
                    content={matchRoomContent(room.name, roomContent)}
                  />
                  {room.inclusion && (
                    <p className="mt-1 text-[0.78rem] text-muted/90">
                      {room.inclusion.toLowerCase().replace(/,/g, " · ")}
                    </p>
                  )}
                  {/* Detailed Search RS extras — TBO portal checkpoints 18, 24. */}
                  {(room.roomPromotions?.length ?? 0) > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {room.roomPromotions!.map((p, k) => (
                        <li
                          key={k}
                          className="flex items-start gap-1.5 text-[0.78rem] font-medium text-green-700"
                        >
                          <BadgePercent
                            size={13}
                            className="mt-0.5 flex-none"
                            aria-hidden
                          />{" "}
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(room.amenities?.length ?? 0) > 0 && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] text-muted">
                      <Check
                        size={13}
                        className="mt-0.5 flex-none text-red"
                        aria-hidden
                      />
                      <span>{room.amenities!.slice(0, 8).join(" · ")}</span>
                    </p>
                  )}
                  {/* Mandatory charges collected BY THE HOTEL, usually in
                              its local currency — TBO portal checkpoint 19. */}
                  {(room.supplements?.length ?? 0) > 0 && (
                    <div className="mt-2 rounded-brand border border-amber-300 bg-amber-50 px-3 py-2 text-[0.78rem] text-amber-900">
                      <span className="font-semibold">
                        Payable at the hotel
                      </span>{" "}
                      — not included in the total:
                      <ul className="mt-0.5 list-disc pl-4">
                        {room.supplements!.map((sup, k) => (
                          <li key={k}>
                            {(
                              sup.description ||
                              sup.type ||
                              "Mandatory supplement"
                            ).replace(/_/g, " ")}
                            {sup.price != null
                              ? ` — ${new Intl.NumberFormat("en-IN", {
                                  style: "currency",
                                  currency:
                                    sup.currency || offer?.currency || "INR",
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(sup.price)}${
                                  sup.currency &&
                                  sup.currency !== (offer?.currency || "INR")
                                    ? " (hotel's local currency)"
                                    : ""
                                }`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {room.beddingNote && (
                    <p className="mt-1.5 text-[0.76rem] italic text-muted/90">
                      {room.beddingNote}
                    </p>
                  )}
                  <RoomRateDetails
                    bookingCode={room.bookingCode}
                    destinationCountry={countryCode}
                  />
                </div>
                <div className="flex flex-none items-end justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="text-right">
                    <div className="text-[1.15rem] font-extrabold text-navy">
                      {money.format(room.totalFare)}
                    </div>
                    <div className="text-[0.72rem] text-muted">
                      total · {nights} night{nights > 1 ? "s" : ""} · incl.
                      taxes
                    </div>
                  </div>
                  <BookButton
                    query={query}
                    path="/hotels/checkout"
                    label="Book"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
