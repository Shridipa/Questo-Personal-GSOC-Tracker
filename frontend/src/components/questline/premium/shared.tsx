"use client";

import { CheckCircle2, ExternalLink, Info, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/* --------------------------------------------------------------------------
 * Shared premium UI building blocks used by the Quests, Deadlines, and
 * Weekly Review pages. All components are accessible (keyboard operable,
 * labelled, reduced-motion aware via global CSS) and sized for readability
 * (body text ≥ 16px, metadata ≥ 14px).
 * ----------------------------------------------------------------------- */

export function PageHero({
  icon,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="qo-hero">
      <div className="qo-hero-main">
        <span aria-hidden="true" className="qo-hero-icon">
          {icon}
        </span>
        <div className="qo-hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {actions && <div className="qo-hero-actions">{actions}</div>}
      </div>
      {children && <div className="qo-hero-extra">{children}</div>}
    </section>
  );
}

export function MetricTile({
  icon,
  value,
  label,
  hint,
  tone = "neutral",
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: "neutral" | "green" | "amber" | "blue";
}) {
  return (
    <article className={`qo-metric qo-metric-${tone}`}>
      <span aria-hidden="true" className="qo-metric-icon">
        {icon}
      </span>
      <strong className="qo-metric-value">{value}</strong>
      <span className="qo-metric-label">{label}</span>
      {hint && <small className="qo-metric-hint">{hint}</small>}
    </article>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="qo-progress">
      <div
        aria-label={`${label}: ${value} of ${max} (${pct}%)`}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={value}
        className="qo-progress-track"
        role="progressbar"
      >
        <span className="qo-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="qo-progress-caption">
        <strong>{pct}%</strong> {label}
      </span>
    </div>
  );
}

export type BadgeTone = "green" | "amber" | "red" | "blue" | "lavender" | "neutral";

export function StatusBadge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
}) {
  return (
    <span className={`qo-badge qo-badge-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export type ChipOption = { id: string; label: string; count?: number };

export function FilterChips({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: ChipOption[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="qo-chipset">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <button
          aria-pressed={selected === option.id}
          className={`qo-chip${selected === option.id ? " qo-chip-active" : ""}`}
          key={option.id}
          onClick={() => onSelect(option.id)}
          type="button"
        >
          {option.label}
          {option.count !== undefined && (
            <span aria-hidden="true" className="qo-chip-count">
              {option.count}
            </span>
          )}
        </button>
      ))}
    </fieldset>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="qo-empty">
      <span aria-hidden="true" className="qo-empty-icon">
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </section>
  );
}

export function LoadingSkeletons({ label, cards = 4 }: { label: string; cards?: number }) {
  return (
    <div aria-label={label} className="qo-skeleton-group" role="status">
      <span className="qo-skeleton qo-skeleton-hero" />
      <div className="qo-skeleton-row">
        {Array.from({ length: cards }, (_, index) => (
          <span className="qo-skeleton qo-skeleton-card" key={index} />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="qo-error-panel" role="alert">
      <h2>Couldn&apos;t load this data</h2>
      <p>{message}</p>
      <button className="qo-btn qo-btn-primary" onClick={retry} type="button">
        Try again
      </button>
    </section>
  );
}

export function InlineNotice({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? X : Info;
  return (
    <p className={`qo-notice qo-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={18} />
      <span>{children}</span>
    </p>
  );
}

/** Accessible modal confirmation dialog (Esc closes, backdrop click closes). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Keep it",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop qo-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        aria-describedby="qo-confirm-message"
        aria-labelledby="qo-confirm-title"
        aria-modal="true"
        className="qo-confirm-dialog"
        role="dialog"
      >
        <h2 id="qo-confirm-title">{title}</h2>
        <p id="qo-confirm-message">{message}</p>
        <div className="qo-confirm-actions">
          <button className="qo-btn qo-btn-ghost" onClick={onCancel} ref={cancelRef} type="button">
            {cancelLabel}
          </button>
          <button
            className="qo-btn qo-btn-danger"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Only render links we can trust to be plain web links. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function SafeExternalLink({ url, label }: { url: string; label: string }) {
  if (!isSafeHttpUrl(url)) return null;
  return (
    <a className="qo-ext-link" href={url} rel="noopener noreferrer" target="_blank">
      {label}
      <ExternalLink aria-hidden="true" size={13} />
    </a>
  );
}
