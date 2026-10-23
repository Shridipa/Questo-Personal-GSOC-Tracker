"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { ArrowRight, Eye, EyeOff, Flame, Lock, Mail, Map, Star, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/";
  const safeRedirect = redirectTarget.startsWith("/") ? redirectTarget : "/";

  const { signIn, isConfigured, user, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already authenticated visitors skip the login form entirely.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(safeRedirect);
      router.refresh();
    }
  }, [authLoading, user, router, safeRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn({ email: email.trim(), password });
    setLoading(false);

    if (signInError) {
      if (signInError.message.includes("Email not confirmed")) {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(signInError.message || "Invalid email or password. Please try again.");
      return;
    }

    router.push(safeRedirect);
    router.refresh();
  };

  if (!authLoading && user) {
    return (
      <div aria-label="Taking you to your dashboard" className="lp-splash" role="status">
        <Image alt="Questo bird logo" height={386} src="/icons/questo-phoenix.png" width={579} />
        <span>Already signed in — heading to your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="auth-split">
      {/* ── Left brand panel (desktop only) ── */}
      <aside className="auth-brand-panel" aria-hidden="true">
        <div className="auth-panel-brand">
          <Image
            alt=""
            className="auth-panel-logo"
            height={386}
            src="/icons/questo-phoenix.png"
            width={579}
          />
          <span className="auth-panel-wordmark">Questo</span>
        </div>

        <div className="auth-panel-body">
          <h2 className="auth-panel-headline">
            Welcome back to
            <br />
            your <span>journey</span>.
          </h2>
          <p className="auth-panel-sub">
            Pick up where you left off. Your quests, streaks, XP, and roadmap are waiting.
          </p>

          <div className="auth-panel-stats">
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <Target size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Daily quests</strong>
                <span>Small steps, consistent growth</span>
              </div>
            </div>
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <Flame size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Streaks &amp; XP</strong>
                <span>Track your active days and milestones</span>
              </div>
            </div>
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <Map size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Personal roadmap</strong>
                <span>Your GSoC prep plan, your pace</span>
              </div>
            </div>
          </div>
        </div>

        <p className="auth-panel-footer">Questo · your open-source adventure</p>
      </aside>

      {/* ── Right form side ── */}
      <main className="auth-form-side" id="main-content">
        <div className="auth-container">
          {/* Mobile-only brand header */}
          <div className="auth-brand">
            <Link href="/" className="brand" aria-label="Questo home">
              <span className="brand-mark">
                <Image alt="" height={386} src="/icons/questo-phoenix.png" width={579} priority />
              </span>
              <span className="brand-word">Questo</span>
            </Link>
            <span className="auth-badge">
              <Star size={12} aria-hidden="true" /> Welcome back
            </span>
          </div>

          <h1 className="auth-title">Sign in to your journey</h1>
          <p className="auth-subtitle">
            Resume your quests, streaks, and open-source roadmap from any device.
          </p>

          {!isConfigured && (
            <div className="auth-notice-box" role="alert">
              <strong>Setup needed:</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable cloud sign-in.
            </div>
          )}

          {error && (
            <div className="auth-error-box" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email address</label>
              <div className="input-icon-wrapper">
                <Mail size={17} className="input-icon" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="login-password">Password</label>
                <Link href="/forgot-password" className="auth-link-small">
                  Forgot password?
                </Link>
              </div>
              <div className="input-icon-wrapper">
                <Lock size={17} className="input-icon" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="remember-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Keep me signed in on this device</span>
              </label>
            </div>

            <button
              type="submit"
              id="login-submit"
              className="button button-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Signing in\u2026" : "Sign in"}{" "}
              {!loading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="auth-link">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-form-side">
          <div className="auth-container" style={{ opacity: 0.5 }}>
            <div className="auth-title">Loading\u2026</div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
