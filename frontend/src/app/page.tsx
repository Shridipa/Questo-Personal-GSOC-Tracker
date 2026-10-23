"use client";

import Image from "next/image";
import { HomeDashboard } from "@/components/questline/home-dashboard";
import { LandingPage } from "@/components/landing/landing";
import { useAuth } from "@/lib/auth-context";

function AuthSplash() {
  return (
    <div aria-label="Loading Questo" className="lp-splash" role="status">
      <Image alt="Questo bird logo" height={386} src="/icons/questo-phoenix.png" width={579} />
      <span>Loading your journey…</span>
    </div>
  );
}

/**
 * `/` is Questo's public entry point:
 * - session resolving  → branded splash (no protected or marketing flash)
 * - signed in          → the existing dashboard ("My path")
 * - guest              → the public landing page
 */
export default function HomePage() {
  const { user, isLoading, isConfigured } = useAuth();

  if (isConfigured && isLoading) return <AuthSplash />;
  if (user) return <HomeDashboard />;
  return <LandingPage />;
}
