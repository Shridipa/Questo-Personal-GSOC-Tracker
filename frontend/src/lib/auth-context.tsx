"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<{ error: Error | null }>;
  signUp: (credentials: { email: string; password: string }) => Promise<{
    error: Error | null;
    needsEmailVerification: boolean;
  }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // Start finished when Supabase is unconfigured: there is no session to restore.
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    // 1. Restore persistent session on initial app startup
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      })
      .catch((error) => {
        console.warn("Failed to restore Supabase session on startup:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });

    // 2. Listen to ongoing auth events (token refreshed, signed in, signed out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error(
          "Supabase is not configured yet. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables.",
        ),
      };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error };
      setSession(data.session);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign in";
      return { error: new Error(message) };
    }
  }, []);

  const signUp = useCallback(async ({ email, password }: { email: string; password: string }) => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error(
          "Supabase is not configured yet. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables.",
        ),
        needsEmailVerification: false,
      };
    }
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      if (error) return { error, needsEmailVerification: false };

      // If Supabase requires email verification, session will be null
      const needsEmailVerification = Boolean(data.user && !data.session);
      return { error: null, needsEmailVerification };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create account";
      return { error: new Error(message), needsEmailVerification: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setUser(null);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Server sign out failed, clearing local session:", err);
    } finally {
      setSession(null);
      setUser(null);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error(
          "Supabase is not configured yet. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        ),
      };
    }
    try {
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      return { error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to request password reset";
      return { error: new Error(message) };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error("Supabase is not configured yet."),
      };
    }
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update password";
      return { error: new Error(message) };
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      return {
        error: new Error("Supabase is not configured yet."),
      };
    }
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });
      return { error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend verification email";
      return { error: new Error(message) };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        resendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
