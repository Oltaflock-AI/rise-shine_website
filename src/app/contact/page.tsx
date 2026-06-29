import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { Container } from "@/components/ui/Container";
import { InfoCard } from "@/components/ui/InfoCard";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm } from "@/components/forms/ContactForm";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Talk to a real travel expert at Rise & Shine Travels, Chandkheda, Ahmedabad. Call, email or send us a message and we'll respond promptly.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        crumb="Contact"
        photoId="photo-1503220317375-aaad61436b1b"
        title="Let's talk travel"
        subtitle="We'd love to help plan your next journey. Reach out and a real travel expert will respond promptly."
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <SectionHeading
                eyebrow="Contact info"
                title="Talk to a real travel expert"
                className="mb-6"
              />
              <div className="flex flex-col gap-4">
                <InfoCard icon="mapPin" title="Visit our office">
                  {site.address.full}
                </InfoCard>
                <InfoCard icon="phoneCall" title="Call us">
                  <a href={site.phone.landlineHref}>
                    {site.phone.landlineDisplay}
                  </a>{" "}
                  ·{" "}
                  <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a>
                </InfoCard>
                <InfoCard icon="mail" title="Email us">
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </InfoCard>
                <InfoCard icon="clock" title="Working hours">
                  {site.hours}
                </InfoCard>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <ContactForm />
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="bg-cream-2 py-16">
        <Container>
          <SectionHeading
            center
            eyebrow="Find us"
            title="Locate our Ahmedabad office"
            className="mb-8"
          />
          <Reveal>
            <div className="overflow-hidden rounded-brand-lg shadow-brand">
              <iframe
                src={site.address.mapEmbed}
                title="Rise & Shine Travels office location on Google Maps"
                width="100%"
                height={430}
                style={{ border: 0, display: "block" }}
                loading="lazy"
                allowFullScreen
              />
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
