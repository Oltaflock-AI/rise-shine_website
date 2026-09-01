import {
  parseRateConditions,
  type RateConditionGroup,
} from "@/lib/hotel-rate-conditions";

/**
 * The PreBook `RateConditions` rows, rendered.
 *
 * Shared by the room page and the book page so the two can never drift — TBO's
 * portal checkpoint 23 asks for these on both, and the wording a guest agrees to
 * at checkout has to be the wording they read on the room.
 *
 * The rows are HTML-escaped supplier markup, so they go through
 * `parseRateConditions` and reach the DOM as text. Never `dangerouslySetInnerHTML`.
 */
export function RateConditionList({
  groups,
  className,
}: {
  groups: RateConditionGroup[];
  className?: string;
}) {
  return (
    <ul className={className ?? "mt-1 list-disc space-y-1 pl-5"}>
      {groups.map((g, i) => (
        <li key={i}>
          {g.label && (
            <span className="font-medium text-ink">{g.label}: </span>
          )}
          {g.items.length === 1 ? (
            g.items[0]
          ) : (
            <ul className="mt-1 list-[circle] space-y-1 pl-5">
              {g.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export { parseRateConditions };
