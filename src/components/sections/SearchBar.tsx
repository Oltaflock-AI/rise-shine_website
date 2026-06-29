"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";

/**
 * PLACEHOLDER search bar. It looks like a trip search, but for now it simply
 * routes the visitor to the enquiry form (carrying the destination as a query
 * param for later use). When the TBO flights/hotels API is wired in, this
 * submit handler is swapped to perform a real search.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 border-b border-line px-6 py-4 last:border-0 lg:border-b-0 lg:[&:not(:first-child)]:border-l">
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SearchBar() {
  const router = useRouter();
  const [destination, setDestination] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = destination.trim()
      ? `?destination=${encodeURIComponent(destination.trim())}`
      : "";
    router.push(`/plan-my-trip${q}`);
  };

  return (
    <div className="relative z-20 -mt-16">
      <Container>
        <form
          onSubmit={onSubmit}
          className="relative grid overflow-hidden rounded-[22px] bg-white shadow-brand-lg lg:grid-cols-[1.4fr_1fr_1fr_auto]"
          aria-label="Plan a trip"
        >
          <span className="grad-red absolute inset-y-0 left-0 w-[6px]" aria-hidden />
          <Field label="Destination">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="flex-none text-red" aria-hidden />
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Where would you like to go?"
                aria-label="Destination"
                className="w-full bg-transparent font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
              />
            </div>
          </Field>
          <Field label="Journey type">
            <select
              defaultValue="Domestic"
              aria-label="Journey type"
              className="w-full bg-transparent font-semibold text-ink outline-none"
            >
              <option>Domestic</option>
              <option>International</option>
              <option>Cruise</option>
              <option>Honeymoon</option>
            </select>
          </Field>
          <Field label="Travellers">
            <select
              defaultValue="2 Adults"
              aria-label="Travellers"
              className="w-full bg-transparent font-semibold text-ink outline-none"
            >
              <option>1 Adult</option>
              <option>2 Adults</option>
              <option>Family (4)</option>
              <option>Group</option>
            </select>
          </Field>
          <div className="grid place-items-center p-3.5">
            <Button type="submit" arrow fullWidth>
              Plan My Trip
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
}
