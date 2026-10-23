"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);

    if (updateError) {
      setError(updateError.message || "Failed to update password. Your reset link may have expired.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/login");
    }, 2500);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <Link href="/" className="brand" aria-label="Questo home">
            <span className="brand-mark">
              <Image alt="" height={386} src="/icons/questo-phoenix.png" width={579} priority />
            </span>
            <span className="brand-word">Questo</span>
          </Link>
        </div>

        <div className="verify-icon-wrapper" aria-hidden="true">
          <ShieldCheck size={42} className="verify-icon" />
        </div>

        <h1 className="auth-title">Create new password</h1>
        <p className="auth-subtitle">
          Choose a strong password to protect your Questo account and progress.
        </p>

        {error && (
          <div className="auth-error-box" role="alert">
            {error}
          </div>
        )}

        {success ? (
          <div className="auth-submitted-block">
            <div className="auth-success-box" role="status">
              <Check size={16} /> Password updated successfully! Redirecting to sign in...
            </div>
            <Link href="/login" className="button button-primary auth-submit-btn">
              Sign in now <ArrowRight size={17} />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="new-password">New password (minimum 8 characters)</label>
              <div className="input-icon-wrapper">
                <Lock size={18} className="input-icon" aria-hidden="true" />
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <div className="input-icon-wrapper">
                <Lock size={18} className="input-icon" aria-hidden="true" />
                <input
                  id="confirm-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="button button-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Updating password..." : "Update password"} <ArrowRight size={17} />
            </button>
          </form>
        )}

        <div className="auth-footer">
          <Link href="/login" className="auth-link">
            Return to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
