import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="grad-navy flex min-h-dvh items-center text-white">
      <Container className="text-center">
        <p className="text-script text-3xl text-silver">Lost your way?</p>
        <h1 className="h-xl mt-1 text-white">404</h1>
        <p className="mx-auto mt-4 max-w-md text-white/80">
          We couldn&apos;t find that page. Let&apos;s get you back on the journey.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3.5">
          <Button href="/" arrow>
            Back home
          </Button>
          <Button href="/packages" variant="light">
            Browse packages
          </Button>
        </div>
      </Container>
    </section>
  );
}
