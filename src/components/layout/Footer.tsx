import Link from "next/link";
import Image from "next/image";
import { Mail, MapPin, Phone } from "lucide-react";
import { site } from "@/data/site";
import { Container } from "../ui/Container";

const footerCols: { heading: string; links: { label: string; href: string }[] }[] =
  [
    {
      heading: "Packages",
      links: [
        { label: "Domestic Escapes", href: "/packages/domestic" },
        { label: "International", href: "/packages/international" },
        { label: "Cruises", href: "/packages/cruise" },
        { label: "All Packages", href: "/packages" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About Us", href: "/about" },
        { label: "Services", href: "/services" },
        { label: "Contact", href: "/contact" },
        { label: "Plan My Trip", href: "/plan-my-trip" },
      ],
    },
  ];

const socials: { label: string; href: string; path: string }[] = [
  {
    label: "Facebook",
    href: site.socials.facebook,
    path: "M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.33-.04-1.57-.14-2.88-.14C11.9 2 10 3.66 10 6.7v2.8H7v4h3V22h4v-8.5z",
  },
  {
    label: "Instagram",
    href: site.socials.instagram,
    path: "M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153a4.9 4.9 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.9 4.9 0 0 1-1.153 1.772 4.9 4.9 0 0 1-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.9 4.9 0 0 1-1.772-1.153 4.9 4.9 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.9 4.9 0 0 1 1.153-1.772A4.9 4.9 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  },
  {
    label: "YouTube",
    href: site.socials.youtube,
    path: "M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z",
  },
  {
    label: "WhatsApp",
    href: site.socials.whatsapp,
    path: "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.07-1.33A10 10 0 1 0 12 2z",
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-navy pt-20 text-white/70">
      <div
        className="pointer-events-none absolute -right-28 -top-36 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(226,30,38,0.28), transparent 70%)",
        }}
        aria-hidden
      />
      <Container className="relative">
        <div className="grid gap-12 pb-12 md:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1.5fr]">
          {/* About */}
          <div>
            <Link href="/" className="mb-5 inline-flex" aria-label={site.name}>
              <Image
                src="/brand/logo-white.png"
                alt={site.name}
                width={216}
                height={81}
                className="h-12 w-auto"
              />
            </Link>
            <p className="mb-6 max-w-xs text-[0.93rem] text-white/60">
              Crafting flexible, creative and genuinely memorable journeys from
              Ahmedabad to the world since {site.established}.
            </p>
            <div className="flex gap-2.5">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/8 text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-red"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width={18}
                    height={18}
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerCols.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-5 text-[1.05rem] text-white">{col.heading}</h2>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-block text-[0.93rem] text-white/65 transition-all duration-200 hover:translate-x-1 hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact */}
          <div>
            <h2 className="mb-5 text-[1.05rem] text-white">Get in touch</h2>
            <ul className="flex flex-col gap-4 text-[0.91rem] text-white/65">
              <li className="flex gap-3">
                <MapPin
                  size={18}
                  className="flex-none text-silver"
                  aria-hidden
                />
                <span>{site.address.full}</span>
              </li>
              <li className="flex gap-3">
                <Phone
                  size={18}
                  className="flex-none text-silver"
                  aria-hidden
                />
                <span className="flex flex-col">
                  <a href={site.phone.landlineHref} className="hover:text-white">
                    {site.phone.landlineDisplay}
                  </a>
                  <a href={site.phone.mobileHref} className="hover:text-white">
                    {site.phone.mobileDisplay}
                  </a>
                </span>
              </li>
              <li className="flex gap-3">
                <Mail size={18} className="flex-none text-silver" aria-hidden />
                <a href={`mailto:${site.email}`} className="hover:text-white">
                  {site.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 border-t border-white/12 py-6 text-[0.84rem] text-white/50">
          <span>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </span>
          <span>
            GSTIN {site.gstin} · {site.address.city}, {site.address.region}
          </span>
        </div>
      </Container>
    </footer>
  );
}
