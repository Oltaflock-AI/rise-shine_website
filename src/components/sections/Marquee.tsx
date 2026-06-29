import { marqueeDestinations } from "@/data/content";

/** Decorative scrolling destination ribbon. */
export function Marquee() {
  const items = [...marqueeDestinations, ...marqueeDestinations];
  return (
    <div
      className="group mt-16 overflow-hidden border-y border-line bg-cream py-5"
      aria-hidden
    >
      <div className="flex w-max animate-marquee gap-12 group-hover:[animation-play-state:paused]">
        {items.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="flex items-center gap-12 text-script text-2xl text-navy/85"
          >
            {d}
            <span className="text-base text-red">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
