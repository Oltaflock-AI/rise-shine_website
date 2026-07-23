import { site } from "@/data/site";
import { Stars } from "./Stars";
import { cn } from "@/lib/cn";

/**
 * Trust signal built around the aggregate Google rating. Defaults to the
 * audit-verified static numbers in `site.reviews`; server components with the
 * live Places feed (see `lib/google-reviews`) pass fresh values via props.
 */
export function GoogleReviews({
  tone = "light",
  className,
  rating: ratingProp,
  count: countProp,
  url: urlProp,
}: {
  tone?: "light" | "dark";
  className?: string;
  rating?: number;
  count?: number;
  url?: string;
}) {
  const rating = ratingProp ?? site.reviews.rating;
  const count = countProp ?? site.reviews.count;
  const url = urlProp ?? site.reviews.url;
  const ratingText = rating.toFixed(1);
  const label = `Rated ${ratingText} out of 5 from ${count} Google reviews`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}. Read them on Google`}
      className={cn(
        "group inline-flex items-center gap-3.5 rounded-full transition-opacity hover:opacity-90",
        className,
      )}
    >
      <Stars
        className={tone === "dark" ? "text-white" : "text-red"}
        size={16}
        label={label}
      />
      <span
        className={cn(
          "text-[0.88rem]",
          tone === "dark" ? "text-white/80" : "text-muted",
        )}
      >
        <b
          className={cn(
            "font-semibold",
            tone === "dark" ? "text-white" : "text-ink",
          )}
        >
          {ratingText}/5
        </b>{" "}
        from {count} Google reviews
      </span>
    </a>
  );
}
