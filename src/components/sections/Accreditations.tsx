import { accreditations } from "@/data/accreditations";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { Reveal } from "../ui/Reveal";
import { cn } from "@/lib/cn";

export function Accreditations({ soft = false }: { soft?: boolean }) {
  return (
    <section className={cn("py-16", soft && "bg-cream-2")}>
      <Container className="text-center">
        <Eyebrow center>Recognised &amp; accredited</Eyebrow>
        <h2 className="h-md mb-8">A proud member of</h2>
        <Reveal>
          <div className="flex flex-wrap justify-center gap-4">
            {accreditations.map((a) => (
              <span
                key={a}
                className="rounded-2xl border border-line bg-white px-7 py-4 font-bold text-navy shadow-brand-sm transition-all duration-200 hover:-translate-y-1 hover:text-red hover:shadow-brand"
              >
                {a}
              </span>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
