# Rise & Shine Travels — Website

Marketing website for **Rise & Shine Travels** (Ahmedabad, est. 2009). Built to be
fast, SEO-optimized, on-brand, and easy to extend with the flight/hotel booking
and AI itinerary features planned for later.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** — SSR/SSG for SEO, file-based routing
- **Tailwind CSS v4** — brand design tokens in `src/app/globals.css` (`@theme`)
- **next/font** — Roboto (UI/body) + Dancing Script (script accent)
- **lucide-react** — SVG icon set (no emoji)
- Deploy target: **Vercel**

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (type-check + static generation)
npm start        # serve the production build
```

## Pages

`/` · `/about` · `/packages` (+ `/packages/domestic|international|cruise`) ·
`/services` · `/contact` · `/plan-my-trip` · `/itinerary` (reserved placeholder).
Plus `sitemap.xml`, `robots.txt`, JSON-LD `TravelAgency` schema, and per-page metadata.

## Project structure

```
src/
  app/            routes (one folder per page) + layout, sitemap, robots, not-found
  components/
    layout/       Header, Footer, WhatsAppFloat
    sections/     Hero, SearchBar, Marquee, page sections, PageHero, CTABand …
    ui/           Button, Icon, PackageCard, ServiceCard, Reveal, Counter …
    forms/        ContactForm, PlanTripForm, shared controls
  data/           ← EDIT CONTENT HERE (site, packages, services, content,
                    testimonials, accreditations)
  lib/            actions (form handler stub), cn helper
public/brand/     logo (red + white), favicon, OG image
reference/        source material + TBO API notes — git-ignored, NOT deployed
```

## Editing content

All copy/data is centralized in `src/data/`:

- **Business info / contact / nav** → `src/data/site.ts`
- **Itineraries** → `src/data/packages.ts` (currently representative **placeholders**;
  drop in real itineraries here — no component changes needed)
- **Services, testimonials, stats, values** → respective files in `src/data/`

## Brand

Palette and type come from the official brand guideline:
red `#E21E26`, deep red `#8D191C`, navy `#083249`, charcoal `#404041`,
silver `#C6C5C6`, page `#F7F8F9`; fonts **Roboto** + **Dancing Script**.
Tokens live in `src/app/globals.css`.

## Planned integrations (not built yet — space reserved)

- **TBO flight + hotel booking.** The home search bar is a placeholder that routes
  to `/plan-my-trip`. When wiring TBO, add route handlers under `src/app/api/…`
  reading credentials from `.env.local` (server-side only) and swap the search
  submit handler. Flow, endpoints and reference data are documented in
  `reference/api-setup/` (contains **live credentials — keep git-ignored**).
- **AI itinerary generator** (~later). Reserved at `/itinerary` (currently a
  "coming soon" placeholder, noindex).

## Notes

- Marketing photos currently load from Unsplash (configured in `next.config.ts`).
  Localize into `public/` before launch for full performance control.
- Form submissions are validated and acknowledged by a server-action stub
  (`src/lib/actions.ts`); wire it to email/CRM where marked `TODO`.
- Confirm the official social media URLs in `src/data/site.ts` (`socials`).
