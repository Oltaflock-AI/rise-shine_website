"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  IndianRupee,
  Luggage,
  Plane,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { FlightCard, type BookingContext } from "./FlightCard";
import type { FlightOffer } from "@/lib/tbo";
import { site } from "@/data/site";
import { cn } from "@/lib/cn";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

type SortKey = "best" | "price" | "dur" | "dep";
type Direction = "out" | "in";

/** Sort a result list. "best" blends price (60%), journey time (30%) and stops (10%). */
function bySort(list: FlightOffer[], key: SortKey): FlightOffer[] {
  if (list.length < 2) return list;
  if (key === "price")
    return [...list].sort((a, b) => a.fareINR - b.fareINR || a.durationMin - b.durationMin);
  if (key === "dur")
    return [...list].sort((a, b) => a.durationMin - b.durationMin || a.fareINR - b.fareINR);
  if (key === "dep")
    return [...list].sort(
      (a, b) =>
        (a.segments[0]?.depTime || "").localeCompare(b.segments[0]?.depTime || "") ||
        a.fareINR - b.fareINR,
    );
  const fares = list.map((o) => o.fareINR);
  const durs = list.map((o) => o.durationMin);
  const fLo = Math.min(...fares);
  const fHi = Math.max(...fares);
  const dLo = Math.min(...durs);
  const dHi = Math.max(...durs);
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0);
  const score = (o: FlightOffer) =>
    norm(o.fareINR, fLo, fHi) * 0.6 +
    norm(o.durationMin, dLo, dHi) * 0.3 +
    Math.min(o.stops, 2) * 0.05;
  return [...list].sort((a, b) => score(a) - score(b) || a.fareINR - b.fareINR);
}

