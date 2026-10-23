import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project.supabase.co") &&
    !supabaseAnonKey.includes("your-anon-key"),
);

// Fallback dummy URL/key to prevent initialization crash when env vars are pending
const validUrl = isSupabaseConfigured && supabaseUrl ? supabaseUrl : "https://placeholder-project.supabase.co";
const validKey = isSupabaseConfigured && supabaseAnonKey ? supabaseAnonKey : "placeholder-anon-key";

/**
 * Shared Supabase client configured for persistent sessions across page reloads,
 * browser restarts, and mobile PWA launches.
 */
export const supabase: SupabaseClient = createClient(validUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
