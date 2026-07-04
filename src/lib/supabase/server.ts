import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Cookie-aware Supabase client for use inside Server Components, Server Actions,
 * and Route Handlers. Authenticates as the logged-in user via Supabase session
 * cookies; respects RLS.
 *
 * Notes:
 * - In Next.js 16, `cookies()` is async — we await it once and pass the store
 *   into the cookie adapter.
 * - When called inside a pure Server Component (no response writer), `set` is a
 *   no-op; @supabase/ssr's `setAll` swallows the error in that case.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // Server Component context — cookie writes are not allowed there.
          // The browser already has the latest session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Returns the current authenticated user (or null) using the SSR session client.
 * Uses `getUser()` so the JWT is verified against the Supabase server (do NOT
 * rely on `getSession()` for auth checks — the cookie is untrusted).
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
