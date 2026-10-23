"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GitBranch,
  Lock,
  Mail,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function getPasswordStrength(pw: string): { score: number; label: string; cls: string } {
  if (!pw) return { score: 0, label: "", cls: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: "Weak", cls: "weak" };
  if (score === 2) return { score: 2, label: "Fair", cls: "fair" };
  if (score === 3) return { score: 3, label: "Good", cls: "good" };
  return { score: 4, label: "Strong", cls: "strong" };
}

export default function SignupPage() {
  const router = useRouter();
  const { signUp, isConfigured, user, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);

  // Already authenticated visitors skip the sign-up form entirely.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
      router.refresh();
    }
  }, [authLoading, user, router]);

  if (!authLoading && user) {
    return (
      <div aria-label="Taking you to your dashboard" className="lp-splash" role="status">
        <Image alt="Questo bird logo" height={386} src="/icons/questo-phoenix.png" width={579} />
        <span>Already signed in — heading to your dashboard…</span>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    const { error: signUpError, needsEmailVerification } = await signUp({
      email: cleanEmail,
      password,
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message || "Failed to create account. Please try again.");
      return;
    }

    if (needsEmailVerification) {
      router.push(`/verify-email?email=${encodeURIComponent(cleanEmail)}`);
    } else {
      router.push("/");
      router.refresh();
    }
  };

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
            Start your next
            <br />
            <span>chapter</span>.
          </h2>
          <p className="auth-panel-sub">
            Build skills, complete meaningful quests, and prepare for your next open-source
            opportunity.
          </p>

          <div className="auth-panel-stats">
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <GitBranch size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Contribute to open source</strong>
                <span>Structured path from zero to contributor</span>
              </div>
            </div>
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <Trophy size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Track XP &amp; milestones</strong>
                <span>Cloud-backed progress, always in sync</span>
              </div>
            </div>
            <div className="auth-stat-pill">
              <div className="auth-stat-icon">
                <Star size={16} aria-hidden="true" />
              </div>
              <div className="auth-stat-copy">
                <strong>Weekly reviews</strong>
                <span>Reflect, improve, and stay on track</span>
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
            <span className="auth-badge new-account">
              <Sparkles size={12} aria-hidden="true" /> New journey
            </span>
          </div>

          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            Sync your GSoC prep, daily quests, XP, and weekly reflections across all your devices.
          </p>

          {!isConfigured && (
            <div className="auth-notice-box" role="alert">
              <strong>Setup needed:</strong> Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable cloud accounts.
            </div>
          )}

          {error && (
            <div className="auth-error-box" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="signup-email">Email address</label>
              <div className="input-icon-wrapper">
                <Mail size={17} className="input-icon" aria-hidden="true" />
                <input
                  id="signup-email"
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
              <label htmlFor="signup-password">Password</label>
              <div className="input-icon-wrapper">
                <Lock size={17} className="input-icon" aria-hidden="true" />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  disabled={loading}
                  aria-describedby="password-strength-label"
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
              {password && (
                <div className="password-strength" aria-live="polite">
                  <div className="password-strength-bar" role="presentation">
                    {[1, 2, 3, 4].map((seg) => (
                      <div
                        key={seg}
                        className={`strength-segment${strength.score >= seg ? ` filled-${strength.cls}` : ""}`}
                      />
                    ))}
                  </div>
                  <span
                    id="password-strength-label"
                    className={`password-strength-label ${strength.cls}`}
                  >
                    {strength.label} password
                  </span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm-password">Confirm password</label>
              <div className="input-icon-wrapper">
                <Lock size={17} className="input-icon" aria-hidden="true" />
                <input
                  id="signup-confirm-password"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <ul className="auth-perks-list" aria-label="What you get with an account">
              <li>
                <CheckCircle2 size={13} className="perk-icon" aria-hidden="true" />
                Access your quests and streaks on phone &amp; desktop
              </li>
              <li>
                <CheckCircle2 size={13} className="perk-icon" aria-hidden="true" />
                Cloud backup for milestones, XP, and weekly reviews
              </li>
            </ul>

            <button
              type="submit"
              id="signup-submit"
              className="button button-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create account"}{" "}
              {!loading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{" "}
              <Link href="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
