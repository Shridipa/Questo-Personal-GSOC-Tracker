"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  GitMerge,
  GitPullRequest,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  addJourneyTask,
  attachJourneyIssue,
  deleteJourneyTask,
  describeApiError,
  detachJourneyIssue,
  fetchJourney,
  linkJourneyPr,
  refreshJourneyPr,
  saveJournal,
  syncJourneyPRReviews,
  unlinkJourneyPr,
  updateChecklistItem,
  updateJourneyStatus,
  updatePRFeedback,
  updateJourneyTask,
  type JournalFields,
  type JourneyChecklistItem,
  type JourneyDetail,
  type JourneyStatus,
  type JourneyTask,
  type PRFeedback,
  type PRFeedbackTrackingState,
} from "@/lib/api";
import { formatTimestamp } from "@/components/questline/explore/explore-shared";

// ─── Status labels / classes ──────────────────────────────────────────────────

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

const STATUS_FLOW: JourneyStatus[] = [
  "preparing",
  "issue_selected",
  "in_progress",
  "pr_open",
  "changes_requested",
  "merged",
];

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

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="journey-section-card">
      <button className="journey-section-header" onClick={() => setOpen((v) => !v)} type="button">
        <span className="journey-section-title">{title}</span>
        {badge && <span className="journey-badge journey-badge-neutral">{badge}</span>}
        {open ? (
          <ChevronUp aria-hidden="true" size={14} />
        ) : (
          <ChevronDown aria-hidden="true" size={14} />
        )}
      </button>
      {open && <div className="journey-section-body">{children}</div>}
    </div>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────

