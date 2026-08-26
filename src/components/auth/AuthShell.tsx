import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";

/**
 * The two-column frame every auth screen sits in — log in, sign up, forgot
 * password, choose a new password.
 *
 * Extracted so the four screens cannot drift. They are visited in sequence by
 * someone who is already slightly annoyed (they have forgotten a password), and
 * a layout that shifts between steps reads as a broken or spoofed flow.
 */
export const inputWrap =
  "flex items-center gap-2.5 rounded-xl border border-line bg-cream/60 px-4 focus-within:border-red focus-within:bg-white transition-colors";
export const inputCls =
  "w-full bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-muted/70";

const PROMISES = [
  "Book flights & hotels with saved traveller details",
  "Track your enquiries and trips in one place",
  "Faster checkout when you're ready to pay",
];

export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-cream pb-16 pt-28 sm:pt-32">
      <Container>
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-brand-lg border border-line bg-white shadow-brand lg:grid-cols-2">
          {/* Brand panel */}
          <div className="grad-navy relative hidden flex-col justify-between p-10 lg:flex">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 12%, rgba(226,30,38,0.5), transparent 45%)",
              }}
              aria-hidden
            />
            <Image
              src="/brand/logo-white.png"
              alt="Rise & Shine Travels"
              width={200}
              height={75}
              className="relative h-11 w-auto self-start"
            />
            <div className="relative">
              <p className="text-script text-3xl text-white/90">Welcome aboard</p>
              <h2 className="mt-2 text-[1.9rem] font-extrabold leading-tight text-white">
                Your journeys, all in one account.
              </h2>
              <ul className="mt-6 space-y-3 text-[0.95rem] text-white/85">
                {PROMISES.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <ShieldCheck size={18} className="mt-0.5 flex-none text-white" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-meta text-white/60">
              Ahmedabad&apos;s trusted travel house · Est. 2011
            </p>
          </div>

          {/* Form column */}
          <div className="p-8 sm:p-10">
            <h1 className="h-md">{title}</h1>
            <p className="mt-2 text-[0.95rem] text-muted">{intro}</p>
            {children}
          </div>
        </div>
      </Container>
    </section>
  );
}
