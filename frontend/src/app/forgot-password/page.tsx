"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function ForgotPasswordPage() {
  const { resetPassword, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    await resetPassword(cleanEmail);
    setLoading(false);
    // Always show generic success state to prevent account enumeration
    setSubmitted(true);
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
          <KeyRound size={40} className="verify-icon" />
        </div>

        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          Enter the email associated with your Questo account and we&apos;ll send a secure password reset link.
        </p>

        {!isConfigured && (
          <div className="auth-notice-box" role="alert">
            <strong>Configuration note:</strong> Supabase credentials must be configured for password reset emails.
          </div>
        )}

        {error && (
          <div className="auth-error-box" role="alert">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="auth-submitted-block">
            <div className="auth-success-box" role="status">
              <Check size={16} /> If an account exists for <strong>{email}</strong>, a password reset link has been dispatched to your inbox.
            </div>
            <p className="auth-tip">
              Check your spam or junk folder if the email does not appear in a few minutes.
            </p>
            <Link href="/login" className="button button-primary auth-submit-btn">
              <ArrowLeft size={16} /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="reset-email">Email address</label>
              <div className="input-icon-wrapper">
                <Mail size={18} className="input-icon" aria-hidden="true" />
                <input
                  id="reset-email"
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

            <button
              type="submit"
              className="button button-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Sending link..." : "Send reset link"} <ArrowRight size={17} />
            </button>
          </form>
        )}

        <div className="auth-footer">
          <Link href="/login" className="auth-link-back">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
