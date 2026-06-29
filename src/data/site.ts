/**
 * Central business / contact information (NAP) for Rise & Shine Travels.
 * Sourced from the verified agency details in reference/api-setup/apiSetup.md.
 * Edit here once — used across header, footer, contact page, and JSON-LD.
 */

export const site = {
  name: "Rise & Shine Travels",
  legalName: "Rise & Shine Co",
  tagline: "Handcrafted journeys from Ahmedabad to the world.",
  established: 2009,
  // Public site URL — update to the real domain before launch.
  url: "https://www.riseandshinetravel.com",
  gstin: "24AAXFR7477D1ZL",

  email: "info@riseandshinetravel.com",

  // Landline (Ahmedabad) + mobile / WhatsApp
  phone: {
    landlineDisplay: "+91 79 2329 7232",
    landlineHref: "tel:+917923297232",
    mobileDisplay: "+91 97255 97232",
    mobileHref: "tel:+919725597232",
    whatsapp: "919725597232",
    whatsappHref: "https://wa.me/919725597232",
  },

  address: {
    line1: "404, 4th Floor, Setu Square Complex",
    line2: "Opp. Sona Cross Road, New C G Road, Chandkheda",
    city: "Ahmedabad",
    region: "Gujarat",
    postalCode: "382424",
    country: "India",
    full: "404, 4th Floor, Setu Square Complex, Opp. Sona Cross Road, New C G Road, Chandkheda, Ahmedabad-382424, Gujarat (India)",
    geo: { lat: 23.1088, lng: 72.5892 },
    // Keyless Google Maps embed pinned to the office coordinates (reliable, no API key).
    mapEmbed:
      "https://maps.google.com/maps?q=23.1088,72.5892&z=15&output=embed",
  },

  hours: "Monday – Saturday · 10:00 AM – 7:00 PM",

  // TODO: confirm official social handles with the client.
  socials: {
    facebook: "https://www.facebook.com/riseandshinetravels",
    instagram: "https://www.instagram.com/riseandshinetravels",
    youtube: "https://www.youtube.com/@riseandshinetravels",
    whatsapp: "https://wa.me/919725597232",
  },
} as const;

export type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};

export const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  {
    label: "Packages",
    href: "/packages",
    children: [
      { label: "Domestic Escapes", href: "/packages/domestic" },
      { label: "International", href: "/packages/international" },
      { label: "Cruises", href: "/packages/cruise" },
    ],
  },
  { label: "Services", href: "/services" },
  { label: "Contact", href: "/contact" },
];
