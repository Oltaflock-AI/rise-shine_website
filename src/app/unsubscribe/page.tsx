import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, HelpCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { unsubscribeByToken } from "@/lib/marketing";
import { site } from "@/data/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Stop receiving offer emails from Rise & Shine Travels.",
  robots: { index: false },
};

/**
 * One click, done. No login, no "are you sure?", no survey.
 *
 * The unsubscribe happens on GET, which is normally the wrong verb for a state
 * change. It is the right one here: the alternative is a confirm button, and a
 * customer who has decided to leave and is then asked to press something else
 * reports the message as spam instead — which costs the sending domain far more
 * than a link prefetcher occasionally unsubscribing someone who can resubscribe
 * by ticking a box. Mail clients' one-click buttons use the POST endpoint at
 * /api/marketing/unsubscribe.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const done = t ? await unsubscribeByToken(t).catch(() => false) : false;

  return (
    <section className="bg-cream pb-20 pt-28 sm:pt-32">
      <Container>
        <div className="mx-auto max-w-xl rounded-brand-lg border border-line bg-white p-8 shadow-brand sm:p-10">
          {done ? (
            <>
              <CheckCircle2 size={34} className="text-red" aria-hidden />
              <h1 className="h-md mt-4">You&apos;re unsubscribed</h1>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
                We won&apos;t send you any more offers. You&apos;ll still get booking
                confirmations, tickets and refund notices for trips you book with us —
                those aren&apos;t marketing, and you need them.
              </p>
            </>
          ) : (
            <>
              <HelpCircle size={34} className="text-muted" aria-hidden />
              <h1 className="h-md mt-4">We couldn&apos;t find that link</h1>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
                It may have already been used, or the address was copied without
                its full link. Email us at{" "}
                <a
                  href={`mailto:${site.email}`}
                  className="font-semibold text-red hover:underline"
                >
                  {site.email}
                </a>{" "}
                and we&apos;ll take you off the list by hand — you don&apos;t need to
                do anything else.
              </p>
            </>
          )}

          <Link
            href="/"
            className="mt-7 inline-flex min-h-11 items-center font-semibold text-red hover:underline"
          >
            Back to riseandshinetravel.in
          </Link>
        </div>
      </Container>
    </section>
  );
}
