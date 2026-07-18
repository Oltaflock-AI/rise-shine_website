import type { ReactNode } from "react";
import { PageHero } from "./PageHero";
import { Container } from "../ui/Container";

/**
 * Shared layout for policy / legal pages (Terms, Refund, Privacy).
 * Renders the standard navy hero, a "last updated" line, and a
 * comfortably-measured prose column for the policy body.
 */
export function LegalPage({
  title,
  crumb,
  lastUpdated,
  photoId,
  children,
}: {
  title: string;
  crumb: string;
  lastUpdated: string;
  photoId: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero crumb={crumb} photoId={photoId} title={title} />

      <section className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl">
            <p className="mb-10 text-[0.9rem] font-medium text-muted">
              Last updated on {lastUpdated}
            </p>
            <div className="legal-prose space-y-5 text-ink-soft">{children}</div>
          </div>
        </Container>
      </section>
    </>
  );
}
