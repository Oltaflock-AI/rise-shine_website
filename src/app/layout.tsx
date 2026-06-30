import type { Metadata } from "next";
import { Roboto, Dancing_Script } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloat } from "@/components/layout/WhatsAppFloat";
import { site } from "@/data/site";
import { cn } from "@/lib/cn";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});

const dancing = Dancing_Script({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-dancing",
  display: "swap",
});

const description =
  "Rise & Shine Travels — Ahmedabad's trusted travel house since 2009. Handcrafted domestic, international & cruise holidays, flights, hotels, visas and custom tours, all from one team.";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — Handcrafted Holidays from Ahmedabad`,
    template: `%s · ${site.name}`,
  },
  description,
  applicationName: site.name,
  keywords: [
    "travel agency Ahmedabad",
    "tour packages",
    "honeymoon packages",
    "international holidays",
    "domestic tour packages",
    "cruise holidays",
    "flight booking",
    "visa services",
    "Rise & Shine Travels",
  ],
  authors: [{ name: site.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: site.name,
    url: site.url,
    title: `${site.name} — Handcrafted Holidays from Ahmedabad`,
    description,
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: site.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — Handcrafted Holidays from Ahmedabad`,
    description,
    images: ["/brand/og.png"],
  },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon.png", sizes: "256x256", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  name: site.name,
  legalName: site.legalName,
  url: site.url,
  image: `${site.url}/brand/og.png`,
  logo: `${site.url}/brand/logo.png`,
  description,
  telephone: site.phone.landlineHref.replace("tel:", ""),
  email: site.email,
  priceRange: "₹₹",
  foundingDate: String(site.established),
  vatID: site.gstin,
  address: {
    "@type": "PostalAddress",
    streetAddress: `${site.address.line1}, ${site.address.line2}`,
    addressLocality: site.address.city,
    addressRegion: site.address.region,
    postalCode: site.address.postalCode,
    addressCountry: "IN",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: site.address.geo.lat,
    longitude: site.address.geo.lng,
  },
  openingHours: "Mo-Sa 10:00-19:00",
  sameAs: [
    site.socials.facebook,
    site.socials.instagram,
    site.socials.youtube,
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn(roboto.variable, dancing.variable, "antialiased")}
    >
      <body className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <WhatsAppFloat />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