const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  menuLabel: string;
  icon: typeof Sparkles;
  /** Icon chip colors in the dropdown + Sort button. */
  chip: string;
  banner: string;
  bannerClass: string;
}[] = [
  {
    key: "best",
    label: "Best",
    menuLabel: "Best",
    icon: Sparkles,
    chip: "bg-red/10 text-red",
    banner: "Our best mix of price, journey time and stops",
    bannerClass: "border-red/15 bg-red/5 text-ink",
  },
  {
    key: "price",
    label: "Cheapest",
    menuLabel: "Cheapest first",
    icon: IndianRupee,
    chip: "bg-emerald-100 text-emerald-700",
    banner: "The cheapest price we've found",
    bannerClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  {
    key: "dur",
    label: "Fastest",
    menuLabel: "Fastest first",
    icon: Zap,
    chip: "bg-amber-100 text-amber-700",
    banner: "The quickest journeys first",
    bannerClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    key: "dep",
    label: "Departure",
    menuLabel: "Outbound: Departure time",
    icon: Clock,
    chip: "bg-sky-100 text-sky-700",
    banner: "Sorted by departure time — earliest first",
    bannerClass: "border-sky-200 bg-sky-50 text-sky-900",
  },
];

const DISPLAY_CAP = 25;
const AIRPORT_PREVIEW = 5;

function waHref(offer: FlightOffer, adults: number): string {
  const s0 = offer.segments[0];
  const sL = offer.segments[offer.segments.length - 1];
  const text = `Hi Rise & Shine! I'd like to book this flight:
${offer.airlineName} (${offer.segments.map((s) => s.flightNumber).join(" / ")})
${s0?.from} ${(s0?.depTime || "").slice(11, 16)} → ${sL?.to} ${(sL?.arrTime || "").slice(11, 16)} · ${offer.stops === 0 ? "non-stop" : `${offer.stops} stop`}
Fare ₹${inr.format(offer.fareINR)} per adult × ${adults}.
Please confirm availability and proceed to book.`;
  return `https://wa.me/${site.phone.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** "15 KG" / "1 PC" / "Included" → true; "" / "0 KG" / "No" → false. */
function hasAllowance(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (!t || t === "no" || t === "nil") return false;
  const m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) > 0 : true;
}

const minuteOfDay = (iso: string) => {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = parseInt(iso.slice(14, 16), 10);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const fmtClock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtHours = (m: number) =>
  `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`;

type OfferMeta = {
  offer: FlightOffer;
  dir: Direction;
  stopBucket: 0 | 1 | 2;
  depMin: number;
  /** Longest single connection wait, minutes (0 for non-stop). */
  maxLayoverMin: number;
  /** Intermediate airport codes. */
  layovers: string[];
  hasCabinBag: boolean;
  hasCheckedBag: boolean;
  hasBagInfo: boolean;
};

function buildMeta(offer: FlightOffer, dir: Direction): OfferMeta {
  const segs = offer.segments;
  let maxLayoverMin = 0;
  const layovers: string[] = [];
  for (let i = 1; i < segs.length; i++) {
    layovers.push(segs[i].from || segs[i - 1].to);
    const gap =
      (new Date(segs[i].depTime).getTime() - new Date(segs[i - 1].arrTime).getTime()) / 60000;
    if (Number.isFinite(gap) && gap > maxLayoverMin) maxLayoverMin = Math.round(gap);
  }
  const hasBagInfo = segs.some((s) => s.baggage || s.cabinBaggage);
  return {
    offer,
    dir,
    stopBucket: Math.min(2, Math.max(0, offer.stops)) as 0 | 1 | 2,
    depMin: minuteOfDay(segs[0]?.depTime || ""),
    maxLayoverMin,
    layovers,
    hasCabinBag: segs.length > 0 && segs.every((s) => hasAllowance(s.cabinBaggage)),
    hasCheckedBag: segs.length > 0 && segs.every((s) => hasAllowance(s.baggage)),
    hasBagInfo,
  };
}

// ── small UI pieces ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4 last:border-b-0 last:pb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[0.95rem] font-bold text-ink">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function SelectClear({
  allSelected,
  noneSelected,
  onAll,
  onClear,
}: {
  allSelected: boolean;
  noneSelected: boolean;
  onAll: () => void;
  onClear: () => void;
}) {
  const link = (active: boolean) =>
    cn(
      "text-[0.8rem] font-semibold underline-offset-4",
      active ? "text-ink underline hover:text-red" : "cursor-default text-muted/50",
    );
  return (
    <div className="mb-2.5 flex items-center gap-4">
      <button type="button" onClick={onAll} disabled={allSelected} className={link(!allSelected)}>
        Select all
      </button>
      <button type="button" onClick={onClear} disabled={noneSelected} className={link(!noneSelected)}>
        Clear all
      </button>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  fromINR,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  fromINR?: number;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4.5 w-4.5 flex-none cursor-pointer rounded accent-red"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[0.9rem] font-medium text-ink">
          {icon}
          {label}
        </span>
        {fromINR != null && (
          <span className="block text-[0.78rem] text-muted">from ₹{inr.format(fromINR)}</span>
        )}
      </span>
    </label>
  );
}

const THUMB =
  "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-red [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-red [&::-moz-range-thumb]:cursor-pointer";

function DualRange({
  min,
  max,
  step,
  value,
  onChange,
  format,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const [lo, hi] = value;
  const span = Math.max(1, max - min);
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;
  // Both thumbs pinned right → let the lower one win the pointer so the range can reopen.
  const loOnTop = lo > min + span * 0.5;
  return (
    <div>
      <div className="mb-1.5 text-[0.85rem] font-medium text-ink">
        {format(lo)} – {format(hi)}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-red"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label={`${ariaLabel} minimum`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className={cn(THUMB, loOnTop ? "z-20" : "z-10")}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label={`${ariaLabel} maximum`}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className={cn(THUMB, loOnTop ? "z-10" : "z-20")}
        />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export function FlightResultsClient({
  outbound,
  inbound,
  adults,
  trip,
  fromCity,
  toCity,
  booking,
  returnISO,
  initialSort,
}: {
  outbound: FlightOffer[];
  inbound?: FlightOffer[];
  adults: number;
  trip: "oneway" | "round";
  fromCity?: string;
  toCity: string;
  booking?: BookingContext;
  returnISO?: string;
  initialSort?: string;
}) {
  const all = useMemo(
    () => [
      ...outbound.map((o) => buildMeta(o, "out" as const)),
      ...(inbound ?? []).map((o) => buildMeta(o, "in" as const)),
    ],
    [outbound, inbound],
  );

  // Filter domain: option lists + slider bounds + "from ₹" minimums, off the raw results.
  const domain = useMemo(() => {
    const stopMin: Partial<Record<0 | 1 | 2, number>> = {};
    const airlineMap = new Map<string, { name: string; min: number }>();
    const layoverMap = new Map<string, { city: string; min: number }>();
    const cityOf = new Map<string, string>();
    let durLo = Infinity;
    let durHi = 0;
    let layHi = 0;
    let anyBagInfo = false;

    for (const m of all) {
      const o = m.offer;
      for (const s of o.segments) {
        if (s.fromCity) cityOf.set(s.from, s.fromCity);
        if (s.toCity) cityOf.set(s.to, s.toCity);
      }
      stopMin[m.stopBucket] = Math.min(stopMin[m.stopBucket] ?? Infinity, o.fareINR);
      const a = airlineMap.get(o.airlineCode);
      airlineMap.set(o.airlineCode, {
        name: o.airlineName || o.airlineCode,
        min: Math.min(a?.min ?? Infinity, o.fareINR),
      });
      for (const code of m.layovers) {
        const l = layoverMap.get(code);
        layoverMap.set(code, {
          city: cityOf.get(code) || code,
          min: Math.min(l?.min ?? Infinity, o.fareINR),
        });
      }
      durLo = Math.min(durLo, o.durationMin);
      durHi = Math.max(durHi, o.durationMin);
      layHi = Math.max(layHi, m.maxLayoverMin);
      anyBagInfo = anyBagInfo || m.hasBagInfo;
    }

    const airlines = [...airlineMap.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const layoverAirports = [...layoverMap.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => a.city.localeCompare(b.city));

    return {
      stopMin,
      airlines,
      layoverAirports,
      durLo: all.length ? Math.floor(durLo / 30) * 30 : 0,
      durHi: all.length ? Math.ceil(durHi / 30) * 30 : 0,
      layHi: Math.ceil(layHi / 30) * 30,
      anyBagInfo,
    };
  }, [all]);

  const [sort, setSort] = useState<SortKey>(
    initialSort === "dur" || initialSort === "dep" || initialSort === "price"
      ? initialSort
      : "best",
  );
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAirports, setShowAirports] = useState(false);
  const [showAllOut, setShowAllOut] = useState(false);
  const [showAllIn, setShowAllIn] = useState(false);

  const [stops, setStops] = useState<Set<number>>(() => new Set([0, 1, 2]));
  const [airlines, setAirlines] = useState<Set<string>>(
    () => new Set(domain.airlines.map((a) => a.code)),
  );
  const [layoverPorts, setLayoverPorts] = useState<Set<string>>(
    () => new Set(domain.layoverAirports.map((a) => a.code)),
  );
  const [depOut, setDepOut] = useState<[number, number]>([0, 1439]);
  const [depRet, setDepRet] = useState<[number, number]>([0, 1439]);
  const [dur, setDur] = useState<[number, number]>([domain.durLo, domain.durHi]);
  const [lay, setLay] = useState<[number, number]>([0, domain.layHi]);
  const [bagCabin, setBagCabin] = useState(false);
  const [bagChecked, setBagChecked] = useState(false);

  const nonstopOnly = stops.size === 1 && stops.has(0);
  const filtersActive =
    stops.size < 3 ||
    airlines.size < domain.airlines.length ||
    layoverPorts.size < domain.layoverAirports.length ||
    depOut[0] > 0 || depOut[1] < 1439 ||
    depRet[0] > 0 || depRet[1] < 1439 ||
    dur[0] > domain.durLo || dur[1] < domain.durHi ||
    lay[0] > 0 || lay[1] < domain.layHi ||
    bagCabin || bagChecked;

  const resetAll = () => {
    setStops(new Set([0, 1, 2]));
    setAirlines(new Set(domain.airlines.map((a) => a.code)));
    setLayoverPorts(new Set(domain.layoverAirports.map((a) => a.code)));
    setDepOut([0, 1439]);
    setDepRet([0, 1439]);
    setDur([domain.durLo, domain.durHi]);
    setLay([0, domain.layHi]);
    setBagCabin(false);
    setBagChecked(false);
  };

  const toggleIn = <T,>(set: Set<T>, v: T, on: boolean): Set<T> => {
    const next = new Set(set);
    if (on) next.add(v);
    else next.delete(v);
    return next;
  };

  const { shownOut, shownIn } = useMemo(() => {
    const passes = (m: OfferMeta) => {
      if (!stops.has(m.stopBucket)) return false;
      if (!airlines.has(m.offer.airlineCode)) return false;
      if (m.layovers.some((c) => !layoverPorts.has(c))) return false;
      const dep = m.dir === "out" ? depOut : depRet;
      if (m.depMin < dep[0] || m.depMin > dep[1]) return false;
      if (m.offer.durationMin < dur[0] || m.offer.durationMin > dur[1]) return false;
      // Layover window only constrains connecting flights — non-stops always pass.
      if (m.layovers.length > 0 && (m.maxLayoverMin < lay[0] || m.maxLayoverMin > lay[1]))
        return false;
      if (bagCabin && !m.hasCabinBag) return false;
      if (bagChecked && !m.hasCheckedBag) return false;
      return true;
    };
    const out = bySort(all.filter((m) => m.dir === "out" && passes(m)).map((m) => m.offer), sort);
    const inn = inbound
      ? bySort(all.filter((m) => m.dir === "in" && passes(m)).map((m) => m.offer), sort)
      : undefined;
    return { shownOut: out, shownIn: inn };
  }, [all, inbound, sort, stops, airlines, layoverPorts, depOut, depRet, dur, lay, bagCabin, bagChecked]);

  const minFare = (list?: FlightOffer[]) =>
    list && list.length ? Math.min(...list.map((o) => o.fareINR)) : undefined;
  const cheapestOut = minFare(shownOut);
  const cheapestIn = minFare(shownIn);
  const cheapestShown =
    trip === "round"
      ? cheapestOut != null && cheapestIn != null
        ? cheapestOut + cheapestIn
        : undefined
      : cheapestOut;

  // Leader stats per tab, off the FILTERED outbound list — what each sort would surface first.
  const tabStats = useMemo(() => {
    const mk = (k: SortKey) => {
      const top = bySort(shownOut, k)[0];
      return top ? { fare: top.fareINR, dur: top.durationMin } : undefined;
    };
    return { best: mk("best"), price: mk("price"), dur: mk("dur") } as const;
  }, [shownOut]);

  const activeOption = SORT_OPTIONS.find((o) => o.key === sort) ?? SORT_OPTIONS[0];
  const fmtDurShort = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}`;

  const stopOptions: { bucket: 0 | 1 | 2; label: string }[] = [
    { bucket: 0, label: "Direct" },
    { bucket: 1, label: "1 stop" },
    { bucket: 2, label: "2+ stops" },
  ];
  const visibleAirports = showAirports
    ? domain.layoverAirports
    : domain.layoverAirports.slice(0, AIRPORT_PREVIEW);

  const outList = showAllOut ? shownOut : shownOut.slice(0, DISPLAY_CAP);
  const inList = shownIn ? (showAllIn ? shownIn : shownIn.slice(0, DISPLAY_CAP)) : undefined;

  const filtersPanel = (
    <div
      className={cn(
        "rounded-brand-lg border border-line bg-white p-5 shadow-brand-sm",
        filtersOpen ? "block" : "hidden",
        "lg:block",
      )}
    >
      <div className="flex items-center justify-between pb-1">
        <h2 className="text-[1.05rem] font-bold text-ink">Filters</h2>
        {filtersActive && (
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1 text-[0.8rem] font-semibold text-red hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset all
          </button>
        )}
      </div>

      {domain.stopMin[0] != null && (
        <button
          type="button"
          onClick={() => setStops(nonstopOnly ? new Set([0, 1, 2]) : new Set([0]))}
          aria-pressed={nonstopOnly}
          className={cn(
            "mb-1 mt-2 flex w-full items-center justify-between rounded-full border px-4 py-2.5 text-[0.85rem] font-semibold transition-colors",
            nonstopOnly
              ? "border-red bg-red/10 text-red"
              : "border-line text-ink hover:border-red/50",
          )}
        >
          <span className="flex items-center gap-2">
            <Plane className="h-4 w-4" aria-hidden /> Non-stop only
          </span>
          <span className={cn("text-[0.78rem] font-medium", nonstopOnly ? "text-red" : "text-muted")}>
            from ₹{inr.format(domain.stopMin[0])}
          </span>
        </button>
      )}

      <Section title="Stops">
        {stopOptions
          .filter((s) => domain.stopMin[s.bucket] != null)
          .map((s) => (
            <CheckRow
              key={s.bucket}
              checked={stops.has(s.bucket)}
              onChange={(on) => setStops((prev) => toggleIn(prev, s.bucket, on))}
              label={s.label}
              fromINR={domain.stopMin[s.bucket]}
            />
          ))}
      </Section>

      {domain.airlines.length > 0 && (
        <Section title="Airlines">
          <SelectClear
            allSelected={airlines.size === domain.airlines.length}
            noneSelected={airlines.size === 0}
            onAll={() => setAirlines(new Set(domain.airlines.map((a) => a.code)))}
            onClear={() => setAirlines(new Set())}
          />
          {domain.airlines.map((a) => (
            <CheckRow
              key={a.code}
              checked={airlines.has(a.code)}
              onChange={(on) => setAirlines((prev) => toggleIn(prev, a.code, on))}
              label={a.name}
              fromINR={a.min}
            />
          ))}
        </Section>
      )}

      {domain.anyBagInfo && (
        <Section title="Baggage">
          <CheckRow
            checked={bagCabin}
            onChange={setBagCabin}
            label="Cabin bag included"
            icon={<Briefcase className="h-3.5 w-3.5 text-muted" aria-hidden />}
          />
          <CheckRow
            checked={bagChecked}
            onChange={setBagChecked}
            label="Checked bag included"
            icon={<Luggage className="h-3.5 w-3.5 text-muted" aria-hidden />}
          />
        </Section>
      )}

      <Section title="Departure times">
        <div className="space-y-4">
          <div>
            {trip === "round" && (
              <div className="mb-1 text-[0.82rem] font-semibold text-muted">Outbound</div>
            )}
            <DualRange
              min={0}
              max={1439}
              step={15}
              value={depOut}
              onChange={setDepOut}
              format={fmtClock}
              ariaLabel="Outbound departure time"
            />
          </div>
          {trip === "round" && inbound && inbound.length > 0 && (
            <div>
              <div className="mb-1 text-[0.82rem] font-semibold text-muted">Return</div>
              <DualRange
                min={0}
                max={1439}
                step={15}
                value={depRet}
                onChange={setDepRet}
                format={fmtClock}
                ariaLabel="Return departure time"
              />
            </div>
          )}
        </div>
      </Section>

      {domain.durHi > domain.durLo && (
        <Section title="Journey duration">
          <DualRange
            min={domain.durLo}
            max={domain.durHi}
            step={30}
            value={dur}
            onChange={setDur}
            format={fmtHours}
            ariaLabel="Journey duration"
          />
        </Section>
      )}

      {domain.layoverAirports.length > 0 && (
        <Section title="Layovers">
          {domain.layHi > 0 && (
            <div className="mb-4">
              <div className="mb-1 text-[0.82rem] font-semibold text-muted">Layover duration</div>
              <DualRange
                min={0}
                max={domain.layHi}
                step={30}
                value={lay}
                onChange={setLay}
                format={fmtHours}
                ariaLabel="Layover duration"
              />
            </div>
          )}
          <div className="mb-1 text-[0.82rem] font-semibold text-muted">Layover airports</div>
          <SelectClear
            allSelected={layoverPorts.size === domain.layoverAirports.length}
            noneSelected={layoverPorts.size === 0}
            onAll={() => setLayoverPorts(new Set(domain.layoverAirports.map((a) => a.code)))}
            onClear={() => setLayoverPorts(new Set())}
          />
          {visibleAirports.map((a) => (
            <CheckRow
              key={a.code}
              checked={layoverPorts.has(a.code)}
              onChange={(on) => setLayoverPorts((prev) => toggleIn(prev, a.code, on))}
              label={`${a.city} (${a.code})`}
              fromINR={a.min}
            />
          ))}
          {domain.layoverAirports.length > AIRPORT_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAirports((s) => !s)}
              className="mt-2 text-[0.85rem] font-bold text-ink underline underline-offset-4 hover:text-red"
            >
              {showAirports
                ? "Show fewer airports"
                : `Show all airports (${domain.layoverAirports.length})`}
            </button>
          )}
        </Section>
      )}

    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="lg:w-72 lg:flex-none">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={cn(
            "mb-4 flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-[0.85rem] font-semibold lg:hidden",
            filtersActive ? "border-red bg-red/10 text-red" : "border-line text-ink",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {filtersOpen ? "Hide filters" : "Filters"}
          {filtersActive && !filtersOpen ? " · on" : ""}
        </button>
        {filtersPanel}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {/* Best / Cheapest / Fastest stat tabs */}
            <div className="grid flex-1 grid-cols-3 divide-x divide-line overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand-sm">
              {(["best", "price", "dur"] as const).map((k) => {
                const opt = SORT_OPTIONS.find((o) => o.key === k)!;
                const stat = tabStats[k];
                const active = sort === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSort(k)}
                    aria-pressed={active}
                    className={cn(
                      "px-3 py-3 text-left transition-colors sm:px-5",
                      active ? "bg-navy text-white" : "hover:bg-line/30",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-[0.8rem] font-semibold",
                        active ? "text-white/70" : "text-muted",
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="block text-[1.05rem] font-bold leading-tight">
                      {stat ? `₹${inr.format(stat.fare)}` : "—"}
                    </span>
                    <span
                      className={cn(
                        "block text-[0.78rem]",
                        active ? "text-white/70" : "text-muted",
                      )}
                    >
                      {stat ? fmtDurShort(stat.dur) : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Full sort dropdown */}
            <div className="relative sm:w-48">
              <button
                type="button"
                onClick={() => setSortOpen((o) => !o)}
                aria-expanded={sortOpen}
                aria-haspopup="listbox"
                className="flex h-full w-full items-center justify-center gap-2 rounded-brand-lg border border-line bg-white px-4 py-3 text-[0.95rem] font-bold text-ink shadow-brand-sm transition-colors hover:border-red/40"
              >
                <span className={cn("grid h-6 w-6 place-items-center rounded-full", activeOption.chip)}>
                  <activeOption.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                Sort
                <ChevronDown
                  className={cn("h-4 w-4 text-muted transition-transform", sortOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {sortOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setSortOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div
                    role="listbox"
                    aria-label="Sort flights"
                    className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-brand-lg border border-line bg-white py-1.5 shadow-brand"
                  >
                    {SORT_OPTIONS.map((o) => {
                      const active = sort === o.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setSort(o.key);
                            setSortOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[0.9rem] transition-colors",
                            active ? "bg-line/30 font-bold text-ink" : "font-medium text-ink hover:bg-line/20",
                          )}
                        >
                          <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-full", o.chip)}>
                            <o.icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="flex-1">{o.menuLabel}</span>
                          {active && <Check className="h-4 w-4 flex-none text-red" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contextual banner for the active sort */}
          {shownOut.length > 0 && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2.5 rounded-brand-lg border px-4 py-3 text-[0.9rem] font-semibold",
                activeOption.bannerClass,
              )}
            >
              <activeOption.icon className="h-4 w-4 flex-none" aria-hidden />
              {activeOption.banner}
            </div>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[1.15rem] font-bold text-ink">
            {filtersActive
              ? `${shownOut.length} of ${outbound.length}`
              : `${shownOut.length}`}{" "}
            flight{shownOut.length === 1 ? "" : "s"} {trip === "round" ? "(outbound)" : ""} ·{" "}
            {fromCity} → {toCity}
          </h2>
          {cheapestShown != null && (
            <span className="text-[0.9rem] text-muted">
              from <b className="text-navy">₹{inr.format(cheapestShown)}</b>{" "}
              {trip === "round" ? "round-trip / adult" : "/ adult"}
            </span>
          )}
        </div>

        {shownOut.length === 0 ? (
          <div className="rounded-brand-lg border border-line bg-white p-8 text-center shadow-brand-sm">
            <h3 className="h-sm mb-2">No flights match these filters</h3>
            <p className="mb-5 text-muted">
              Loosen a filter or reset them all to see every result again.
            </p>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-full bg-red px-5 py-2.5 text-[0.9rem] font-semibold text-white transition-colors hover:bg-red-mid"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {outList.map((o) => (
                <FlightCard key={o.id} offer={o} enquireHref={waHref(o, adults)} booking={booking} />
              ))}
            </div>
            {shownOut.length > DISPLAY_CAP && !showAllOut && (
              <button
                type="button"
                onClick={() => setShowAllOut(true)}
                className="mt-6 w-full rounded-full border border-line py-3 text-[0.9rem] font-semibold text-ink transition-colors hover:border-red/50"
              >
                Show all {shownOut.length} flights
              </button>
            )}
          </>
        )}

        {trip === "round" && inList && (
          <>
            <h2 className="mb-6 mt-12 text-[1.15rem] font-bold text-ink">
              {filtersActive && shownIn
                ? `${shownIn.length} of ${inbound?.length ?? 0} return flights`
                : "Return"}{" "}
              · {toCity} → {fromCity}
            </h2>
            {inList.length === 0 ? (
              <p className="text-muted">No return flights match these filters.</p>
            ) : (
              <>
                <div className="space-y-4">
                  {inList.map((o) => (
                    <FlightCard
                      key={o.id}
                      offer={o}
                      enquireHref={waHref(o, adults)}
                      booking={booking && returnISO ? { ...booking, departISO: returnISO } : booking}
                    />
                  ))}
                </div>
                {shownIn && shownIn.length > DISPLAY_CAP && !showAllIn && (
                  <button
                    type="button"
                    onClick={() => setShowAllIn(true)}
                    className="mt-6 w-full rounded-full border border-line py-3 text-[0.9rem] font-semibold text-ink transition-colors hover:border-red/50"
                  >
                    Show all {shownIn.length} flights
                  </button>
                )}
                <p className="mt-4 text-[0.82rem] text-muted">
                  Fares are shown per direction. Your round-trip total combines the outbound and
                  return you choose.
                </p>
              </>
            )}
          </>
        )}

        <p className="mt-8 text-center text-[0.82rem] text-muted">
          Live fares via our booking system · prices are confirmed at the time of booking. Tap{" "}
          <b>Book</b> to confirm availability with our team.
        </p>
      </div>
    </div>
  );
}
