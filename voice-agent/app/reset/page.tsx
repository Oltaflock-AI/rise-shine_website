import { Suspense } from "react";
import ResetForm from "./ResetForm";

// The token arrives in the query string, so the form is a client component
// behind Suspense — useSearchParams opts a route into dynamic rendering and
// Next needs the boundary to build it.
export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <Suspense fallback={<main className="login-shell" />}>
      <ResetForm />
    </Suspense>
  );
}
