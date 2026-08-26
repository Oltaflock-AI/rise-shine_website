import type { Metadata } from "next";
import { Roboto, Dancing_Script } from "next/font/google";
import "./globals.css";

// Same two families as the main site (src/app/layout.tsx): Roboto carries the
// UI, Dancing Script is the script accent from the wordmark. Both variable
// faces, so weights render as authored.
const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rise & Shine Travel — AI Voice Sales Engine",
  description:
    "Place an AI voice call to a travel lead and watch the qualified details land in the dashboard. Powered by Oltaflock.",
  icons: { icon: [{ url: "/brand/favicon-32.png" }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${roboto.variable} ${dancing.variable}`}>
      <body>{children}</body>
    </html>
  );
}
