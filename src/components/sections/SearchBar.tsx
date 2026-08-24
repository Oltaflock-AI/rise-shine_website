"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  ArrowRightLeft,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  Loader2,
  MapPin,
  Minus,
  Plane,
  PlaneTakeoff,
  Plus,
  SlidersHorizontal,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  POPULAR_DOMESTIC_AIRPORTS,
  POPULAR_INTERNATIONAL_AIRPORTS,
  airportLabel,
  resolveAirport,
  searchAirports,
  type Airport,
} from "@/data/airports";
import { POPULAR_CITIES, type HotelCity } from "@/data/hotel-cities";
import { NATIONALITIES } from "@/data/nationalities";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { cn } from "@/lib/cn";
import { DateField, Select } from "@/components/ui/form-controls";
import { formatDate } from "@/lib/format-date";
import { saveRecentSearch } from "@/lib/recent-searches";
import { trackEvent } from "@/lib/analytics";

const CABINS = ["Economy", "Premium Economy", "Business", "First"] as const;
const FARE_TYPES = ["Regular", "Student", "Senior citizen", "Defence"] as const;
const AIRLINES = [
  { code: "", name: "All Airlines" },
  { code: "6E", name: "IndiGo" },
  { code: "AI", name: "Air India" },
  { code: "IX", name: "Air India Express" },
  { code: "SG", name: "SpiceJet" },
  { code: "QP", name: "Akasa Air" },
  { code: "UK", name: "Vistara" },
];

type Cabin = (typeof CABINS)[number];

export type SearchInitial = {
  from?: string;
  to?: string;
  depart?: string;
  return?: string;
  adults?: string;
  children?: string;
  infants?: string;
  cabin?: string;
  fare?: string;
  airline?: string;
  nonstop?: string;
  trip?: "oneway" | "round";
  /** Which product tab to open on ("flights" default). */
  product?: "flights" | "hotels";
  /* Hotels. The results page hands back the resolved city so the bar shows the
     search the guest is looking at; without these the bar re-rendered its own
     defaults and the next tap on "Search Hotels" threw the search away. */
  city?: string;
  cityCode?: string;
  checkIn?: string;
  checkOut?: string;
  rooms?: string;
  ages?: string;
  nat?: string;
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-line px-5 py-3.5 last:border-0 lg:border-b-0 lg:[&:not(:first-child)]:border-l",
        className,
      )}
    >
      <span className="text-meta font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-transparent text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/70";

/** "IN" → "India" (falls back to the raw code on unknown regions). */
const regionName = (cc: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc;
  } catch {
    return cc;
  }
};

/**
 * Default dates start at TOMORROW, not a fortnight out: the traveller who lands
 * on the search bar is usually flying soon, and a far-off prefill silently
 * searches the wrong week for anyone who doesn't notice it.
 */
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/** `n` days after an ISO date — the return/check-out default hangs off the
 *  departure the traveller actually picked, never off today. A return prefilled
 *  from today reads as a date BEFORE the outbound whenever the URL carries a
 *  departure further out than the gap. */
