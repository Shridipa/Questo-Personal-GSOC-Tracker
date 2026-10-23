"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { ArrowRight, Check, MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  const { resendVerification } = useAuth();
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!emailParam || cooldown > 0) return;
    setResending(true);
    setResendSuccess(false);

    const { error } = await resendVerification(emailParam);
    setResending(false);

    if (!error) {
      setResendSuccess(true);
      setCooldown(60); // 60s rate limit
    }
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
          <MailCheck size={44} className="verify-icon" />
        </div>

        <h1 className="auth-title">Check your inbox</h1>
        <p className="auth-subtitle">
          We&apos;ve sent a verification link to <strong>{emailParam || "your email"}</strong>.
          Click the link inside to verify your account and begin your journey.
        </p>

        {resendSuccess && (
          <div className="auth-success-box" role="status">
            <Check size={16} /> A fresh verification email has been sent! Check your spam folder if
            it doesn&apos;t arrive soon.
          </div>
        )}

        <div className="verify-action-area">
          {emailParam && (
            <button
              type="button"
              className="button button-secondary resend-btn"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
            >
              <RefreshCw size={15} className={resending ? "spin" : ""} />
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : resending
                  ? "Sending..."
                  : "Resend verification email"}
            </button>
          )}

          <Link href="/login" className="button button-primary auth-submit-btn">
            Back to sign in <ArrowRight size={17} />
          </Link>
        </div>

        <div className="auth-footer">
          <p>
            Wrong email address?{" "}
            <Link href="/signup" className="auth-link">
              Create account with another email
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-container">
          <div className="auth-card skeleton" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
