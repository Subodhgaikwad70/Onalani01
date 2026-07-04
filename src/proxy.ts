import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isAdminRole } from "@/lib/auth/roles";

/**
 * Proxy (formerly middleware in Next.js < 16). Runs before every matched
 * request. Two responsibilities:
 *
 *   1. Refresh the Supabase session cookie if it's about to expire.
 *   2. Block protected URL prefixes by role:
 *        /account/*  -> any authenticated user
 *        /admin/*    -> admin or super_admin
 *        /api/admin/* -> admin or super_admin
 *        /api/guests/me/* -> any authenticated user
 *
 * Per the Next.js 16 docs, do NOT rely on this as the only authorization layer
 * — always re-check inside Server Functions/Route Handlers (see lib/auth/guards.ts).
 */

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options as CookieOptions);
        }
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError &&
    (authError.code === "refresh_token_not_found" ||
      authError.message.includes("Refresh Token"))
  ) {
    await supabase.auth.signOut();
  }

  const { pathname } = request.nextUrl;
  let role =
    (user?.app_metadata?.role as string | undefined) ?? (user ? "guest" : undefined);

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      profile?.role === "admin" ||
      profile?.role === "super_admin" ||
      profile?.role === "guest"
    ) {
      role = profile.role;
    }
  }

  const requireAuthenticated = () => {
    if (!user) return redirectToLogin(request);
    return null;
  };

  const requireStaff = () => {
    if (!user) return redirectToLogin(request);
    if (!isAdminRole(role)) return forbidden(request);
    return null;
  };

  if (pathname.startsWith("/api/admin/")) {
    const block = requireStaff();
    if (block) return block;
  } else if (pathname.startsWith("/api/guests/me")) {
    const block = requireAuthenticated();
    if (block) return block;
  } else if (pathname.startsWith("/admin")) {
    const block = requireStaff();
    if (block) return block;
  } else if (pathname.startsWith("/account")) {
    const block = requireAuthenticated();
    if (block) return block;
  }

  return response;
}

function redirectToLogin(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(
      JSON.stringify({ error: { message: "Authentication required" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/auth/login";
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(
      JSON.stringify({ error: { message: "Forbidden" } }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/403";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/guests/:path*",
  ],
};
