import { Maximize2, BedDouble, ChevronDown } from "lucide-react";
import type { RoomContent } from "@/lib/hotel-room-match";

/**
 * What the static catalogue says about a room, shown beside its live rate.
 *
 * The guest is choosing what they will sleep in from a list of names that often
 * differ by one word ("Deluxe King" vs "Deluxe Twin"), so the size and the
 * airline-style description are the only things that make the choice concrete.
 *
 * TBO returns no per-room photographs — `imageURL` is empty on every room of
 * every hotel on our account — so `image` renders only if that ever changes.
 * A `<details>` disclosure keeps a 60-word description from burying the price.
 */
export function RoomContentNote({ content }: { content: RoomContent | undefined }) {
  if (!content || (!content.size && !content.description && !content.image)) return null;

  return (
    <div className="mt-2">
      {content.size && (
        <span className="inline-flex items-center gap-1 rounded-full bg-cream-2 px-2.5 py-1 text-meta font-semibold text-ink">
          <Maximize2 size={12} className="text-red" aria-hidden />
          {content.size}
        </span>
      )}
      {content.description && (
        <details className="group mt-1.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-meta font-semibold text-navy hover:text-red">
            <BedDouble size={13} aria-hidden />
            What&apos;s in this room
            <ChevronDown
              size={13}
              className="text-muted transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mt-1.5 max-w-prose text-body leading-relaxed text-muted">
            {content.description}
          </p>
        </details>
      )}
    </div>
  );
}
