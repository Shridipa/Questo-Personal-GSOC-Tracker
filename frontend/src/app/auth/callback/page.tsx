"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Verifying your session...");

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setStatus("Authentication error: " + error.message);
          setTimeout(() => router.push("/login"), 2000);
          return;
        }

        if (data.session) {
          setStatus("Verified successfully! Loading your journey...");
          const next = searchParams.get("next") || "/";
          const safeNext = next.startsWith("/") ? next : "/";
          router.push(safeNext);
          router.refresh();
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        router.push("/login");
      }
    }

    void handleAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="auth-container">
      <div className="auth-card auth-callback-card">
        <Sparkles size={32} className="spin text-green" />
        <h1 className="auth-title">{status}</h1>
        <p className="auth-subtitle">Please wait while we secure your session.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-container">
          <div className="auth-card skeleton" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
