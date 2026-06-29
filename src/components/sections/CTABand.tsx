import Image from "next/image";
import type { ReactNode } from "react";
import { photo } from "@/data/packages";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";

/** Full-width call-to-action band with a photo + brand wash. */
export function CTABand({
  title,
  text,
  photoId,
  children,
}: {
  title: ReactNode;
  text: string;
  photoId: string;
  children: ReactNode;
}) {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-brand-lg px-6 py-16 text-center text-white sm:px-12 sm:py-20">
            <Image
              src={photo(photoId, 1600)}
              alt=""
              fill
              sizes="(max-width:1220px) 100vw, 1220px"
              className="object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(100% 120% at 0% 100%, rgba(226,30,38,0.6), transparent 55%), linear-gradient(120deg, rgba(8,50,73,0.92), rgba(14,74,104,0.82))",
              }}
              aria-hidden
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-[clamp(1.9rem,3.6vw,2.8rem)] text-white">
                {title}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/85">{text}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3.5">
                {children}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
