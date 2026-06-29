import type { Stat } from "@/data/content";
import { homeStats } from "@/data/content";
import { Container } from "../ui/Container";
import { Counter } from "../ui/Counter";
import { Reveal } from "../ui/Reveal";

export function StatsBand({ stats = homeStats }: { stats?: Stat[] }) {
  return (
    <section className="grad-navy py-16">
      <Container>
        <Reveal>
          <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[clamp(2.2rem,4.2vw,3.2rem)] font-extrabold tabular-nums text-white">
                  <Counter value={s.value} suffix={s.suffix} />
                </div>
                <div className="mt-1 text-[0.92rem] text-white/70">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
