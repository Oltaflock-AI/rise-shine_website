import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (formerly `middleware`) — runs on the Node.js runtime.
 *
 * Refreshes the Supabase auth session on every request (so cookies never go
 * stale) and gates protected routes server-side — no client-side flash of
 * private pages.
 *
 * Before Supabase is configured this is a no-op, so the site runs unchanged.
 * Add paths to PROTECTED as more account-only areas ship.
 */
const PROTECTED = ["/account"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() re-validates the token — do not replace with getSession().
  //
  // It is a network call to Supabase, and the proxy runs on EVERY request, so a
  // Supabase blip that throws here would 500 the whole site — including POST
  // /api/payment/order, whose caller then sees a platform error page instead of
  // JSON and can only report "could not start payment". Treat a failure as
  // "not signed in": the worst case is one redirect to /login, never a dead site.
  let user = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (e) {
    console.error("[proxy] Supabase getUser failed — treating request as signed out", e);
  }

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("redirect", path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
