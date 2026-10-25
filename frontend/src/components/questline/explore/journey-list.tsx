"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  GitPullRequest,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import {
  describeApiError,
  fetchJourneys,
  type JourneySummary,
  type JourneyStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTimestamp } from "@/components/questline/explore/explore-shared";

const STATUS_LABELS: Record<JourneyStatus, string> = {
  preparing: "Preparing",
  issue_selected: "Issue selected",
  in_progress: "In progress",
  pr_open: "PR open",
  changes_requested: "Changes requested",
  merged: "Merged ✓",
  closed: "Closed",
  paused: "Paused",
  abandoned: "Abandoned",
};

const STATUS_CLASSES: Record<JourneyStatus, string> = {
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

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const dash = circ * pct;
  const gap = circ - dash;
  return (
    <svg
      aria-label={`${done} of ${total} checklist items done`}
      className="journey-ring"
      height={40}
      viewBox="0 0 40 40"
      width={40}
    >
      <circle cx="20" cy="20" fill="none" r={r} stroke="var(--surface-3)" strokeWidth="5" />
      <circle
        cx="20"
        cy="20"
        fill="none"
        r={r}
        stroke={pct >= 1 ? "var(--green)" : "var(--accent-purple)"}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
        strokeWidth="5"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        transform="rotate(-90 20 20)"
      />
      <text
        dominantBaseline="central"
        fontSize="9"
        fontWeight="700"
        fill="currentColor"
        textAnchor="middle"
        x="20"
        y="20"
      >
        {done}/{total}
      </text>
    </svg>
  );
}

function JourneyCard({ journey }: { journey: JourneySummary }) {
  const badgeClass = STATUS_CLASSES[journey.status] ?? "journey-badge-neutral";
  const label = STATUS_LABELS[journey.status] ?? journey.status;
  return (
    <li className="journey-card">
      <div className="journey-card-head">
        <div className="journey-card-title-row">
          <Link className="journey-card-title" href={`/journeys/${journey.id}`}>
            {journey.title}
          </Link>
          <span className={`journey-badge ${badgeClass}`}>{label}</span>
        </div>
        <p className="journey-card-repo">
          <MapPin aria-hidden="true" size={11} />
          <a href={journey.repo_url} rel="noreferrer noopener" target="_blank">
            {journey.repo_full_name}
          </a>
        </p>
      </div>

      <div className="journey-card-body">
        <ProgressRing
          done={journey.checklist_completed_count}
          total={journey.checklist_total_count}
        />
        <div className="journey-card-meta">
          {journey.issue_number && (
            <span className="journey-meta-item">
              <BookOpen aria-hidden="true" size={11} />
              Issue #{journey.issue_number}
              {journey.issue_title && ` · ${journey.issue_title}`}
            </span>
          )}
          {journey.pr_number && (
            <span className="journey-meta-item">
              <GitPullRequest aria-hidden="true" size={11} />
              PR #{journey.pr_number}
              {journey.pr_title && ` · ${journey.pr_title}`}
              {journey.pr_is_draft && (
                <span className="journey-badge journey-badge-neutral" style={{ marginLeft: 4 }}>
                  Draft
                </span>
              )}
            </span>
          )}
          {journey.tasks_total_count > 0 && (
            <span className="journey-meta-item">
              <CheckSquare aria-hidden="true" size={11} />
              {journey.tasks_completed_count}/{journey.tasks_total_count} tasks
            </span>
          )}
          <span className="journey-meta-item journey-meta-date">
            Updated {formatTimestamp(journey.updated_at_utc)}
          </span>
        </div>
      </div>

      <Link className="journey-card-open" href={`/journeys/${journey.id}`}>
        Open workspace <ArrowRight aria-hidden="true" size={12} />
      </Link>
    </li>
  );
}

export function JourneyList() {
  const { user, isLoading: authLoading } = useAuth();
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    let ignore = false;
    async function load() {
      if (!user) {
        if (!ignore) {
          setState("ready");
        }
        return;
      }
      try {
        const data = await fetchJourneys();
        if (!ignore) {
          setJourneys(data);
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
  }, [user, authLoading]);

  if (state === "loading") {
    return (
      <div aria-live="polite" className="org-loading-banner">
        <Loader2 aria-hidden="true" className="button-spinner" size={18} />
        <span>Loading your journeys…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="feature-page explore-page">
        <div className="page-title-block">
          <span className="eyebrow">CONTRIBUTION JOURNEYS ✦</span>
          <h1>Your contribution journeys</h1>
          <p>
            Track every open-source contribution from first issue to merged PR — with checklists,
            investigation journals, and real GitHub data.
          </p>
        </div>
        <div className="journey-unauthenticated">
          <p>Sign in to start tracking contribution journeys.</p>
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
          <h1>Your journeys</h1>
        </div>
        <p className="explore-rec-error">{message}</p>
      </div>
    );
  }

  const active = journeys.filter((j) => !["merged", "closed", "abandoned"].includes(j.status));
  const archived = journeys.filter((j) => ["merged", "closed", "abandoned"].includes(j.status));

  return (
    <div className="feature-page explore-page">
      <div className="page-title-block">
        <span className="eyebrow">CONTRIBUTION JOURNEYS ✦</span>
        <h1>Your journeys</h1>
        <p>
          Each journey tracks one repository contribution — from studying the issue to getting your
          PR merged.
        </p>
        <div className="journey-card-meta" style={{ marginTop: 8 }}>
          <Link
            className="journey-meta-item"
            href="/portfolio"
            style={{ color: "var(--accent-purple)" }}
          >
            <GitPullRequest aria-hidden="true" size={11} />
            Open your contribution portfolio →
          </Link>
        </div>
      </div>

      {journeys.length === 0 ? (
        <div className="journey-empty">
          <p className="journey-empty-title">No journeys yet</p>
          <p className="journey-empty-body">
            Browse an organization, open a repository you like, and click{" "}
            <strong>Start journey</strong> to begin tracking a contribution.
          </p>
          <Link className="button button-primary" href="/explore">
            <Plus aria-hidden="true" size={14} />
            Explore organizations
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="journey-section">
              <div className="list-heading">
                <h2>Active</h2>
                <span className="list-heading-note">{active.length} open</span>
              </div>
              <ul className="journey-list">
                {active.map((j) => (
                  <JourneyCard journey={j} key={j.id} />
                ))}
              </ul>
            </section>
          )}

          {archived.length > 0 && (
            <section className="journey-section">
              <div className="list-heading">
                <h2>Completed &amp; archived</h2>
                <span className="list-heading-note">{archived.length} entries</span>
              </div>
              <ul className="journey-list">
                {archived.map((j) => (
                  <JourneyCard journey={j} key={j.id} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
