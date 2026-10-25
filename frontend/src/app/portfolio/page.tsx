"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Check, Copy, GitPullRequest, Loader2, MapPin } from "lucide-react";
import { describeApiError, fetchPortfolio, type PortfolioEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTimestamp } from "@/components/questline/explore/explore-shared";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
  buildPortfolioSummary,
} from "@/components/questline/explore/portfolio-summary";

const STATUS_CLASSES: Record<string, string> = {
  preparing: "journey-badge-neutral",
  issue_selected: "journey-badge-blue",
  in_progress: "journey-badge-indigo",
  pr_open: "journey-badge-purple",
  changes_requested: "journey-badge-amber",
  merged: "journey-badge-green",
  closed: "journey-badge-neutral",
  paused: "journey-badge-neutral",
  abandoned: "journey-badge-neutral",
};

const FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "preparing", label: "Preparing" },
  { value: "issue_selected", label: "Issue selected" },
  { value: "in_progress", label: "In progress" },
  { value: "pr_open", label: "PR open" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
  { value: "paused", label: "Paused" },
  { value: "abandoned", label: "Abandoned" },
];

function PortfolioCard({ entry }: { entry: PortfolioEntry }) {
  const outcome = OUTCOME_LABELS[entry.pr_outcome] ?? OUTCOME_LABELS.unknown;
  return (
    <li className="journey-card">
      <div className="journey-card-head">
        <div className="journey-card-title-row">
          <Link className="journey-card-title" href={`/journeys/${entry.id}`}>
            {entry.title}
          </Link>
          <span
            className={`journey-badge ${STATUS_CLASSES[entry.status] ?? "journey-badge-neutral"}`}
          >
            {STATUS_LABELS[entry.status] ?? entry.status}
          </span>
        </div>
        <p className="journey-card-repo">
          <MapPin aria-hidden="true" size={11} />
          {entry.org_slug && <span>{entry.org_slug} · </span>}
          <a href={entry.repo_url} rel="noreferrer noopener" target="_blank">
            {entry.repo_full_name}
            <ArrowUpRight aria-hidden="true" size={10} />
          </a>
        </p>
      </div>
      <div className="journey-card-meta">
        {entry.issue_number && (
          <span className="journey-meta-item">
            <BookOpen aria-hidden="true" size={11} />
            {entry.issue_url ? (
              <a href={entry.issue_url} rel="noreferrer noopener" target="_blank">
                Issue #{entry.issue_number}
                <ArrowUpRight aria-hidden="true" size={10} />
              </a>
            ) : (
              <span>Issue #{entry.issue_number}</span>
            )}
          </span>
        )}
        {entry.pr_number && entry.pr_url && (
          <span className="journey-meta-item">
            <GitPullRequest aria-hidden="true" size={11} />
            <a href={entry.pr_url} rel="noreferrer noopener" target="_blank">
              PR #{entry.pr_number}
              <ArrowUpRight aria-hidden="true" size={10} />
            </a>
          </span>
        )}
        <span className={`journey-badge ${outcome.cls}`} title="Outcome based on GitHub data">
          {outcome.label}
        </span>
      </div>
      {(entry.skills_practiced.trim() || entry.lessons_learned.trim()) && (
        <div className="journey-card-body" style={{ marginLeft: 0 }}>
          {entry.skills_practiced.trim() && (
            <p className="journey-meta-item">Skills: {entry.skills_practiced.trim()}</p>
          )}
          {entry.lessons_learned.trim() && (
            <p className="journey-meta-item">Lessons: {entry.lessons_learned.trim()}</p>
          )}
        </div>
      )}
      <div className="journey-meta-item journey-meta-date">
        Started {formatTimestamp(entry.created_at_utc)}
        {entry.completed_at_utc ? ` · Merged ${formatTimestamp(entry.completed_at_utc)}` : ""}
      </div>
      <Link className="journey-card-open" href={`/journeys/${entry.id}`}>
        Open workspace <ArrowUpRight aria-hidden="true" size={12} />
      </Link>
    </li>
  );
}

