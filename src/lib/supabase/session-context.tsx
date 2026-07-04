"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { readRoleFromJwt, type UserRole } from "@/lib/auth/roles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type SessionUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

type SessionContextValue = {
  session: Session | null;
  user: SessionUser | null;
  isLoading: boolean;
  /** Re-read session from cookies after server-side sign-in (API routes). */
  refreshSession: () => Promise<void>;
};

const SessionContext = React.createContext<SessionContextValue>({
  session: null,
  user: null,
  isLoading: true,
  refreshSession: async () => {},
});

export function SupabaseSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const sync = React.useCallback((s: Session | null) => {
    setSession(s);
    setIsLoading(false);
  }, []);

  const refreshSession = React.useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (
      error &&
      (error.code === "refresh_token_not_found" ||
        error.message.includes("Refresh Token"))
    ) {
      await supabase.auth.signOut();
      sync(null);
      return;
    }
    sync(data.session ?? null);
  }, [sync]);

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (
        error &&
        (error.code === "refresh_token_not_found" ||
          error.message.includes("Refresh Token"))
      ) {
        await supabase.auth.signOut();
        sync(null);
        return;
      }
      sync(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      sync(s);
    });

    return () => subscription.unsubscribe();
  }, [sync]);

  const user = React.useMemo((): SessionUser | null => {
    const u = session?.user;
    if (!u) return null;
    return {
      id: u.id,
      email: u.email ?? null,
      role: readRoleFromJwt(u),
    };
  }, [session]);

  const value = React.useMemo(
    () => ({ session, user, isLoading, refreshSession }),
    [session, user, isLoading, refreshSession],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSupabaseSession() {
  return React.useContext(SessionContext);
}
