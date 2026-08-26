import { redirect } from "next/navigation";
import { CallsProvider } from "@/lib/useCalls";
import { Sidebar } from "@/components/Sidebar";
import { getViewer } from "@/lib/session";

// The gate reads the session cookie, so this segment must never be prerendered
// — a keyless build would otherwise bake a "signed in" shell into static HTML.
export const dynamic = "force-dynamic";

// Dashboard chrome: a sticky sidebar + scrollable main area, with one shared
// live-data provider feeding every tab. Signed-out (or never-granted) visitors
// are sent to /login before any data renders; the API routes enforce the same
// thing again server-side, so this redirect is UX, not the security boundary.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return (
    <CallsProvider>
      <div className="shell">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </CallsProvider>
  );
}
