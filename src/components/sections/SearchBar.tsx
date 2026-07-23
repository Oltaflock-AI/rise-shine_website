"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRightLeft,
  BedDouble,
  CalendarDays,
  ChevronDown,
  MapPin,
  Minus,
  Plane,
  PlaneTakeoff,
  Plus,
  Users,
} from "lucide-react";
import { AIRPORTS } from "@/data/airports";
import { POPULAR_CITIES, type HotelCity } from "@/data/hotel-cities";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";
import { cn } from "@/lib/cn";

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
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-transparent text-[0.95rem] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/70";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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
    "grid h-8 w-8 place-items-center rounded-full border border-line text-ink transition-colors hover:border-red hover:text-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink";
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-[0.9rem] font-semibold text-ink">{label}</div>
        <div className="text-[0.72rem] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
          <Minus size={15} />
        </button>
        <span className="w-4 text-center text-[0.95rem] font-bold tabular-nums text-ink">{value}</span>
        <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export function SearchBar({
  initial,
  overlap = true,
}: {
  initial?: SearchInitial;
  overlap?: boolean;
}) {
  const router = useRouter();
  const listId = useId();

  const [product, setProduct] = useState<"flights" | "hotels">(initial?.product ?? "flights");
  const [trip, setTrip] = useState<"oneway" | "round">(initial?.trip ?? "oneway");
  const [from, setFrom] = useState(initial?.from || "Ahmedabad (AMD)");
  const [to, setTo] = useState(initial?.to ?? "");
  const [depart, setDepart] = useState(initial?.depart ?? "");
  const [ret, setRet] = useState(initial?.return ?? "");

  const [adults, setAdults] = useState(Number(initial?.adults) || 1);
  const [children, setChildren] = useState(Number(initial?.children) || 0);
  const [infants, setInfants] = useState(Number(initial?.infants) || 0);
  const [cabin, setCabin] = useState<Cabin>((initial?.cabin as Cabin) || "Economy");
  const [fare, setFare] = useState<string>(initial?.fare || FARE_TYPES[0]);
  const [airline, setAirline] = useState(initial?.airline ?? "");
  const [nonStop, setNonStop] = useState(initial?.nonstop === "1");

  const [paxOpen, setPaxOpen] = useState(false);
  const [today, setToday] = useState("");
  const paxRef = useRef<HTMLDivElement>(null);

  // Prefill dates on the client to avoid SSR/hydration mismatch.
  useEffect(() => {
    setToday(iso(0));
    setDepart((d) => d || iso(14));
    setRet((r) => r || iso(21));
  }, []);

  // Close the travellers popover on outside click.
  useEffect(() => {
    if (!paxOpen) return;
    const onClick = (e: MouseEvent) => {
      if (paxRef.current && !paxRef.current.contains(e.target as Node)) setPaxOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [paxOpen]);

  const setAdultsClamped = (n: number) => {
    const a = Math.max(1, Math.min(9, n));
    setAdults(a);
    if (infants > a) setInfants(a); // 1 infant per adult, max
  };

  const paxTotal = adults + children + infants;

  const onSubmitFlights = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
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
    router.push(`/flights?${p.toString()}`);
  };

  const noteColor = overlap ? "text-muted" : "text-white/85";

  return (
    <div className={cn("relative z-20", overlap && "-mt-16")}>
      <Container>
        {/* Product tabs */}
        <div className="mx-auto mb-3 flex w-fit gap-1 rounded-full bg-white/95 p-1.5 shadow-brand-sm backdrop-blur">
          {([
            { id: "flights", label: "Flights", Icon: PlaneTakeoff },
            { id: "hotels", label: "Hotels", Icon: BedDouble },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setProduct(id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2 text-[0.9rem] font-semibold transition-colors",
                product === id ? "grad-red text-white shadow-brand-red" : "text-ink hover:text-red",
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
                <span className="mr-2 hidden text-[0.9rem] font-bold text-ink sm:inline">Book Flight</span>
                {(["oneway", "round"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrip(t)}
                    className={cn(
                      "rounded-t-lg px-4 py-2 text-[0.85rem] font-semibold transition-colors",
                      trip === t ? "bg-red/10 text-red" : "text-muted hover:text-ink",
                    )}
                  >
                    {t === "oneway" ? "One-way" : "Round-trip"}
                  </button>
                ))}
              </div>

              <form onSubmit={onSubmitFlights} aria-label="Search flights">
                <div className="relative grid lg:grid-cols-[1.1fr_1.1fr_0.9fr_0.9fr_1.1fr_auto]">
                  <span className="grad-red absolute bottom-3 left-0 top-3 hidden w-1 rounded-r-full lg:block" aria-hidden />
                  <Field label="From">
                    <label className="flex items-center gap-2">
                      <PlaneTakeoff size={17} className="flex-none text-red" aria-hidden />
                      <input
                        list={listId}
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="Ahmedabad (AMD)"
                        aria-label="From airport"
                        className={inputCls}
                      />
                    </label>
                  </Field>
                  <Field label="To">
                    <label className="flex items-center gap-2">
                      <MapPin size={17} className="flex-none text-red" aria-hidden />
                      <input
                        list={listId}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="Where to?"
                        aria-label="To airport"
                        required
                        className={inputCls}
                      />
                    </label>
                  </Field>
                  <Field label="Depart">
                    <input
                      type="date"
                      value={depart}
                      min={today || undefined}
                      onChange={(e) => setDepart(e.target.value)}
                      aria-label="Departure date"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Return" className={trip === "oneway" ? "opacity-40" : undefined}>
                    <input
                      type="date"
                      value={ret}
                      min={depart || today || undefined}
                      disabled={trip === "oneway"}
                      onChange={(e) => setRet(e.target.value)}
                      aria-label="Return date"
                      className={inputCls}
                    />
                  </Field>

                  {/* Travellers & class */}
                  <div className="relative border-b border-line lg:border-b-0 lg:border-l" ref={paxRef}>
                    <button
                      type="button"
                      onClick={() => setPaxOpen((o) => !o)}
                      className="flex w-full flex-col gap-1 px-5 py-3.5 text-left"
                      aria-expanded={paxOpen}
                    >
                      <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted">
                        Travellers &amp; class
                      </span>
                      <span className="flex items-center gap-2">
                        <Users size={17} className="flex-none text-red" aria-hidden />
                        <span className="flex-1">
                          <span className="block text-[0.95rem] font-semibold leading-tight text-ink">
                            {paxTotal} Traveller{paxTotal > 1 ? "s" : ""}
                          </span>
                          <span className="block text-[0.72rem] text-muted">{cabin}</span>
                        </span>
                        <ChevronDown size={15} className={cn("flex-none text-muted transition-transform", paxOpen && "rotate-180")} aria-hidden />
                      </span>
                    </button>

                    {paxOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-line bg-white p-4 shadow-brand lg:left-auto lg:right-0 lg:w-80">
                        <Stepper label="Adults" sub="12+ years" value={adults} onChange={setAdultsClamped} min={1} max={9} />
                        <Stepper label="Children" sub="2–12 years" value={children} onChange={(n) => setChildren(Math.max(0, Math.min(9, n)))} min={0} max={9} />
                        <Stepper label="Infants" sub="Under 2 years" value={infants} onChange={(n) => setInfants(Math.max(0, Math.min(adults, n)))} min={0} max={adults} />
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="mb-2 text-[0.72rem] font-bold uppercase tracking-wide text-muted">Cabin class</div>
                          <div className="grid grid-cols-2 gap-2">
                            {CABINS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCabin(c)}
                                className={cn(
                                  "rounded-lg border px-2 py-2 text-[0.82rem] font-semibold transition-colors",
                                  cabin === c ? "border-red bg-red/10 text-red" : "border-line text-ink hover:border-red/50",
                                )}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPaxOpen(false)}
                          className="mt-3 w-full rounded-full bg-navy py-2.5 text-[0.85rem] font-semibold text-white"
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid place-items-center p-3.5">
                    <Button type="submit" arrow fullWidth>
                      Search Flights
                    </Button>
                  </div>
                </div>

                {/* Options row */}
                <div className="flex flex-col gap-3 border-t border-line px-5 py-3.5 lg:flex-row lg:items-center lg:gap-6">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">Fare type</span>
                    {FARE_TYPES.map((f) => (
                      <label key={f} className="flex cursor-pointer items-center gap-1.5 text-[0.85rem] text-ink">
                        <input
                          type="radio"
                          name="fare"
                          checked={fare === f}
                          onChange={() => setFare(f)}
                          className="peer sr-only"
                        />
                        <span className="grid h-4 w-4 place-items-center rounded-full border-[1.6px] border-line peer-checked:border-red">
                          <span className={cn("h-2 w-2 rounded-full", fare === f ? "bg-red" : "bg-transparent")} />
                        </span>
                        {f}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:ml-auto">
                    <label className="flex items-center gap-2 text-[0.85rem] font-medium text-ink">
                      <Plane size={15} className="text-red" aria-hidden />
                      <select
                        value={airline}
                        onChange={(e) => setAirline(e.target.value)}
                        aria-label="Preferred airline"
                        className="cursor-pointer bg-transparent font-semibold text-ink outline-none"
                      >
                        {AIRLINES.map((a) => (
                          <option key={a.code} value={a.code}>{a.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[0.85rem] font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={nonStop}
                        onChange={(e) => setNonStop(e.target.checked)}
                        className="h-4 w-4 accent-red"
                      />
                      Non-stop only
                    </label>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <HotelsPanel />
          )}
        </div>

        <p className={cn("mt-3 flex items-center justify-center gap-1.5 text-center text-[0.8rem]", noteColor)}>
          <ArrowRightLeft size={13} aria-hidden />
          {product === "flights"
            ? "Live fares across 500+ airlines, powered by our booking system."
            : "Live hotel rates for popular destinations, powered by our booking system."}
        </p>
      </Container>

      <datalist id={listId}>
        {AIRPORTS.map((a) => (
          <option key={a.code} value={`${a.city} (${a.code})`}>
            {a.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function HotelsPanel() {
  const router = useRouter();
  const cityListId = useId();
  const [city, setCity] = useState("");
  const [suggestions, setSuggestions] = useState<HotelCity[]>(POPULAR_CITIES);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(iso(0));
    setCheckIn((d) => d || iso(14));
    setCheckOut((d) => d || iso(16));
  }, []);

  // Debounced destination autocomplete against the full TBO city dataset.
  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) {
      setSuggestions(POPULAR_CITIES);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/hotels/cities?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j) => j?.cities?.length && setSuggestions(j.cities))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [city]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    // Selecting a datalist option leaves its label in the input — map it back to
    // its TBO CityCode. Unmatched free text is resolved server-side.
    const q = city.trim().toLowerCase();
    const match =
      suggestions.find((c) => c.label.toLowerCase() === q) ||
      POPULAR_CITIES.find((c) => c.label.toLowerCase() === q) ||
      (q.length > 1 ? suggestions.find((c) => c.label.toLowerCase().startsWith(q)) : undefined);
    const p = new URLSearchParams();
    p.set("city", match ? match.cityCode : city.trim());
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    p.set("rooms", "1");
    p.set("adults", "2");
    router.push(`/hotels?${p.toString()}`);
  };

  return (
    <form onSubmit={search} aria-label="Hotel search">
      <div className="flex items-center gap-2 border-b border-line px-5 pb-3 pt-4">
        <span className="text-[0.9rem] font-bold text-ink">Find a Hotel</span>
      </div>
      <div className="relative grid lg:grid-cols-[1.6fr_1fr_1fr_1.1fr_auto]">
        <span className="grad-red absolute inset-y-0 left-0 hidden w-[6px] lg:block" aria-hidden />
        <Field label="Destination">
          <label className="flex items-center gap-2">
            <MapPin size={17} className="flex-none text-red" aria-hidden />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (e.g. Delhi, Mumbai, Dubai)"
              aria-label="Hotel destination"
              list={cityListId}
              className={inputCls}
            />
          </label>
          <datalist id={cityListId}>
            {suggestions.map((c) => (
              <option key={c.cityCode} value={c.label} />
            ))}
          </datalist>
        </Field>
        <Field label="Check-in">
          <div className="flex items-center gap-2">
            <CalendarDays size={17} className="flex-none text-red" aria-hidden />
            <input type="date" value={checkIn} min={today || undefined} onChange={(e) => setCheckIn(e.target.value)} aria-label="Check-in date" className={inputCls} />
          </div>
        </Field>
        <Field label="Check-out">
          <div className="flex items-center gap-2">
            <CalendarDays size={17} className="flex-none text-red" aria-hidden />
            <input type="date" value={checkOut} min={checkIn || today || undefined} onChange={(e) => setCheckOut(e.target.value)} aria-label="Check-out date" className={inputCls} />
          </div>
        </Field>
        <Field label="Guests & rooms">
          <div className="flex items-center gap-2">
            <BedDouble size={17} className="flex-none text-red" aria-hidden />
            <span className="text-[0.95rem] font-semibold text-ink">2 Guests · 1 Room</span>
          </div>
        </Field>
        <div className="grid place-items-center p-3.5">
          <Button type="submit" arrow fullWidth>
            Search Hotels
          </Button>
        </div>
      </div>
    </form>
  );
}
