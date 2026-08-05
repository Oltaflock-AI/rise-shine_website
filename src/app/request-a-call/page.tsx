import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { SectionHeading } from "@/components/sections/SectionHeading";
import { Container } from "@/components/ui/Container";
import { InfoCard } from "@/components/ui/InfoCard";
import { Reveal } from "@/components/ui/Reveal";
import { CallbackForm } from "@/components/forms/CallbackForm";
import { callbackDelayPhrase } from "@/lib/callback-delay";
import { site } from "@/data/site";

// Rendered per request so the stated wait always matches the queue's actual
// VOICE_CALLBACK_DELAY_SECONDS. Changing that env var takes effect immediately
// in the action; a statically-built page would keep promising the old number.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request a Call",
  description:
    "Leave your name and mobile number and a Rise & Shine Travels expert will call you back within minutes to plan your trip.",
  alternates: { canonical: "/request-a-call" },
};

export default function RequestACallPage() {
  const delay = callbackDelayPhrase();

  return (
    <>
      <PageHero
        crumb="Request a Call"
        photoId="photo-1503220317375-aaad61436b1b"
        title="We'll call you back"
        subtitle={`Share your name and number — a travel expert rings you in ${delay}, ready to plan your journey.`}
      />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <SectionHeading
                eyebrow="How it works"
                title="No queues, no hold music"
                className="mb-6"
              />
              <div className="flex flex-col gap-4">
                <InfoCard icon="users" title="1. Tell us who to call">
                  Just your name and mobile number — that&apos;s the whole form.
                </InfoCard>
                <InfoCard icon="clock" title={`2. We ring you in ${delay}`}>
                  Keep your phone nearby. Your callback is placed automatically,
                  so there&apos;s nothing else for you to do.
                </InfoCard>
                <InfoCard icon="compass" title="3. Plan your trip on the call">
                  Tell us where you&apos;d like to go, when, and who&apos;s
                  travelling. We&apos;ll take it from there.
                </InfoCard>
                <InfoCard icon="phoneCall" title="Prefer to call us instead?">
                  <a href={site.phone.mobileHref}>{site.phone.mobileDisplay}</a>{" "}
                  ·{" "}
                  <a href={site.phone.landlineHref}>
                    {site.phone.landlineDisplay}
                  </a>
                  <br />
                  {site.hours}
                </InfoCard>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <CallbackForm delayPhrase={delay} />
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}
