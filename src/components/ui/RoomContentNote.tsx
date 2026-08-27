import { Maximize2 } from "lucide-react";
import { roomSizeLabel } from "@/lib/hotel-display";
import type { RoomContent } from "@/lib/hotel-room-match";

/**
 * The one fact from the static catalogue that belongs beside a price: how big
 * the room is.
 *
 * The catalogue's prose description used to sit here behind its own disclosure,
 * which gave every room card TWO chevrons — "What's in this room" and "Rate
 * details & conditions" — stacked one above the other. The description now
 * opens inside the single rate panel (see `RoomRateDetails`), so a room card
 * has one thing to expand, not two.
 *
 * TBO returns no per-room photographs — `imageURL` is empty on every room of
 * every hotel on our account — so nothing here assumes one exists.
 */
export function RoomContentNote({
  content,
}: {
  content: RoomContent | undefined;
}) {
  const size = roomSizeLabel(content?.size);
  if (!size) return null;

  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-cream-2 px-2.5 py-1 text-meta font-semibold text-ink">
      <Maximize2 size={12} className="text-red" aria-hidden />
      {size}
    </span>
  );
}
