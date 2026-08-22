"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * A hotel photo that degrades to the empty-state icon instead of a blank box.
 *
 * TBO's `Images` feed contains dead URLs — a live Dubai sweep turned up one
 * that answers 200 with zero bytes — and `next/image` renders those as an
 * invisible element, leaving a hole in the card that reads as a layout bug
 * rather than a missing photograph.
 */
export function HotelPhoto({
  src,
  alt,
  sizes,
  className,
}: {
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="grid h-full w-full place-items-center text-muted/50">
        <ImageOff size={26} aria-hidden />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
