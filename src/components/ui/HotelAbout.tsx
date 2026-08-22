import { parseHotelDescription } from "@/lib/hotel-description";

/**
 * The supplier's own write-up, with the structure it arrived with.
 *
 * TBO ships this as HTML whose `<strong>` runs are real section headings
 * ("Hotel Overview", "Accommodations", "Dining"). Flattening it to plain text
 * produced one grey block of fourteen clamped lines — every fact present, none
 * findable. `parseHotelDescription` recovers the headings; this renders them.
 *
 * Nothing here is `dangerouslySetInnerHTML`: the parser returns plain text
 * only, so supplier markup can never reach the page.
 */
export function HotelAbout({
  description,
}: {
  description: string | undefined;
}) {
  const sections = parseHotelDescription(description);
  if (!sections.length) return null;

  return (
    <div className="rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm sm:p-6">
      <h3 className="mb-4 text-[1rem] font-bold text-ink">
        About this property
      </h3>
      <div className="space-y-5">
        {sections.map((s, i) => (
          <section key={i}>
            {s.heading && (
              <h4 className="mb-1.5 text-[0.8rem] font-bold uppercase tracking-[0.08em] text-red">
                {s.heading}
              </h4>
            )}
            <div className="space-y-2.5">
              {s.paragraphs.map((p, j) => (
                <p
                  key={j}
                  className="text-[0.9rem] leading-[1.75] text-ink-soft"
                >
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
