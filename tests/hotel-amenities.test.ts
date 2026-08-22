import { describe, expect, it } from "vitest";
import { curateAmenities } from "../src/lib/hotel-amenities";

/**
 * Every string below is real TBO output. The feed is not a list of amenities,
 * it is every phrase every supplier ever wrote — 651 distinct strings for one
 * Dubai hotel — so the job is to collapse it, not merely to truncate it.
 */
describe("curateAmenities", () => {
  it("collapses the four ways TBO says 'pool' into one line", () => {
    const out = curateAmenities([
      "Outdoor pool",
      "Swimming pool",
      "outdoor pool (all year)",
      "Number of outdoor pools - 1",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "pool", label: "Swimming pool", icon: "Waves" });
  });

  it("collapses laundry, dry cleaning and ironing into one", () => {
    const out = curateAmenities([
      "Laundry facilities",
      "Laundry",
      "Dry cleaning/laundry service",
      "dry cleaning",
      "Ironing service",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].icon).toBe("WashingMachine");
  });

  it("gives the amenities their own icons", () => {
    const out = curateAmenities(["Breakfast available (surcharge)", "Laundry", "Flat-screen TV"]);
    expect(out.map((a) => a.icon)).toEqual(["Coffee", "WashingMachine", "Tv"]);
  });

  it("drops pandemic-era operational boilerplate", () => {
    const out = curateAmenities([
      "staff follow all safety protocols as directed by local authorities",
      "use of cleaning chemicals that are effective against coronavirus",
      "linens, towels and laundry washed in accordance with local authority guidelines",
      "hand sanitizer in guest accommodation and key areas",
      "physical distancing rules followed",
      "cashless payment available",
    ]);
    expect(out).toEqual([]);
  });

  it("keeps a specific rule ahead of the general one it would also match", () => {
    // "Children's pool" must not be swallowed by the generic pool rule.
    const out = curateAmenities(["Children's pool", "Outdoor pool"]);
    expect(out.map((a) => a.key)).toEqual(["kids-pool", "pool"]);
  });

  it("keeps unrecognised short labels, after the recognised ones", () => {
    const out = curateAmenities(["Library", "Free WiFi", "Nightclub"]);
    expect(out[0].key).toBe("wifi"); // recognised first
    expect(out.map((a) => a.label)).toContain("Library");
  });

  it("rejects sentence-shaped unknowns that would wrap the card", () => {
    const out = curateAmenities([
      "guests have the option to cancel any cleaning services during their stay",
      "Free newspapers in lobby and reading area for all guests staying",
    ]);
    expect(out).toEqual([]);
  });

  it("honours the cap and survives empty input", () => {
    expect(curateAmenities(["Free WiFi", "Outdoor pool", "Restaurant"], 2)).toHaveLength(2);
    expect(curateAmenities([])).toEqual([]);
    expect(curateAmenities(undefined)).toEqual([]);
  });
});