function ChecklistSection({
  journeyId,
  items,
  onChange,
}: {
  journeyId: string;
  items: JourneyChecklistItem[];
  onChange: (updated: JourneyDetail) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [error, setError] = useState("");

  const done = items.filter((i) => i.completed).length;

  const toggle = async (item: JourneyChecklistItem) => {
    setBusy(item.item_key);
    setError("");
    try {
      const updated = await updateChecklistItem(
        journeyId,
        item.item_key,
        !item.completed,
        item.notes,
      );
      onChange(updated);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async (item: JourneyChecklistItem) => {
    setBusy(item.item_key);
    setError("");
    try {
      const updated = await updateChecklistItem(
        journeyId,
        item.item_key,
        item.completed,
        editNotes,
      );
      onChange(updated);
      setEditKey(null);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section badge={`${done}/${items.length}`} title="Contribution checklist">
      {error && <p className="journey-error">{error}</p>}
      <ul className="journey-checklist">
        {items.map((item) => (
          <li
            className={`journey-checklist-item${item.completed ? " is-done" : ""}`}
            key={item.item_key}
          >
            <button
              aria-label={item.completed ? `Uncheck ${item.title}` : `Check ${item.title}`}
              aria-pressed={item.completed}
              className="journey-check-btn"
              disabled={busy === item.item_key}
              onClick={() => void toggle(item)}
              type="button"
            >
              {busy === item.item_key ? (
                <Loader2 className="button-spinner" size={15} />
              ) : item.completed ? (
                <CircleCheck size={15} />
              ) : (
                <Circle size={15} />
              )}
            </button>
            <div className="journey-checklist-content">
              <span className="journey-checklist-title">{item.title}</span>
              {editKey === item.item_key ? (
                <div className="journey-checklist-notes-edit">
                  <textarea
                    className="journey-textarea"
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes for this step…"
                    rows={2}
                    value={editNotes}
                  />
                  <div className="journey-checklist-edit-actions">
                    <button
                      className="button button-primary"
                      disabled={busy === item.item_key}
                      onClick={() => void saveNotes(item)}
                      type="button"
                    >
                      <Save aria-hidden="true" size={12} />
                      Save
                    </button>
                    <button
                      className="button button-outline"
                      onClick={() => setEditKey(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="journey-checklist-notes-row">
                  {item.notes ? (
                    <span className="journey-checklist-notes">{item.notes}</span>
                  ) : null}
                  <button
                    aria-label={`Edit notes for ${item.title}`}
                    className="journey-icon-btn"
                    onClick={() => {
                      setEditKey(item.item_key);
                      setEditNotes(item.notes);
                    }}
                    title="Edit notes"
                    type="button"
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Issue panel ──────────────────────────────────────────────────────────────

function IssueSection({
  journeyId,
  journey,
  onChange,
}: {
  journeyId: string;
  journey: JourneyDetail;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [mode, setMode] = useState<"view" | "attach">("view");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const attach = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const num = Number(trimmed);
      const updated =
        isNaN(num) || !Number.isInteger(num) || num <= 0
          ? await attachJourneyIssue(journeyId, undefined, trimmed)
          : await attachJourneyIssue(journeyId, num);
      onChange(updated);
      setMode("view");
      setInput("");
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const detach = async () => {
    setBusy(true);
    setError("");
    try {
      onChange(await detachJourneyIssue(journeyId));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Target issue">
      {error && <p className="journey-error">{error}</p>}
      {journey.issue_number ? (
        <div className="journey-github-card">
          <div className="journey-github-card-head">
            <BookOpen aria-hidden="true" size={14} />
            <span className="journey-github-title">
              {journey.issue_url ? (
                <a href={journey.issue_url} rel="noreferrer noopener" target="_blank">
                  #{journey.issue_number}
                  {journey.issue_title ? ` · ${journey.issue_title}` : ""}
                  <ArrowUpRight aria-hidden="true" size={11} />
                </a>
              ) : (
                <>
                  #{journey.issue_number}
                  {journey.issue_title ? ` · ${journey.issue_title}` : ""}
                </>
              )}
            </span>
            <span
              className={`journey-badge ${journey.issue_state === "open" ? "journey-badge-green" : "journey-badge-neutral"}`}
            >
              {journey.issue_state ?? "unknown"}
            </span>
          </div>
          {journey.issue_labels.length > 0 && (
            <div className="issue-labels">
              {journey.issue_labels.slice(0, 5).map((l) => (
                <span className="org-tag" key={l}>
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="journey-github-card-foot">
            {journey.issue_comments > 0 && (
              <span className="journey-meta-item">{journey.issue_comments} comments</span>
            )}
            {journey.issue_attached_at_utc && (
              <span className="journey-meta-item">
                Attached {formatTimestamp(journey.issue_attached_at_utc)}
              </span>
            )}
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void detach()}
              type="button"
            >
              <X aria-hidden="true" size={11} />
              Detach
            </button>
          </div>
        </div>
      ) : mode === "attach" ? (
        <form className="journey-attach-form" onSubmit={(e) => void attach(e)}>
          <input
            autoFocus
            className="explore-filter"
            onChange={(e) => setInput(e.target.value)}
            placeholder="Issue number (e.g. 42) or full GitHub URL"
            type="text"
            value={input}
          />
          <button className="button button-primary" disabled={busy || !input.trim()} type="submit">
            {busy ? <Loader2 className="button-spinner" size={14} /> : null}
            Attach
          </button>
          <button
            className="button button-outline"
            onClick={() => {
              setMode("view");
              setError("");
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="journey-empty-panel">
          <p>No issue linked yet. Pick a GitHub issue to tackle.</p>
          <button className="button button-outline" onClick={() => setMode("attach")} type="button">
            <Plus aria-hidden="true" size={12} />
            Attach issue
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Pull request panel ───────────────────────────────────────────────────────

function PullRequestSection({
  journeyId,
  journey,
  onChange,
}: {
  journeyId: string;
  journey: JourneyDetail;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [mode, setMode] = useState<"view" | "link">("view");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const link = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const num = Number(trimmed);
      const updated =
        isNaN(num) || !Number.isInteger(num) || num <= 0
          ? await linkJourneyPr(journeyId, undefined, trimmed)
          : await linkJourneyPr(journeyId, num);
      onChange(updated);
      setMode("view");
      setInput("");
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      onChange(await refreshJourneyPr(journeyId));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError("");
    try {
      onChange(await unlinkJourneyPr(journeyId));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const prStateColor =
    journey.pr_state === "open"
      ? "journey-badge-green"
      : journey.pr_state === "closed"
        ? "journey-badge-neutral"
        : "journey-badge-purple";

  return (
    <Section title="Pull request">
      {error && <p className="journey-error">{error}</p>}
      {journey.pr_number ? (
        <div className="journey-github-card">
          <div className="journey-github-card-head">
            {journey.pr_state === "closed" && journey.pr_merged_at ? (
              <GitMerge aria-hidden="true" size={14} />
            ) : (
              <GitPullRequest aria-hidden="true" size={14} />
            )}
            <span className="journey-github-title">
              {journey.pr_url ? (
                <a href={journey.pr_url} rel="noreferrer noopener" target="_blank">
                  #{journey.pr_number}
                  {journey.pr_title ? ` · ${journey.pr_title}` : ""}
                  <ArrowUpRight aria-hidden="true" size={11} />
                </a>
              ) : (
                <>
                  #{journey.pr_number}
                  {journey.pr_title ? ` · ${journey.pr_title}` : ""}
                </>
              )}
            </span>
            {journey.pr_is_draft && (
              <span className="journey-badge journey-badge-neutral">Draft</span>
            )}
            <span className={`journey-badge ${prStateColor}`}>
              {journey.pr_merged_at ? "merged" : (journey.pr_state ?? "unknown")}
            </span>
          </div>
          <div className="journey-github-card-foot">
            {journey.pr_synced_at_utc && (
              <span className="journey-meta-item">
                Synced {formatTimestamp(journey.pr_synced_at_utc)}
              </span>
            )}
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void refresh()}
              title="Re-fetch PR status from GitHub"
              type="button"
            >
              <RefreshCw aria-hidden="true" size={11} />
              Refresh
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void unlink()}
              type="button"
            >
              <X aria-hidden="true" size={11} />
              Unlink
            </button>
          </div>
        </div>
      ) : mode === "link" ? (
        <form className="journey-attach-form" onSubmit={(e) => void link(e)}>
          <input
            autoFocus
            className="explore-filter"
            onChange={(e) => setInput(e.target.value)}
            placeholder="PR number (e.g. 101) or full GitHub pull request URL"
            type="text"
            value={input}
          />
          <button className="button button-primary" disabled={busy || !input.trim()} type="submit">
            {busy ? <Loader2 className="button-spinner" size={14} /> : null}
            Link PR
          </button>
          <button
            className="button button-outline"
            onClick={() => {
              setMode("view");
              setError("");
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="journey-empty-panel">
          <p>No pull request linked yet. Once you submit a PR, link it here.</p>
          <button className="button button-outline" onClick={() => setMode("link")} type="button">
            <Plus aria-hidden="true" size={12} />
            Link pull request
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Review intelligence panel ───────────────────────────────────────────────

const REVIEW_STATE_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  COMMENTED: "Commented",
  DISMISSED: "Dismissed",
};

const REVIEW_STATE_CLASSES: Record<string, string> = {
  APPROVED: "journey-badge-green",
  CHANGES_REQUESTED: "journey-badge-amber",
  COMMENTED: "journey-badge-neutral",
  DISMISSED: "journey-badge-neutral",
};

const TRACKING_LABELS: Record<PRFeedbackTrackingState, string> = {
  open: "Open",
  addressed: "Addressed",
  not_applicable: "Not applicable",
};

/** GitHub's own review decision, as last synced — never inferred. */
function latestReviewSummary(reviews: JourneyDetail["pr_reviews"]): string | null {
  if (reviews.length === 0) return null;
  const states = reviews.map((r) => (r.gh_state ?? "").toUpperCase());
  if (states.includes("CHANGES_REQUESTED")) return "Changes requested";
  if (states.includes("APPROVED")) return "Approved";
  if (states.includes("DISMISSED")) return "Review dismissed";
  return "Reviewed (comments)";
}

function FeedbackItemCard({
  journeyId,
  feedback,
  onChange,
}: {
  journeyId: string;
  feedback: PRFeedback;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(feedback.response_notes);
  const [editingNotes, setEditingNotes] = useState(false);

  const patch = async (update: {
    tracking_state?: PRFeedbackTrackingState;
    response_notes?: string;
  }) => {
    setBusy(true);
    setError("");
    try {
      onChange(await updatePRFeedback(journeyId, feedback.id, update));
      setEditingNotes(false);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`journey-feedback-item is-${feedback.tracking_state}`}>
      <div className="journey-feedback-head">
        {feedback.source_type === "review" ? (
          <GitPullRequest aria-hidden="true" size={12} />
        ) : (
          <BookOpen aria-hidden="true" size={12} />
        )}
        {feedback.html_url ? (
          <a href={feedback.html_url} rel="noreferrer noopener" target="_blank">
            {feedback.author ?? "GitHub"}
            <ArrowUpRight aria-hidden="true" size={10} />
          </a>
        ) : (
          <span>{feedback.author ?? "GitHub"}</span>
        )}
        <span className="journey-meta-item">
          {feedback.source_type === "review" ? "review" : "review comment"}
        </span>
        {feedback.submitted_at && (
          <span className="journey-meta-item">{formatTimestamp(feedback.submitted_at)}</span>
        )}
      </div>
      {feedback.body_excerpt && <p className="journey-feedback-excerpt">{feedback.body_excerpt}</p>}
      <div className="journey-feedback-tracking">
        <span className="journey-meta-item">Your tracking:</span>
        {(Object.keys(TRACKING_LABELS) as PRFeedbackTrackingState[]).map((state) => (
          <button
            className={`journey-feedback-state-btn${state === feedback.tracking_state ? " is-active" : ""}`}
            disabled={busy}
            key={state}
            onClick={() => void patch({ tracking_state: state })}
            type="button"
          >
            {TRACKING_LABELS[state]}
          </button>
        ))}
        <span
          className="journey-meta-item"
          title="GitHub state — Tracker badges above are your own, and do not mean a reviewer has accepted the changes."
        >
          GitHub: {REVIEW_STATE_LABELS[feedback.gh_state] ?? feedback.gh_state}
        </span>
      </div>
      {editingNotes ? (
        <div className="journey-feedback-notes-edit">
          <textarea
            className="journey-textarea"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your response or follow-up notes…"
            rows={2}
            value={notes}
          />
          <div className="journey-checklist-edit-actions">
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void patch({ response_notes: notes })}
              type="button"
            >
              <Save aria-hidden="true" size={12} />
              Save note
            </button>
            <button
              className="button button-outline"
              onClick={() => {
                setNotes(feedback.response_notes);
                setEditingNotes(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="journey-checklist-notes-row">
          {feedback.response_notes && (
            <span className="journey-checklist-notes">{feedback.response_notes}</span>
          )}
          <button
            aria-label="Edit response notes"
            className="journey-icon-btn"
            onClick={() => setEditingNotes(true)}
            type="button"
          >
            <Pencil size={11} />
          </button>
        </div>
      )}
      {error && <p className="journey-error">{error}</p>}
    </li>
  );
}

function ReviewIntelligenceSection({
  journeyId,
  journey,
  onChange,
}: {
  journeyId: string;
  journey: JourneyDetail;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openTimeline, setOpenTimeline] = useState(false);
  const [openReviews, setOpenReviews] = useState(false);

  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      onChange(await syncJourneyPRReviews(journeyId));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!journey.pr_number) {
    return (
      <Section title="Review intelligence">
        <div className="journey-empty-panel">
          <p>Link a pull request first — then you can track reviews and feedback here.</p>
        </div>
      </Section>
    );
  }

  const summary = latestReviewSummary(journey.pr_reviews);
  const hasData = journey.pr_review_synced_at_utc !== null;
  const openFeedback = journey.pr_feedback.filter((f) => f.tracking_state === "open").length;

  return (
    <Section
      badge={
        journey.pr_feedback.length > 0
          ? `${journey.pr_feedback.length - openFeedback}/${journey.pr_feedback.length} addressed`
          : undefined
      }
      title="Review intelligence"
    >
      {error && <p className="journey-error">{error}</p>}
      {hasData && summary && (
        <div className="journey-review-summary">
          <span className="journey-meta-item">Latest review state (GitHub):</span>
          <span className="journey-badge journey-badge-purple">{summary}</span>
        </div>
      )}

      {journey.pr_reviews.length > 0 && (
        <div className="journey-review-block">
          <button
            className="journey-collapse-toggle"
            onClick={() => setOpenReviews((v) => !v)}
            type="button"
          >
            {openReviews ? "Hide reviews" : `Show reviews (${journey.pr_reviews.length})`}
            {openReviews ? (
              <ChevronUp aria-hidden="true" size={12} />
            ) : (
              <ChevronDown aria-hidden="true" size={12} />
            )}
          </button>
          {openReviews && (
            <ul className="journey-review-list">
              {[...journey.pr_reviews].reverse().map((review) => (
                <li className="journey-review-row" key={review.node_id}>
                  <div className="journey-feedback-head">
                    <span
                      className={`journey-badge ${REVIEW_STATE_CLASSES[review.gh_state] ?? "journey-badge-neutral"}`}
                    >
                      {REVIEW_STATE_LABELS[review.gh_state] ?? review.gh_state}
                    </span>
                    {review.html_url ? (
                      <a href={review.html_url} rel="noreferrer noopener" target="_blank">
                        {review.author ?? "Unknown"}
                        <ArrowUpRight aria-hidden="true" size={10} />
                      </a>
                    ) : (
                      <span>{review.author ?? "Unknown"}</span>
                    )}
                    {review.submitted_at && (
                      <span className="journey-meta-item">
                        {formatTimestamp(review.submitted_at)}
                      </span>
                    )}
                  </div>
                  {review.body_excerpt && (
                    <p className="journey-feedback-excerpt">{review.body_excerpt}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {journey.pr_feedback.length > 0 ? (
        <ul className="journey-feedback-list">
          {journey.pr_feedback.map((item) => (
            <FeedbackItemCard
              feedback={item}
              journeyId={journeyId}
              key={item.id}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : (
        hasData && (
          <div className="journey-empty-panel">
            <p>
              No review feedback items yet. Items appear when reviewers request changes or comment
              on your PR.
            </p>
          </div>
        )
      )}

      {journey.pr_timeline.length > 0 && (
        <div className="journey-review-block">
          <button
            className="journey-collapse-toggle"
            onClick={() => setOpenTimeline((v) => !v)}
            type="button"
          >
            {openTimeline ? "Hide PR timeline" : `Show PR timeline (${journey.pr_timeline.length})`}
            {openTimeline ? (
              <ChevronUp aria-hidden="true" size={12} />
            ) : (
              <ChevronDown aria-hidden="true" size={12} />
            )}
          </button>
          {openTimeline && (
            <ol className="journey-event-log">
              {[...journey.pr_timeline].reverse().map((event) => (
                <li className="journey-event-item" key={`${event.kind}-${event.occurred_at}`}>
                  <span className="journey-event-type">{event.kind.replace(/_/g, " ")}</span>
                  <span className="journey-event-desc">{event.label}</span>
                  <span className="journey-event-time">{formatTimestamp(event.occurred_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="journey-feedback-sync-row">
        {journey.pr_review_synced_at_utc && (
          <span className="journey-meta-item">
            Review data synced {formatTimestamp(journey.pr_review_synced_at_utc)}
          </span>
        )}
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => void sync()}
          title="Fetch latest review data from GitHub"
          type="button"
        >
          {busy ? (
            <Loader2 className="button-spinner" size={11} />
          ) : (
            <RefreshCw aria-hidden="true" size={11} />
          )}
          Sync reviews
        </button>
      </div>
    </Section>
  );
}

// ─── Tasks panel ─────────────────────────────────────────────────────────────

function TasksSection({
  journeyId,
  tasks,
  onChange,
}: {
  journeyId: string;
  tasks: JourneyTask[];
  onChange: (updated: JourneyDetail) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const done = tasks.filter((t) => t.completed).length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setBusy("new");
    setError("");
    try {
      onChange(await addJourneyTask(journeyId, title));
      setNewTitle("");
      setAdding(false);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (task: JourneyTask) => {
    setBusy(task.id);
    setError("");
    try {
      onChange(await updateJourneyTask(journeyId, task.id, { completed: !task.completed }));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (task: JourneyTask) => {
    setBusy(task.id);
    setError("");
    try {
      onChange(await deleteJourneyTask(journeyId, task.id));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      badge={tasks.length > 0 ? `${done}/${tasks.length}` : undefined}
      defaultOpen={tasks.length > 0}
      title="Personal tasks"
    >
      {error && <p className="journey-error">{error}</p>}
      {tasks.length > 0 && (
        <ul className="journey-task-list">
          {tasks.map((task) => (
            <li className={`journey-task-item${task.completed ? " is-done" : ""}`} key={task.id}>
              <button
                aria-label={
                  task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`
                }
                aria-pressed={task.completed}
                className="journey-check-btn"
                disabled={busy === task.id}
                onClick={() => void toggle(task)}
                type="button"
              >
                {busy === task.id ? (
                  <Loader2 className="button-spinner" size={14} />
                ) : task.completed ? (
                  <CircleCheck size={14} />
                ) : (
                  <Circle size={14} />
                )}
              </button>
              <span className="journey-task-title">{task.title}</span>
              <button
                aria-label={`Delete task "${task.title}"`}
                className="journey-icon-btn journey-delete-btn"
                disabled={busy === task.id}
                onClick={() => void remove(task)}
                title="Delete task"
                type="button"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="journey-attach-form" onSubmit={(e) => void add(e)}>
          <input
            autoFocus
            className="explore-filter"
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task title…"
            ref={inputRef}
            type="text"
            value={newTitle}
          />
          <button
            className="button button-primary"
            disabled={busy === "new" || !newTitle.trim()}
            type="submit"
          >
            {busy === "new" ? <Loader2 className="button-spinner" size={14} /> : null}
            Add
          </button>
          <button
            className="button button-outline"
            onClick={() => {
              setAdding(false);
              setNewTitle("");
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="button button-outline"
          onClick={() => setAdding(true)}
          style={{ marginTop: tasks.length > 0 ? 8 : 0 }}
          type="button"
        >
          <Plus aria-hidden="true" size={12} />
          Add task
        </button>
      )}
    </Section>
  );
}

// ─── Journal panel ────────────────────────────────────────────────────────────

const JOURNAL_FIELDS: Array<{
  key: keyof Omit<JournalFields, "updated_at_utc">;
  label: string;
  placeholder: string;
}> = [
  { key: "summary", label: "Summary", placeholder: "Briefly describe the issue or feature…" },
  {
    key: "reproduction_steps",
    label: "Reproduction steps",
    placeholder: "Steps to reproduce the bug…",
  },
  {
    key: "expected_vs_actual",
    label: "Expected vs actual",
    placeholder: "What should happen vs what does…",
  },
  { key: "relevant_files", label: "Relevant files", placeholder: "Files / modules involved…" },
  {
    key: "potential_causes",
    label: "Potential causes",
    placeholder: "Hypotheses about root cause…",
  },
  { key: "proposed_solution", label: "Proposed solution", placeholder: "Your plan / approach…" },
  { key: "tests_to_run", label: "Tests to run", placeholder: "How you plan to verify the fix…" },
  {
    key: "questions_for_maintainers",
    label: "Questions for maintainers",
    placeholder: "What do you need to clarify?…",
  },
  {
    key: "lessons_learned",
    label: "Lessons learned",
    placeholder: "What did you learn from this contribution?…",
  },
  {
    key: "skills_practiced",
    label: "Skills practiced",
    placeholder: "Skills, tools, or frameworks you worked with…",
  },
];

function JournalSection({
  journeyId,
  journal,
  onChange,
}: {
  journeyId: string;
  journal: JournalFields;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [draft, setDraft] = useState<Omit<JournalFields, "updated_at_utc">>({
    summary: journal.summary,
    reproduction_steps: journal.reproduction_steps,
    expected_vs_actual: journal.expected_vs_actual,
    relevant_files: journal.relevant_files,
    potential_causes: journal.potential_causes,
    proposed_solution: journal.proposed_solution,
    tests_to_run: journal.tests_to_run,
    questions_for_maintainers: journal.questions_for_maintainers,
    lessons_learned: journal.lessons_learned,
    skills_practiced: journal.skills_practiced,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = JOURNAL_FIELDS.some(({ key }) => draft[key] !== journal[key]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onChange(await saveJournal(journeyId, draft));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const hasSomeContent = JOURNAL_FIELDS.some(({ key }) => draft[key]);

  return (
    <Section defaultOpen={hasSomeContent} title="Investigation journal">
      <form onSubmit={(e) => void submit(e)}>
        {JOURNAL_FIELDS.map(({ key, label, placeholder }) => (
          <div className="journey-journal-field" key={key}>
            <label className="journey-journal-label" htmlFor={`journal-${key}`}>
              {label}
            </label>
            <textarea
              className="journey-textarea"
              id={`journal-${key}`}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              placeholder={placeholder}
              rows={3}
              value={draft[key]}
            />
          </div>
        ))}
        {error && <p className="journey-error">{error}</p>}
        <div className="journey-journal-actions">
          {journal.updated_at_utc && (
            <span className="journey-meta-item">
              Saved {formatTimestamp(journal.updated_at_utc)}
            </span>
          )}
          <button className="button button-primary" disabled={busy || !dirty} type="submit">
            {busy ? (
              <Loader2 className="button-spinner" size={14} />
            ) : (
              <Save aria-hidden="true" size={13} />
            )}
            {saved ? "Saved!" : "Save journal"}
          </button>
        </div>
      </form>
    </Section>
  );
}

// ─── Status stepper ───────────────────────────────────────────────────────────

function StatusStepper({
  journeyId,
  currentStatus,
  onChange,
}: {
  journeyId: string;
  currentStatus: JourneyStatus;
  onChange: (updated: JourneyDetail) => void;
}) {
  const [busy, setBusy] = useState<JourneyStatus | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const ALL_STATUSES: JourneyStatus[] = [...STATUS_FLOW, "paused", "closed", "abandoned"];

  const transition = async (next: JourneyStatus) => {
    setBusy(next);
    setError("");
    try {
      onChange(await updateJourneyStatus(journeyId, next));
      setOpen(false);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="journey-status-stepper">
      <div className="journey-status-flow">
        {STATUS_FLOW.map((s, i) => {
          const currentIdx = STATUS_FLOW.indexOf(currentStatus);
          const done =
            i < currentIdx || (currentIdx !== -1 && s === currentStatus && s === "merged");
          const active = s === currentStatus;
          return (
            <div
              className={`journey-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}
              key={s}
              title={STATUS_LABELS[s]}
            >
              <div className="journey-step-dot" />
              <span className="journey-step-label">{STATUS_LABELS[s]}</span>
              {i < STATUS_FLOW.length - 1 && <div className="journey-step-line" />}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="journey-error" style={{ marginTop: 6 }}>
          {error}
        </p>
      )}
      <div className="journey-status-actions">
        <span
          className={`journey-badge ${STATUS_CLASSES[currentStatus] ?? "journey-badge-neutral"}`}
        >
          {STATUS_LABELS[currentStatus]}
        </span>
        <button className="button button-outline" onClick={() => setOpen((v) => !v)} type="button">
          Change status
          <ChevronDown aria-hidden="true" size={12} />
        </button>
        {open && (
          <div className="journey-status-dropdown">
            {ALL_STATUSES.filter((s) => s !== currentStatus).map((s) => (
              <button
                className="journey-status-option"
                disabled={!!busy}
                key={s}
                onClick={() => void transition(s)}
                type="button"
              >
                {busy === s && <Loader2 className="button-spinner" size={12} />}
                <span className={`journey-badge ${STATUS_CLASSES[s]}`}>{STATUS_LABELS[s]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event log ────────────────────────────────────────────────────────────────

function EventLog({ events }: { events: JourneyDetail["events"] }) {
  if (events.length === 0) return null;
  return (
    <Section defaultOpen={false} title="Activity log">
      <ol className="journey-event-log">
        {[...events].reverse().map((ev) => (
          <li className="journey-event-item" key={ev.id}>
            <span className="journey-event-type">{ev.event_type.replace(/_/g, " ")}</span>
            <span className="journey-event-desc">{ev.description}</span>
            <span className="journey-event-time">{formatTimestamp(ev.created_at_utc)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export function JourneyWorkspace({ journeyId }: { journeyId: string }) {
  const [journey, setJourney] = useState<JourneyDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await fetchJourney(journeyId);
        if (!ignore) {
          setJourney(data);
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
  }, [journeyId]);

  if (state === "loading") {
    return (
      <div aria-live="polite" className="org-loading-banner">
        <Loader2 aria-hidden="true" className="button-spinner" size={18} />
        <span>Loading journey workspace…</span>
      </div>
    );
  }

  if (state === "error" || !journey) {
    return (
      <div className="feature-page explore-page">
        <Link className="explore-back-link" href="/journeys">
          <ArrowLeft aria-hidden="true" size={14} /> Back to journeys
        </Link>
        <div className="journey-error-banner">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>{message || "Journey not found."}</p>
        </div>
      </div>
    );
  }

  const update = (updated: JourneyDetail) => setJourney(updated);

  return (
    <div className="feature-page explore-page">
      <Link className="explore-back-link" href="/journeys">
        <ArrowLeft aria-hidden="true" size={14} /> Back to journeys
      </Link>

      {/* Header */}
      <div className="page-title-block">
        <span className="eyebrow">
          CONTRIBUTION JOURNEY <span>✦</span>
        </span>
        <h1>{journey.title}</h1>
        <p className="journey-repo-line">
          <MapPin aria-hidden="true" size={13} />
          <a href={journey.repo_url} rel="noreferrer noopener" target="_blank">
            {journey.repo_full_name}
            <ArrowUpRight aria-hidden="true" size={12} />
          </a>
          {journey.org_slug && (
            <>
              {" · "}
              <Link href={`/explore/${journey.org_slug}`}>{journey.org_slug}</Link>
            </>
          )}
        </p>
      </div>

      {/* Status stepper */}
      <StatusStepper currentStatus={journey.status} journeyId={journey.id} onChange={update} />

      {/* Workspace grid */}
      <div className="journey-workspace-grid">
        <div className="journey-workspace-main">
          <ChecklistSection items={journey.checklist} journeyId={journey.id} onChange={update} />
          <JournalSection journal={journey.journal} journeyId={journey.id} onChange={update} />
        </div>
        <div className="journey-workspace-side">
          <IssueSection journey={journey} journeyId={journey.id} onChange={update} />
          <PullRequestSection journey={journey} journeyId={journey.id} onChange={update} />
          <ReviewIntelligenceSection journey={journey} journeyId={journey.id} onChange={update} />
          <TasksSection journeyId={journey.id} onChange={update} tasks={journey.tasks} />
          <EventLog events={journey.events} />
        </div>
      </div>
    </div>
  );
}