const isoAfter = (from: string, days: number) => {
  const [y, m, d] = from.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso(days + 1);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

function Stepper({
  label,
  sub,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  sub: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const btn =
    "grid h-11 w-11 place-items-center rounded-full border border-line text-ink transition-colors hover:border-red hover:text-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink lg:h-8 lg:w-8";
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-[0.9rem] font-semibold text-ink">{label}</div>
        <div className="text-[0.82rem] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={15} />
        </button>
        <span className="w-4 text-center text-[0.95rem] font-bold tabular-nums text-ink">
          {value}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export function SearchBar({
  initial,
  overlap = true,
  collapsible = false,
}: {
  initial?: SearchInitial;
  overlap?: boolean;
  /**
   * Results pages only. The full form is ~850px tall on a phone, which pushed
   * the first flight result to y=1618 and the first hotel to y=1182 — nobody
   * arrives at a results page wanting to look at the form they just filled in.
   * Collapsed to a single button on small screens; desktop is unaffected,
   * where the form costs one row and re-searching is the common action.
   */
  collapsible?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  const [product, setProduct] = useState<"flights" | "hotels">(
    initial?.product ?? "flights",
  );
  const [trip, setTrip] = useState<"oneway" | "round">(
    initial?.trip ?? "oneway",
  );
  const [from, setFrom] = useState(initial?.from || "Ahmedabad (AMD)");
  const [to, setTo] = useState(initial?.to ?? "");
  const [depart, setDepart] = useState(initial?.depart ?? "");
  const [ret, setRet] = useState(initial?.return ?? "");

  const [adults, setAdults] = useState(Number(initial?.adults) || 1);
  const [children, setChildren] = useState(Number(initial?.children) || 0);
  const [infants, setInfants] = useState(Number(initial?.infants) || 0);
  const [cabin, setCabin] = useState<Cabin>(
    (initial?.cabin as Cabin) || "Economy",
  );
  const [fare, setFare] = useState<string>(initial?.fare || FARE_TYPES[0]);
  const [airline, setAirline] = useState(initial?.airline ?? "");
  const [nonStop, setNonStop] = useState(initial?.nonstop === "1");

  const [paxOpen, setPaxOpen] = useState(false);
  const [today, setToday] = useState("");
  const paxRef = useRef<HTMLDivElement>(null);

  /** Moving the outbound past the return drags the return with it — a return
   *  before its own departure is not a search TBO can answer. */
  const pickDepart = (v: string) => {
    setDepart(v);
    setRet((r) => (r && r >= v ? r : isoAfter(v, 7)));
  };

  // Prefill dates on the client to avoid SSR/hydration mismatch.
  useEffect(() => {
    setToday(iso(0));
    const dep = depart || iso(1);
    setDepart(dep);
    setRet((r) => r || isoAfter(dep, 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the travellers popover on outside click.
  useEffect(() => {
    if (!paxOpen) return;
    const onClick = (e: MouseEvent) => {
      if (paxRef.current && !paxRef.current.contains(e.target as Node))
        setPaxOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [paxOpen]);

  // TBO checkpoint: total travellers (adults + children + infants) per journey ≤ 9.
  const maxAdults = 9 - children - infants;
  const maxChildren = 9 - adults - infants;
  const maxInfants = Math.min(adults, 9 - adults - children); // also ≤ 1 per adult

  const setAdultsClamped = (n: number) => {
    const a = Math.max(1, Math.min(maxAdults, n));
    setAdults(a);
    if (infants > a) setInfants(a); // 1 infant per adult, max
  };

  const paxTotal = adults + children + infants;

  // Tracks the search navigation so the button can acknowledge the click —
  // isPending stays true until the results route (or its fallback) renders.
  const [searching, startSearch] = useTransition();

  /** A flight that starts and ends at the same airport is not a journey. Both
   *  sides are resolved to their IATA code first, so "AMD", "Ahmedabad" and
   *  "Ahmedabad (AMD)" all read as the same place. */
  const fromCode = resolveAirport(from)?.code;
  const toCode = resolveAirport(to)?.code;
  const sameRoute = Boolean(fromCode && toCode && fromCode === toCode);

  const onSubmitFlights = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || sameRoute || searching) return;
    const p = new URLSearchParams({
      from: from.trim() || "Ahmedabad (AMD)",
      to: to.trim(),
      trip,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin,
      fare,
    });
    if (depart) p.set("depart", depart);
    if (trip === "round" && ret) p.set("return", ret);
    if (airline) p.set("airline", airline);
    if (nonStop) p.set("nonstop", "1");
    const url = `/flights?${p.toString()}`;
    saveRecentSearch({
      kind: "flight",
      label: `${from.trim() || "Ahmedabad (AMD)"} → ${to.trim()}${depart ? ` · ${formatDate(depart)}` : ""}`,
      url,
    });
    trackEvent("search", {
      kind: "flight",
      search_term: `${from.trim()} → ${to.trim()}`,
    });
    startSearch(() => router.push(url));
  };

  const noteColor = overlap ? "text-muted" : "text-white/85";

  return (
    <div className={cn("relative z-20", overlap && "-mt-16")}>
      <Container>
        {collapsible && (
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 text-[0.95rem] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20 lg:hidden"
          >
            <SlidersHorizontal size={17} aria-hidden />
            {formOpen ? "Hide search" : "Change search"}
            <ChevronDown
              size={17}
              aria-hidden
              className={cn("transition-transform", formOpen && "rotate-180")}
            />
          </button>
        )}

        <div className={cn(collapsible && !formOpen && "hidden lg:block")}>
        {/* Product tabs */}
        <div className="mx-auto mb-3 flex w-fit gap-1 rounded-full bg-white/95 p-1.5 shadow-brand-sm backdrop-blur">
          {(
            [
              { id: "flights", label: "Flights", Icon: PlaneTakeoff },
              { id: "hotels", label: "Hotels", Icon: BedDouble },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setProduct(id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2 text-[0.9rem] font-semibold transition-colors",
                product === id
                  ? "grad-red text-white shadow-brand-red"
                  : "text-ink hover:text-red",
              )}
            >
              <Icon size={17} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-[22px] bg-white shadow-brand-lg">
          {product === "flights" ? (
            <>
              {/* trip toggle */}
              <div className="flex items-center gap-1 border-b border-line px-5 pt-4">
                <span className="mr-2 hidden text-[0.9rem] font-bold text-ink sm:inline">
                  Book Flight
                </span>
                {(["oneway", "round"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrip(t)}
                    className={cn(
                      "rounded-t-lg px-4 py-2 text-[0.9rem] font-semibold transition-colors",
                      trip === t
                        ? "bg-red/10 text-red"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {t === "oneway" ? "One-way" : "Round-trip"}
                  </button>
                ))}
              </div>

              <form onSubmit={onSubmitFlights} aria-label="Search flights">
                <div className="relative grid lg:grid-cols-[1.35fr_1.35fr_0.75fr_0.75fr_1.1fr_auto]">
                  <span
                    className="grad-red absolute bottom-3 left-0 top-3 hidden w-1 rounded-r-full lg:block"
                    aria-hidden
                  />
                  <AirportField
                    label="From"
                    icon={PlaneTakeoff}
                    value={from}
                    onChange={setFrom}
                    placeholder="Ahmedabad (AMD)"
                    ariaLabel="From airport"
                  />
                  <AirportField
                    label="To"
                    icon={MapPin}
                    value={to}
                    onChange={setTo}
                    placeholder="Where to?"
                    ariaLabel="To airport"
                    required
                  />
                  <Field label="Depart">
                    <DateField
                      bare
                      showDay
                      value={depart}
                      min={today || undefined}
                      onChange={pickDepart}
                      aria-label="Departure date"
                    />
                  </Field>
                  <Field
                    label="Return"
                    className={trip === "oneway" ? "opacity-40" : undefined}
                  >
                    <DateField
                      bare
                      showDay
                      value={ret}
                      min={depart || today || undefined}
                      disabled={trip === "oneway"}
                      onChange={setRet}
                      aria-label="Return date"
                    />
                  </Field>

                  {/* Travellers & class */}
                  <div
                    className="relative border-b border-line lg:border-b-0 lg:border-l"
                    ref={paxRef}
                  >
                    <button
                      type="button"
                      onClick={() => setPaxOpen((o) => !o)}
                      className="flex w-full flex-col gap-1 px-5 py-3.5 text-left"
                      aria-expanded={paxOpen}
                    >
                      <span className="text-meta font-bold uppercase tracking-[0.12em] text-muted">
                        Travellers &amp; class
                      </span>
                      <span className="flex items-center gap-2">
                        <Users
                          size={17}
                          className="flex-none text-red"
                          aria-hidden
                        />
                        <span className="flex-1">
                          <span className="block text-[0.95rem] font-semibold leading-tight text-ink">
                            {paxTotal} Traveller{paxTotal > 1 ? "s" : ""}
                          </span>
                          <span className="block text-[0.82rem] text-muted">
                            {cabin}
                          </span>
                        </span>
                        <ChevronDown
                          size={15}
                          className={cn(
                            "flex-none text-muted transition-transform",
                            paxOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </span>
                    </button>

                    {paxOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-line bg-white p-4 shadow-brand lg:left-auto lg:right-0 lg:w-80">
                        <Stepper
                          label="Adults"
                          sub="12+ years"
                          value={adults}
                          onChange={setAdultsClamped}
                          min={1}
                          max={maxAdults}
                        />
                        <Stepper
                          label="Children"
                          sub="2–12 years"
                          value={children}
                          onChange={(n) =>
                            setChildren(Math.max(0, Math.min(maxChildren, n)))
                          }
                          min={0}
                          max={maxChildren}
                        />
                        <Stepper
                          label="Infants"
                          sub="Under 2 years"
                          value={infants}
                          onChange={(n) =>
                            setInfants(Math.max(0, Math.min(maxInfants, n)))
                          }
                          min={0}
                          max={maxInfants}
                        />
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wide text-muted">
                            Cabin class
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {CABINS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCabin(c)}
                                className={cn(
                                  "rounded-lg border px-2 py-2 text-[0.88rem] font-semibold transition-colors",
                                  cabin === c
                                    ? "border-red bg-red/10 text-red"
                                    : "border-line text-ink hover:border-red/50",
                                )}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="navy"
                          size="sm"
                          fullWidth
                          className="mt-3"
                          onClick={() => setPaxOpen(false)}
                        >
                          Done
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid place-items-center p-3.5">
                    <Button
                      type="submit"
                      arrow={!searching}
                      fullWidth
                      disabled={searching || sameRoute}
                    >
                      {searching ? (
                        <>
                          <Loader2
                            size={17}
                            className="animate-spin"
                            aria-hidden
                          />{" "}
                          Searching…
                        </>
                      ) : (
                        "Search Flights"
                      )}
                    </Button>
                  </div>
                </div>

                {sameRoute && (
                  <p
                    role="alert"
                    className="flex items-center gap-1.5 border-t border-line bg-red/5 px-5 py-2.5 text-[0.88rem] font-semibold text-red"
                  >
                    <TriangleAlert size={14} className="flex-none" aria-hidden />
                    Departure and destination can&apos;t be the same airport —
                    pick somewhere to fly to.
                  </p>
                )}

                {/* Options row */}
                <div className="flex flex-col gap-3 border-t border-line px-5 py-3.5 lg:flex-row lg:items-center lg:gap-6">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-[0.82rem] font-bold uppercase tracking-wide text-muted">
                      Fare type
                    </span>
                    {FARE_TYPES.map((f) => (
                      <label
                        key={f}
                        className="flex cursor-pointer items-center gap-1.5 py-2 text-[0.9rem] text-ink lg:py-0"
                      >
                        <input
                          type="radio"
                          name="fare"
                          checked={fare === f}
                          onChange={() => setFare(f)}
                          className="peer sr-only"
                        />
                        <span className="grid h-4 w-4 place-items-center rounded-full border-[1.6px] border-line peer-checked:border-red">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              fare === f ? "bg-red" : "bg-transparent",
                            )}
                          />
                        </span>
                        {f}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:ml-auto">
                    <label className="flex items-center gap-2 py-2 text-[0.9rem] font-medium text-ink lg:py-0">
                      <Plane size={15} className="text-red" aria-hidden />
                      <Select
                        bare
                        value={airline}
                        onChange={(e) => setAirline(e.target.value)}
                        aria-label="Preferred airline"
                        className="font-semibold"
                      >
                        {AIRLINES.map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 py-2 text-[0.9rem] font-medium text-ink lg:py-0">
                      <input
                        type="checkbox"
                        checked={nonStop}
                        onChange={(e) => setNonStop(e.target.checked)}
                        className="h-5 w-5 accent-red lg:h-4 lg:w-4"
                      />
                      Non-stop only
                    </label>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <HotelsPanel initial={initial} />
          )}
        </div>

        <p
          className={cn(
            "mt-3 flex items-center justify-center gap-1.5 text-center text-[0.88rem]",
            noteColor,
          )}
        >
          <ArrowRightLeft size={13} aria-hidden />
          {product === "flights"
            ? "Live fares across 500+ airlines, powered by our booking system."
            : "Live hotel rates for popular destinations, powered by our booking system."}
        </p>
        </div>
      </Container>
    </div>
  );
}

/** One airport row in the flights typeahead panel. */
function AirportOption({
  airport,
  onPick,
}: {
  airport: Airport;
  onPick: (a: Airport) => void;
}) {
  return (
    <button
      type="button"
      // The input's blur fires before a click would land, so commit on mousedown.
      role="option"
      aria-selected={false}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(airport);
      }}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-line/30"
    >
      <Plane size={17} className="flex-none text-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.92rem] font-semibold text-ink">
          {airport.city}
        </span>
        <span className="block truncate text-[0.88rem] text-muted">
          {airport.name} · {airport.countryName}
        </span>
      </span>
      <span className="flex-none rounded-md border border-line px-1.5 py-0.5 text-[0.82rem] font-bold tracking-wide text-muted">
        {airport.code}
      </span>
    </button>
  );
}

/**
 * From/To picker.
 *
 * This was a `<datalist>` holding every one of the ~230 airports we carry, which the
 * browser renders as one undifferentiated scroll — a customer looking for Dubai was
 * shown Adampur Air Force Base. It now opens on the routes the agency actually sells
 * and only searches the full list once two characters are typed, the same shape the
 * hotels destination picker already uses.
 *
 * The input stays free text: `resolveAirport` on the server accepts a code, a city or
 * an airport name, so a typed value that never matched a row still searches.
 */
function AirportField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  ariaLabel,
  required,
}: {
  label: string;
  icon: typeof MapPin;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const query = value.trim();
  // A committed pick reads "Goa (GOI)" — treat that as "nothing typed yet" so
  // re-opening the field shows the popular list rather than one row for itself.
  const typed = /\([A-Za-z]{3}\)$/.test(query) ? "" : query;
  const matches = typed.length >= 2 ? searchAirports(typed) : [];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (a: Airport) => {
    onChange(airportLabel(a));
    setOpen(false);
  };

  return (
    <Field label={label}>
      <div className="relative" ref={boxRef}>
        <label className="flex items-center gap-2">
          <Icon size={17} className="flex-none text-red" aria-hidden />
          <input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={(e) => {
              e.currentTarget.select();
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              // Enter on a single unambiguous match commits it instead of
              // submitting half-typed text.
              if (
                e.key === "Enter" &&
                matches.length > 0 &&
                typed.length >= 2
              ) {
                e.preventDefault();
                pick(matches[0]);
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            // combobox, not a bare textbox — otherwise aria-expanded means nothing
            // to a screen reader.
            role="combobox"
            aria-autocomplete="list"
            aria-controls={panelId}
            aria-expanded={open}
            autoComplete="off"
            required={required}
            className={inputCls}
          />
        </label>

        {open && (
          <div
            id={panelId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute -left-5 -right-5 top-[calc(100%+16px)] z-30 max-h-[22rem] overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-brand lg:right-auto lg:w-[420px] lg:p-5"
          >
            {typed.length < 2 ? (
              <>
                <div className="mb-2 text-meta font-bold uppercase tracking-[0.12em] text-muted">
                  Popular in India
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {POPULAR_DOMESTIC_AIRPORTS.map((a) => (
                    <AirportOption key={a.code} airport={a} onPick={pick} />
                  ))}
                </div>
                <div className="mb-2 mt-4 text-meta font-bold uppercase tracking-[0.12em] text-muted">
                  Popular international
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {POPULAR_INTERNATIONAL_AIRPORTS.map((a) => (
                    <AirportOption key={a.code} airport={a} onPick={pick} />
                  ))}
                </div>
                <p className="mt-3 border-t border-line pt-3 text-[0.88rem] text-muted">
                  Or start typing a city, airport or code — we cover every
                  Indian airport and the major international hubs.
                </p>
              </>
            ) : matches.length > 0 ? (
              <div className="grid grid-cols-1 gap-1">
                {matches.map((a) => (
                  <AirportOption key={a.code} airport={a} onPick={pick} />
                ))}
              </div>
            ) : (
              <p className="px-2 py-1 text-[0.9rem] text-muted">
                No airport matches &ldquo;{typed}&rdquo;. Check the spelling, or
                enter the 3-letter code.
              </p>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

/** One destination row in the hotels typeahead panel. */
function CityOption({
  city,
  onPick,
}: {
  city: HotelCity;
  onPick: (c: HotelCity) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(city)}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-line/30"
    >
      <Building2 size={18} className="flex-none text-muted" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-[0.92rem] font-semibold text-ink">
          {city.label}
        </span>
        <span className="block truncate text-[0.88rem] text-muted">
          {regionName(city.countryCode)}
        </span>
      </span>
    </button>
  );
}

function HotelsPanel({ initial }: { initial?: SearchInitial }) {
  const router = useRouter();
  const [city, setCity] = useState(initial?.city ?? "");
  /* The label the guest reads is not what TBO is asked for. Hold the code the
     search actually ran with and keep using it until the text is edited, so a
     city whose label does not round-trip through the suggestion list is not
     quietly downgraded to free text. */
  const [cityCode, setCityCode] = useState(initial?.cityCode ?? "");
  const [cityOpen, setCityOpen] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<HotelCity[]>([]);
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? "");
  const [today, setToday] = useState("");

  // Occupancy — uniform per room (TBO PaxRooms: adults 1–8, children 0–4 + ages).
  const [rooms, setRooms] = useState(Number(initial?.rooms) || 1);
  const [adults, setAdults] = useState(Number(initial?.adults) || 2);
  // "".split(",") is [""], and Number("") is 0 — parsed naively that invents a
  // child aged 0 on every childless search.
  const initialAges = (initial?.ages ?? "")
    .split(",")
    .filter((a) => a.trim() !== "")
    .map((a) => Number(a))
    .filter((a) => Number.isFinite(a) && a >= 0 && a <= 17);
  const [childCount, setChildCount] = useState(initialAges.length);
  const [childAges, setChildAges] = useState<number[]>(initialAges);
  // TBO prices some rates by guest nationality and requires it on Search AND
  // Book — collected here and carried unchanged all the way to the Book RQ.
  const [nationality, setNationality] = useState(initial?.nat || "IN");
  const [paxOpen, setPaxOpen] = useState(false);
  const paxRef = useRef<HTMLDivElement>(null);

  /** Check-out always stays after check-in — TBO rejects a zero-night stay. */
  const pickCheckIn = (v: string) => {
    setCheckIn(v);
    setCheckOut((d) => (d && d > v ? d : isoAfter(v, 2)));
  };

  useEffect(() => {
    setToday(iso(0));
    const start = checkIn || iso(1);
    setCheckIn(start);
    setCheckOut((d) => d || isoAfter(start, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the guests popover on outside click (same pattern as flights).
  useEffect(() => {
    if (!paxOpen) return;
    const onClick = (e: MouseEvent) => {
      if (paxRef.current && !paxRef.current.contains(e.target as Node))
        setPaxOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [paxOpen]);

  // Close the destination panel on outside click.
  useEffect(() => {
    if (!cityOpen) return;
    const onClick = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node))
        setCityOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [cityOpen]);

  const setChildren = (n: number) => {
    const c = Math.max(0, Math.min(4, n));
    setChildCount(c);
    setChildAges((ages) => Array.from({ length: c }, (_, i) => ages[i] ?? 8));
  };

  const guestsPerRoom = adults + childCount;
  const guestsTotal = guestsPerRoom * rooms;

  // Debounced destination autocomplete against the full TBO city dataset.
  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) {
      setSuggestions(POPULAR_CITIES);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/hotels/cities?q=${encodeURIComponent(q)}`, {
        signal: ctl.signal,
      })
        .then((r) => r.json())
        .then((j) => setSuggestions(j?.cities ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [city]);

  // Acknowledge the click for the whole navigation (same pattern as flights).
  const [searching, startSearch] = useTransition();

  const pickCity = (c: HotelCity) => {
    setCity(c.label);
    setCityCode(c.cityCode);
    setCityOpen(false);
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (searching) return;
    // Selecting a datalist option leaves its label in the input — map it back to
    // its TBO CityCode. Unmatched free text is resolved server-side.
    const q = city.trim().toLowerCase();
    const match =
      // Typing in the box clears cityCode, so if it is still set the text is
      // exactly the city that code belongs to.
      (cityCode ? { cityCode, label: city.trim() } : undefined) ||
      suggestions.find((c) => c.label.toLowerCase() === q) ||
      POPULAR_CITIES.find((c) => c.label.toLowerCase() === q) ||
      (q.length > 1
        ? suggestions.find((c) => c.label.toLowerCase().startsWith(q))
        : undefined);
    const p = new URLSearchParams();
    p.set("city", match ? match.cityCode : city.trim());
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    p.set("rooms", String(rooms));
    p.set("adults", String(adults));
    if (childCount > 0) {
      p.set("children", String(childCount));
      p.set("ages", childAges.join(","));
    }
    p.set("nat", nationality);
    const url = `/hotels?${p.toString()}`;
    saveRecentSearch({
      kind: "hotel",
      label: `${match ? match.label : city.trim()}${checkIn ? ` · ${formatDate(checkIn)}` : ""}`,
      url,
    });
    trackEvent("search", {
      kind: "hotel",
      search_term: match ? match.label : city.trim(),
    });
    startSearch(() => router.push(url));
  };

  return (
    <form onSubmit={search} aria-label="Hotel search">
      <div className="flex items-center gap-2 border-b border-line px-5 pb-3 pt-4">
        <span className="text-[0.9rem] font-bold text-ink">Find a Hotel</span>
      </div>
      <div className="relative grid lg:grid-cols-[1.6fr_1fr_1fr_1.1fr_auto]">
        <span
          className="grad-red absolute inset-y-0 left-0 hidden w-[6px] lg:block"
          aria-hidden
        />
        <Field label="Destination">
          <div className="relative" ref={cityRef}>
            <label className="flex items-center gap-2">
              <MapPin size={17} className="flex-none text-red" aria-hidden />
              <input
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setCityCode("");
                  setCityOpen(true);
                }}
                onFocus={() => setCityOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCityOpen(false);
                }}
                placeholder="Where do you want to stay?"
                aria-label="Hotel destination"
                aria-expanded={cityOpen}
                autoComplete="off"
                className={inputCls}
              />
            </label>

            {cityOpen && (
              <div className="absolute -left-5 -right-5 top-[calc(100%+16px)] z-30 rounded-2xl border border-line bg-white p-4 shadow-brand lg:right-auto lg:w-[560px] lg:p-5">
                {city.trim().length < 2 ? (
                  <>
                    <div className="mb-3 text-[0.95rem] font-bold text-ink">
                      Popular destinations
                    </div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {POPULAR_CITIES.slice(0, 10).map((c) => (
                        <CityOption
                          key={c.cityCode}
                          city={c}
                          onPick={pickCity}
                        />
                      ))}
                    </div>
                    <p className="mt-3 border-t border-line pt-3 text-[0.88rem] text-muted">
                      Or start typing — we cover 43,000+ cities worldwide.
                    </p>
                  </>
                ) : suggestions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1">
                    {suggestions.slice(0, 8).map((c) => (
                      <CityOption key={c.cityCode} city={c} onPick={pickCity} />
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-1 text-[0.9rem] text-muted">
                    No matching destination yet — keep typing, or press Search
                    and we&apos;ll match it for you.
                  </p>
                )}
              </div>
            )}
          </div>
        </Field>
        <Field label="Check-in">
          <div className="flex items-center gap-2">
            <CalendarDays
              size={17}
              className="flex-none text-red"
              aria-hidden
            />
            <DateField
              bare
              showDay
              className="flex-1"
              value={checkIn}
              min={today || undefined}
              onChange={pickCheckIn}
              aria-label="Check-in date"
            />
          </div>
        </Field>
        <Field label="Check-out">
          <div className="flex items-center gap-2">
            <CalendarDays
              size={17}
              className="flex-none text-red"
              aria-hidden
            />
            <DateField
              bare
              showDay
              className="flex-1"
              value={checkOut}
              min={checkIn || today || undefined}
              onChange={setCheckOut}
              aria-label="Check-out date"
            />
          </div>
        </Field>
        {/* Guests & rooms — popover mirroring the flights travellers control */}
        <div
          className="relative border-b border-line lg:border-b-0 lg:border-l"
          ref={paxRef}
        >
          <button
            type="button"
            onClick={() => setPaxOpen((o) => !o)}
            className="flex w-full flex-col gap-1 px-5 py-3.5 text-left"
            aria-expanded={paxOpen}
          >
            <span className="text-meta font-bold uppercase tracking-[0.12em] text-muted">
              Guests &amp; rooms
            </span>
            <span className="flex items-center gap-2">
              <BedDouble size={17} className="flex-none text-red" aria-hidden />
              <span className="flex-1 text-[0.95rem] font-semibold leading-tight text-ink">
                {guestsTotal} Guest{guestsTotal > 1 ? "s" : ""} · {rooms} Room
                {rooms > 1 ? "s" : ""}
              </span>
              <ChevronDown
                size={15}
                className={cn(
                  "flex-none text-muted transition-transform",
                  paxOpen && "rotate-180",
                )}
                aria-hidden
              />
            </span>
          </button>

          {paxOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-line bg-white p-4 shadow-brand lg:left-auto lg:right-0 lg:w-80">
              <Stepper
                label="Rooms"
                sub="Same guests per room"
                value={rooms}
                onChange={(n) => setRooms(Math.max(1, Math.min(4, n)))}
                min={1}
                max={4}
              />
              <Stepper
                label="Adults"
                sub="Per room · 12+ years"
                value={adults}
                onChange={(n) => setAdults(Math.max(1, Math.min(8, n)))}
                min={1}
                max={8}
              />
              <Stepper
                label="Children"
                sub="Per room · under 12"
                value={childCount}
                onChange={setChildren}
                min={0}
                max={4}
              />
              {childCount > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-2 text-[0.82rem] font-bold uppercase tracking-wide text-muted">
                    Children&apos;s ages
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {childAges.map((age, i) => (
                      <Select
                        key={i}
                        size="sm"
                        value={age}
                        onChange={(e) =>
                          setChildAges((ages) =>
                            ages.map((a, idx) =>
                              idx === i ? Number(e.target.value) : a,
                            ),
                          )
                        }
                        aria-label={`Child ${i + 1} age`}
                      >
                        {Array.from({ length: 17 }, (_, a) => a + 1).map(
                          (a) => (
                            <option key={a} value={a}>
                              {a} yr{a > 1 ? "s" : ""}
                            </option>
                          ),
                        )}
                      </Select>
                    ))}
                  </div>
                </div>
              )}
              {/* Guest nationality — priced differently by some hotels, and TBO
                  allows international stays for Indian nationality only. */}
              <div className="mt-3 border-t border-line pt-3">
                <label className="mb-2 block text-[0.82rem] font-bold uppercase tracking-wide text-muted">
                  Guest nationality
                </label>
                <Select
                  size="sm"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  aria-label="Guest nationality"
                >
                  {NATIONALITIES.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.label}
                    </option>
                  ))}
                </Select>
                {nationality !== "IN" && (
                  <p className="mt-2 text-[0.82rem] leading-snug text-muted">
                    Non-Indian nationalities can be booked for stays in India
                    only.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid place-items-center p-3.5">
          <Button
            type="submit"
            arrow={!searching}
            fullWidth
            disabled={searching}
          >
            {searching ? (
              <>
                <Loader2 size={17} className="animate-spin" aria-hidden />{" "}
                Searching…
              </>
            ) : (
              "Search Hotels"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