const PAGE_SIZE = 50;

export default function PortfolioPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let ignore = false;
    async function load() {
      if (!user) {
        if (!ignore) setState("ready");
        return;
      }
      setState("loading");
      try {
        const data = await fetchPortfolio({
          status: statusFilter === "all" ? undefined : statusFilter,
          search: search.trim() || undefined,
          limit: PAGE_SIZE,
        });
        if (!ignore) {
          setEntries(data.entries);
          setTotal(data.total);
          setState("ready");
        }
      } catch (error) {
        if (!ignore) {
          setMessage(describeApiError(error));
          setState("error");
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [user, authLoading, statusFilter, search]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildPortfolioSummary(entries));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the textarea still allows manual copy.
    }
  };

  if (state === "loading" || authLoading) {
    return (
      <div aria-live="polite" className="org-loading-banner">
        <Loader2 aria-hidden="true" className="button-spinner" size={18} />
        <span>Loading your portfolio…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="feature-page explore-page">
        <div className="page-title-block">
          <span className="eyebrow">CONTRIBUTION PORTFOLIO ✦</span>
          <h1>Your contribution portfolio</h1>
          <p>A timeline of your open-source work, recorded accurately from GitHub.</p>
        </div>
        <div className="journey-unauthenticated">
          <p>Sign in to view your portfolio.</p>
          <Link className="button button-primary" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="feature-page explore-page">
        <div className="page-title-block">
          <span className="eyebrow">CONTRIBUTION PORTFOLIO ✦</span>
          <h1>Your contribution portfolio</h1>
        </div>
        <p className="explore-rec-error">{message}</p>
      </div>
    );
  }

  return (
    <div className="feature-page explore-page">
      <div className="page-title-block">
        <span className="eyebrow">CONTRIBUTION PORTFOLIO ✦</span>
        <h1>Your contribution portfolio</h1>
        <p>
          Every journey you recorded — with outcomes taken directly from GitHub, so open pull
          requests stay open and only truly merged work is shown as merged.
        </p>
      </div>

      <div className="journey-attach-form" style={{ marginBottom: 12 }}>
        <input
          aria-label="Search by repository, organization, or title"
          className="explore-filter"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repository, organization, or title…"
          type="search"
          value={search}
        />
        <select
          aria-label="Filter by journey status"
          className="explore-filter"
          onChange={(e) => setStatusFilter(e.target.value)}
          value={statusFilter}
        >
          {FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="journey-meta-item">{total} record(s)</span>
      </div>

      {entries.length === 0 ? (
        <div className="journey-empty">
          <p className="journey-empty-title">Nothing here yet</p>
          <p className="journey-empty-body">
            Contributions appear in your portfolio as you record journeys.
          </p>
          <Link className="button button-primary" href="/explore">
            Explore organizations
          </Link>
        </div>
      ) : (
        <>
          <ul className="journey-list">
            {entries.map((entry) => (
              <PortfolioCard entry={entry} key={entry.id} />
            ))}
          </ul>

          <div className="journey-portfolio-share">
            <button
              className="button button-outline"
              onClick={() => setSummaryVisible((v) => !v)}
              type="button"
            >
              {summaryVisible ? "Hide shareable summary" : "Prepare shareable summary"}
            </button>
            {summaryVisible && (
              <div className="journey-portfolio-summary">
                <p className="journey-empty-body">
                  Private by design: this text only includes the fields you documented — your
                  journals, feedback tracking, and other investigation notes stay private.
                </p>
                <textarea
                  aria-label="Shareable portfolio summary"
                  className="journey-textarea"
                  readOnly
                  rows={Math.min(20, 4 + entries.length * 3)}
                  value={buildPortfolioSummary(entries)}
                />
                <button
                  className="button button-primary"
                  onClick={() => void copySummary()}
                  type="button"
                >
                  {copied ? (
                    <Check aria-hidden="true" size={13} />
                  ) : (
                    <Copy aria-hidden="true" size={13} />
                  )}
                  {copied ? "Copied!" : "Copy summary"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
