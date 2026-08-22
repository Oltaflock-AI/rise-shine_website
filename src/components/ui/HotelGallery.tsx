"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Images as ImagesIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The hotel photo mosaic, and the viewer behind it.
 *
 * TBO returns 60–95 photos per hotel. The page showed five and printed the
 * total on a `<span>`, so the badge read as a control that did nothing — the
 * remaining ninety photos were fetched and unreachable. The badge is now the
 * button that opens them.
 *
 * Only the five mosaic tiles are eagerly rendered; the rest mount when the
 * viewer opens, so a 95-photo hotel does not cost 95 image requests on load.
 */
export function HotelGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const tiles = images.slice(0, 5);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const show = useCallback(
    (i: number) => {
      setIndex((i + images.length) % images.length);
    },
    [images.length],
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") show(index + 1);
      if (e.key === "ArrowLeft") show(index - 1);
    };
    document.addEventListener("keydown", onKey);
    // The viewer covers the page; letting the page scroll behind it means the
    // reader loses their place in the room list on close.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, index, show]);

  if (!tiles.length) return null;

  return (
    <>
      <div className="mb-10 flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-brand-lg sm:grid sm:snap-none sm:grid-cols-4 sm:grid-rows-2 sm:overflow-hidden">
        {tiles.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
            aria-label={`View ${name} photos, starting at photo ${i + 1} of ${images.length}`}
            className={cn(
              "group relative h-40 w-[85%] flex-none cursor-pointer snap-center overflow-hidden rounded-brand-lg bg-cream sm:h-auto sm:w-auto sm:rounded-none",
              i === 0
                ? "sm:col-span-2 sm:row-span-2 sm:min-h-[21rem]"
                : "sm:min-h-[10rem]",
            )}
          >
            <Image
              src={src}
              alt={`${name} photo ${i + 1}`}
              fill
              sizes={
                i === 0
                  ? "(min-width: 640px) 50vw, 85vw"
                  : "(min-width: 640px) 25vw, 85vw"
              }
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              priority={i === 0}
            />
            {i === tiles.length - 1 && images.length > tiles.length && (
              <span className="absolute inset-0 grid place-items-center bg-black/45 transition-colors group-hover:bg-black/60">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-[0.78rem] font-bold text-ink">
                  <ImagesIcon size={13} aria-hidden /> See all {images.length}{" "}
                  photos
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} photos`}
          className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="flex flex-none items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="text-[0.9rem] font-semibold tabular-nums">
              {index + 1} / {images.length}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close photos"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-white transition-colors hover:bg-white/15"
            >
              <X size={22} aria-hidden />
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              key={index}
              src={images[index]}
              alt={`${name} photo ${index + 1} of ${images.length}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
            {images.length > 1 && (
              <>
                <GalleryArrow side="left" onClick={() => show(index - 1)} />
                <GalleryArrow side="right" onClick={() => show(index + 1)} />
              </>
            )}
          </div>

          {/* Thumbnail strip — the only way to reach photo 70 without 70 clicks. */}
          <div
            className="flex flex-none gap-2 overflow-x-auto px-4 py-3 sm:px-6"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => show(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "relative h-14 w-20 flex-none cursor-pointer overflow-hidden rounded-lg transition-opacity",
                  i === index
                    ? "ring-2 ring-red"
                    : "opacity-55 hover:opacity-100",
                )}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="5rem"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function GalleryArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30",
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4",
      )}
    >
      <Icon size={24} aria-hidden />
    </button>
  );
}
