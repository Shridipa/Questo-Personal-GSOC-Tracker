"use client";

import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  Flag,
  Flame,
  Heart,
  Lightbulb,
  LockKeyhole,
  Pencil,
  Save,
  Settings2,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import {
  completeDeadline,
  createDeadline,
  deleteDeadline,
  fetchDashboardData,
  fetchActivityHistory,
  fetchCurrentWeekReview,
  fetchDeadlines,
  fetchProgress,
  fetchQuests,
  fetchSettings,
  fetchStreaks,
  fetchWeeklyReviews,
  fetchXpHistory,
  saveWeeklyReview,
  updateSettings,
  updateDeadline,
  type Deadline,
  type DeadlineFields,
  type ReviewFields,
  type SettingsUpdate,
  type UserSettings,
  type WeeklyReview,
} from "@/lib/api";
import { QuestDetails } from "@/components/questline/quest-details";
import type { Quest } from "@/lib/quest-data";
import { getPhaseResources } from "@/lib/quest-resources";
import { useApiData } from "@/lib/use-api-data";

export type FeaturePageKey =
  "quests" | "roadmap" | "progress" | "weekly-review" | "deadlines" | "settings";

const pageDetails: Record<FeaturePageKey, { eyebrow: string; title: string; subtitle: string }> = {
  quests: {
    eyebrow: "YOUR DAILY MISSIONS",
    title: "Quest board",
    subtitle: "Small, focused steps that move your open-source journey forward.",
  },
  roadmap: {
    eyebrow: "PERSONAL PLANNING WINDOWS",
    title: "Your roadmap",
    subtitle: "A personal plan, not an official program calendar. Your pace can change.",
  },
  progress: {
    eyebrow: "EVERY STEP COUNTS",
    title: "Your progress",
    subtitle: "A clear record of your saved quest completions, XP, and active days.",
  },
  "weekly-review": {
    eyebrow: "PAUSE & REFLECT",
    title: "Weekly review",
    subtitle: "Reflect on the week, save what you learned, and choose what comes next.",
  },
  deadlines: {
    eyebrow: "DATES TO KEEP IN VIEW",
    title: "Deadlines & milestones",
    subtitle: "Keep personal targets separate from dates confirmed by official sources.",
  },
  settings: {
    eyebrow: "MAKE QUESTO YOURS",
    title: "Settings",
    subtitle: "Your preferences for a steady, encouraging learning routine.",
  },
};

function DataLabel({ page }: { page: FeaturePageKey }) {
  const label =
    page === "quests" || page === "roadmap"
      ? "Quest and roadmap data come from the API. Quest completions and progress are saved."
      : page === "deadlines"
        ? "Personal deadlines are saved in the local API. Official dates remain unverified."
        : page === "weekly-review"
          ? "Weekly reflections are saved in the local API."
          : page === "settings"
            ? "Settings and preferences are saved by the local API."
            : "Progress and activity history come from saved completions and the XP ledger.";

  return (
    <div className="preview-banner page-preview">
      <Sparkles aria-hidden="true" size={15} />
      <span>{label}</span>
    </div>
  );
}

function DataLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="data-loading" role="status">
      <span className="skeleton skeleton-line heading" />
      <span className="skeleton skeleton-line medium" />
      <span className="skeleton skeleton-card" />
      <span className="skeleton skeleton-card" />
    </div>
  );
}

function DataError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="data-state compact" role="alert">
      <h2>Couldn&apos;t load data</h2>
      <p>{message}</p>
      <button className="button button-primary" onClick={retry} type="button">
        Retry
      </button>
    </section>
  );
}

function QuestList() {
  const { data, error, loading, retry } = useApiData(fetchQuests);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const closeSelectedQuest = useCallback(() => {
    setSelectedQuest(null);
    retry();
  }, [retry]);
  if (loading) return <DataLoading label="Loading quests" />;
  if (error) return <DataError message={error} retry={retry} />;

  const quests = (data ?? []).filter((quest) => quest.id !== "welcome");
  if (quests.length === 0) {
    return (
      <section className="data-state">
        <h2>No quests are available yet</h2>
        <p>The local API returned an empty quest list.</p>
        <button className="button button-secondary" onClick={retry} type="button">
          Refresh data
        </button>
      </section>
    );
  }
  const completedCount = quests.filter((quest) => quest.status === "completed").length;
  const plannedMinutes = quests.reduce((total, quest) => total + quest.minutes, 0);

  return (
    <div className="page-stack">
      <section className="page-highlight quest-board-highlight">
        <div className="highlight-icon green">
          <Target size={23} />
        </div>
        <div>
          <span className="eyebrow">QUESTS FROM THE LOCAL API</span>
          <h2>Your contribution toolkit</h2>
          <p>Complete a quest to save progress and earn its server-assigned XP reward.</p>
        </div>
        <div className="highlight-count">
          <strong>
            {completedCount}
            <span>/{quests.length}</span>
          </strong>
          <small>marked complete</small>
        </div>
      </section>
      <div className="list-heading">
        <h2>Up next</h2>
        <span>{plannedMinutes} planned minutes</span>
      </div>
      <div className="quest-list">
        {quests.map((quest, index) => {
          const isLocked = quest.status === "locked";
          const isDone = quest.status === "completed";
          return (
            <article
              className={`quest-list-card${isDone ? " quest-is-done" : ""}${isLocked ? " quest-is-locked" : ""}`}
              key={quest.id}
            >
              <span className={`list-step${isDone ? " step-done" : ""}`}>
                {isDone ? (
                  <Check size={17} />
                ) : isLocked ? (
                  <LockKeyhole size={16} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <div className="quest-list-copy">
                <div className="quest-list-title-line">
                  <h3>{quest.title}</h3>
                  <span className={`quest-category ${quest.category.toLowerCase()}`}>
                    {quest.category}
                  </span>
                </div>
                <p>{quest.description}</p>
                <div className="quest-list-meta">
                  <span>
                    <Clock3 size={14} /> {quest.minutes} min
                  </span>
                  <span>{quest.date}</span>
                  <span>{quest.phase}</span>
                </div>
              </div>
              <button
                aria-label={
                  isLocked ? `${quest.title} is locked` : `Open details for ${quest.title}`
                }
                className={`list-action${isDone ? " list-action-done" : ""}`}
                disabled={isLocked}
                onClick={() => setSelectedQuest(quest)}
                type="button"
              >
                {isDone ? (
                  <CheckCircle2 size={20} />
                ) : isLocked ? (
                  <LockKeyhole size={18} />
                ) : (
                  <ArrowRight size={19} />
                )}
              </button>
            </article>
          );
        })}
      </div>
      <div className="gentle-note">
        <Lightbulb size={18} />
        <p>
          <strong>No rush.</strong> Move quests around to fit your week. Missing a day never takes
          away progress you&apos;ve earned.
        </p>
      </div>
      {selectedQuest && (
        <QuestDetails key={selectedQuest.id} onClose={closeSelectedQuest} quest={selectedQuest} />
      )}
    </div>
  );
}

function RoadmapView() {
  const { data, error, loading, retry } = useApiData(fetchDashboardData);
  if (loading) return <DataLoading label="Loading roadmap" />;
  if (error) return <DataError message={error} retry={retry} />;
  const phases = data?.phases ?? [];
  if (phases.length === 0) {
    return (
      <section className="data-state">
        <h2>No roadmap phases are available</h2>
        <p>The local API returned an empty roadmap.</p>
        <button className="button button-secondary" onClick={retry} type="button">
          Refresh data
        </button>
      </section>
    );
  }
  const currentPhaseTitle = data?.quests.find((quest) => quest.status === "current")?.phase;

  return (
    <div className="page-stack roadmap-stack">
      <div className="roadmap-notice">
        <CircleHelp size={18} />
        <p>
          These are personal planning windows. Official 2027 program dates are not published here as
          confirmed deadlines.
        </p>
      </div>
      {phases.map((phase) => {
        const isCurrent = phase.title === currentPhaseTitle;
        return (
          <article
            className={`roadmap-card${isCurrent ? " roadmap-active" : " roadmap-upcoming"}`}
            key={phase.id}
          >
            <div className="roadmap-phase-mark">
              <span>{isCurrent ? <Flag size={18} /> : String(phase.id).padStart(2, "0")}</span>
              {phase.id !== phases[phases.length - 1]?.id && <i />}
            </div>
            <div className="roadmap-phase-body">
              <div className="roadmap-card-heading">
                <div>
                  <span className="eyebrow">
                    PHASE {phase.id}{" "}
                    {phase.dates && (
                      <>
                        <i>·</i> {phase.dates}
                      </>
                    )}
                  </span>
                  <h2>{phase.title}</h2>
                </div>
                <span className={`phase-status${isCurrent ? " now" : ""}`}>
                  {isCurrent ? "CURRENT" : "PLANNED"}
                </span>
              </div>
              <p>{phase.description}</p>
              <div className="roadmap-quest-preview">
                {phase.quests.slice(0, 3).map((quest) => (
                  <span key={quest}>
                    <i className="mini-check" />
                    {quest}
                  </span>
                ))}
                {phase.quests.length > 3 && <small>+{phase.quests.length - 3} more quests</small>}
              </div>
              {phase.milestone && (
                <div className="phase-milestone">
                  <Trophy size={16} />
                  <span>
                    <strong>Milestone</strong> {phase.milestone}
                  </span>
                </div>
              )}
              {getPhaseResources(phase.id).length > 0 && (
                <ul className="phase-resource-links" aria-label={`Resources for phase ${phase.id}`}>
                  {getPhaseResources(phase.id).map((resource) => (
                    <li key={resource.url}>
                      <a href={resource.url} rel="noopener noreferrer" target="_blank">
                        <ExternalLink aria-hidden="true" size={13} />
                        {resource.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProgressView() {
  const [selectedDays, setSelectedDays] = useState<7 | 30 | 90>(30);
  const progressState = useApiData(fetchProgress);
  const streakState = useApiData(fetchStreaks);
  const historyState = useApiData(fetchXpHistory);
  const loadActivity = useCallback(() => fetchActivityHistory(selectedDays), [selectedDays]);
  const activityState = useApiData(loadActivity);
  if (
    progressState.loading ||
    streakState.loading ||
    historyState.loading ||
    activityState.loading
  ) {
    return <DataLoading label="Loading saved progress" />;
  }
  if (progressState.error || streakState.error || historyState.error || activityState.error) {
    const messages = [
      progressState.error,
      streakState.error,
      historyState.error,
      activityState.error,
    ]
      .filter((message): message is string => message !== undefined)
      .join(" ");
    return (
      <DataError
        message={messages}
        retry={() => {
          progressState.retry();
          streakState.retry();
          historyState.retry();
          activityState.retry();
        }}
      />
    );
  }
  const progress = progressState.data;
  const streaks = streakState.data;
  const history = historyState.data ?? [];
  const activity = activityState.data;
  const peakXp = Math.max(...(activity?.days.map((day) => day.xp_earned) ?? []), 0);
  const activeDays = activity?.days.filter((day) => day.has_activity) ?? [];
  const averageXpPerActiveDay =
    activity && activity.totals.active_days > 0
      ? `${Math.round(activity.totals.xp_earned / activity.totals.active_days)} XP`
      : "—";

  return (
    <div className="page-stack">
      <section className="progress-hero">
        <div className="progress-hero-copy">
          <span className="eyebrow">SAVED QUEST PROGRESS</span>
          <h2>Every recorded step counts.</h2>
          <p>XP and streaks are calculated from server-stored quest completions.</p>
        </div>
        <div className="level-medallion">
          <span>
            <Sparkles size={23} />
          </span>
          <strong>{progress?.total_xp ?? 0} XP</strong>
          <small>Total earned</small>
        </div>
      </section>
      <div className="stat-grid">
        <article className="stat-card stat-xp">
          <span className="stat-icon">
            <Star fill="currentColor" size={18} />
          </span>
          <strong>{progress?.total_xp ?? 0}</strong>
          <small>Total XP</small>
          <div className="stat-foot">Recorded in the XP ledger</div>
        </article>
        <article className="stat-card stat-streak">
          <span className="stat-icon">
            <Flame fill="currentColor" size={18} />
          </span>
          <strong>{streaks?.current_streak ?? 0} days</strong>
          <small>Current streak</small>
          <div className="stat-foot">
            Longest: {streaks?.longest_streak ?? 0} days · {streaks?.timezone}
          </div>
        </article>
        <article className="stat-card stat-quests">
          <span className="stat-icon">
            <CheckCircle2 size={18} />
          </span>
          <strong>
            {progress?.completed_quests ?? 0}/{progress?.total_quests ?? 0}
          </strong>
          <small>Quests completed</small>
          <div className="stat-foot">Saved completion records</div>
        </article>
      </div>
      <section className="xp-history-card">
        <div className="chart-heading">
          <div>
            <span className="eyebrow">AUDITABLE REWARDS</span>
            <h2>XP history</h2>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="empty-history">Complete your first quest to see its XP record here.</p>
        ) : (
          <ul className="xp-history-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.quest_title}</strong>
                  <small>
                    {formatXpTimestamp(entry.awarded_at_utc, streaks?.timezone ?? "UTC")}
                  </small>
                </span>
                <strong>+{entry.points} XP</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="activity-history-card" aria-labelledby="activity-history-title">
        <div className="chart-heading">
          <div>
            <span className="eyebrow">RECORDED DAILY ACTIVITY</span>
            <h2 id="activity-history-title">Activity history</h2>
          </div>
          <label className="activity-range-control">
            <span>Period</span>
            <select
              aria-label="Activity history period"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === 7 || value === 30 || value === 90) {
                  setSelectedDays(value);
                }
              }}
              value={selectedDays}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
        {activity && (
          <>
            <p className="activity-period-summary">
              {activity.start_date} – {activity.end_date} · {activity.timezone}
            </p>
            <div className="activity-summary-grid">
              <div>
                <strong>{activity.totals.quests_completed}</strong>
                <span>quests completed</span>
              </div>
              <div>
                <strong>{activity.totals.xp_earned} XP</strong>
                <span>earned in this period</span>
              </div>
              <div>
                <strong>{activity.totals.active_days}</strong>
                <span>active days</span>
              </div>
              <div>
                <strong>{averageXpPerActiveDay}</strong>
                <span>per active day</span>
              </div>
            </div>
            <p className="activity-chart-summary">
              Daily XP totals for {selectedDays} days. The text list below shows the recorded
              completion count and XP for each active day.
            </p>
            <div
              aria-label={`Daily XP history for ${selectedDays} days, ${activity.totals.xp_earned} total XP`}
              className="activity-bars"
              role="img"
              style={{
                gridTemplateColumns: `repeat(${activity.days.length}, minmax(2px, 1fr))`,
              }}
            >
              {activity.days.map((day) => {
                const barHeight =
                  day.xp_earned > 0
                    ? Math.max(8, Math.round((day.xp_earned / (peakXp || 1)) * 100))
                    : 0;
                return (
                  <span
                    aria-hidden="true"
                    className={`activity-bar${day.has_activity ? " active" : ""}`}
                    key={day.date}
                    style={{ height: `${barHeight}%` }}
                    title={`${day.date}: ${day.xp_earned} XP, ${day.quests_completed} quests`}
                  >
                    {selectedDays === 7 && <small>{formatActivityDate(day.date)}</small>}
                  </span>
                );
              })}
            </div>
            {activeDays.length === 0 ? (
              <p className="empty-history">
                No quest completions were recorded in this period. Zero-activity days are shown for
                context and are not saved as activity.
              </p>
            ) : (
              <ul className="activity-day-list">
                {activeDays
                  .slice()
                  .reverse()
                  .map((day) => (
                    <li key={day.date}>
                      <span>
                        <strong>{formatActivityDate(day.date)}</strong>
                        <small>{day.date}</small>
                      </span>
                      <span>{day.quests_completed} quests</span>
                      <strong>{day.xp_earned} XP</strong>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function formatActivityDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatXpTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function shiftIsoDate(value: string, days: number): string {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function reviewFields(review: WeeklyReview): ReviewFields {
  return {
    week_start: review.week_start,
    week_end: review.week_end,
    accomplishments: review.accomplishments,
    challenges: review.challenges,
    lessons_learned: review.lessons_learned,
    next_priorities: review.next_priorities,
  };
}

function WeeklyReviewView() {
  const currentState = useApiData(fetchCurrentWeekReview);
  const historyState = useApiData(fetchWeeklyReviews);
  const [draftOverride, setDraftOverride] = useState<ReviewFields>();
  const [reviewIdOverride, setReviewIdOverride] = useState<string | null>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const currentReview = currentState.data?.review ?? null;
  const defaultDraft: ReviewFields = {
    week_start: currentState.data?.week_start ?? "",
    week_end: currentState.data ? shiftIsoDate(currentState.data.week_start, 6) : "",
    accomplishments: "",
    challenges: "",
    lessons_learned: "",
    next_priorities: "",
  };
  const draft = draftOverride ?? (currentReview ? reviewFields(currentReview) : defaultDraft);
  const reviewId =
    reviewIdOverride === undefined ? currentReview?.id : (reviewIdOverride ?? undefined);

  if (currentState.loading) return <DataLoading label="Loading weekly review" />;
  if (currentState.error) {
    return <DataError message={currentState.error} retry={currentState.retry} />;
  }

  function editReview(review: WeeklyReview) {
    setDraftOverride(reviewFields(review));
    setReviewIdOverride(review.id);
    setError(undefined);
    setSuccess(undefined);
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const saved = await saveWeeklyReview(draft, reviewId);
      setReviewIdOverride(saved.id);
      setDraftOverride(reviewFields(saved));
      setSuccess("Your weekly review is saved.");
      historyState.retry();
      if (saved.week_start === currentState.data?.week_start) currentState.retry();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this weekly review.");
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(field: keyof ReviewFields, value: string) {
    const existing =
      field === "week_start"
        ? (historyState.data?.find((review) => review.week_start === value) ??
          (currentReview?.week_start === value ? currentReview : undefined))
        : undefined;
    setDraftOverride(
      existing
        ? reviewFields(existing)
        : {
            ...draft,
            [field]: value,
            ...(field === "week_start" ? { week_end: shiftIsoDate(value, 6) } : {}),
          },
    );
    if (field === "week_start") {
      setReviewIdOverride(existing?.id ?? null);
    }
    setError(undefined);
    setSuccess(undefined);
  }

  return (
    <div className="page-stack review-stack">
      <section className="review-intro">
        <span className="review-sun">
          <Sparkles size={24} />
        </span>
        <div>
          <h2>Take a breath. You showed up.</h2>
          <p>Save a private reflection for the week and revisit it whenever you need.</p>
        </div>
      </section>
      <form className="review-form persistent-form" onSubmit={(event) => void saveReview(event)}>
        <div className="form-date-row">
          <label>
            Week starts (Monday)
            <input
              onChange={(event) => updateDraft("week_start", event.target.value)}
              required
              type="date"
              value={draft.week_start}
            />
          </label>
          <p>Week ends Sunday · {draft.week_end || "Select a Monday to begin"}</p>
        </div>
        {(
          [
            ["accomplishments", "What did you accomplish?", "Small steps count."],
            ["challenges", "Challenges or blockers", "What made progress harder?"],
            ["lessons_learned", "What did you learn?", "Capture something you want to remember."],
            ["next_priorities", "Priorities for next week", "Choose a few realistic next steps."],
          ] as const
        ).map(([field, title, hint], index) => (
          <label className="review-prompt" key={field}>
            <span aria-hidden="true" className="prompt-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{title}</strong>
              <small>{hint}</small>
              <textarea
                maxLength={10000}
                onChange={(event) => updateDraft(field, event.target.value)}
                required
                value={draft[field]}
              />
            </span>
          </label>
        ))}
        {error && (
          <p className="form-message form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="inline-confirmation" role="status">
            <CheckCircle2 size={16} />
            {success}
          </p>
        )}
        <button className="button button-primary review-submit" disabled={saving} type="submit">
          {saving ? <span aria-hidden="true" className="button-spinner" /> : <Save size={16} />}
          {saving ? "Saving review…" : reviewId ? "Update review" : "Save weekly review"}
        </button>
      </form>
      <section className="review-history">
        <div className="list-heading">
          <h2>Review history</h2>
          <button className="text-button" onClick={historyState.retry} type="button">
            Refresh history
          </button>
        </div>
        {historyState.loading ? (
          <DataLoading label="Loading review history" />
        ) : historyState.error ? (
          <DataError message={historyState.error} retry={historyState.retry} />
        ) : (historyState.data ?? []).length === 0 ? (
          <p className="empty-history">Your saved reviews will appear here.</p>
        ) : (
          <ul className="review-history-list">
            {historyState.data?.map((review) => (
              <li key={review.id}>
                <span>
                  <strong>Week of {review.week_start}</strong>
                  <small>Updated {new Date(review.updated_at_utc).toLocaleString()}</small>
                </span>
                <button
                  className="button button-secondary"
                  onClick={() => editReview(review)}
                  type="button"
                >
                  <Pencil size={14} /> Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="gentle-note">
        <Heart size={18} />
        <p>Your pace is allowed to change. A missed day is information, not a failure.</p>
      </div>
    </div>
  );
}

type DeadlineDraft = DeadlineFields & { status: "pending" | "completed" };

const emptyDeadlineDraft: DeadlineDraft = {
  title: "",
  description: "",
  due_date: "",
  due_time: null,
  category: "Personal",
  url: null,
  status: "pending",
};

function deadlineDraft(deadline: Deadline): DeadlineDraft {
  return {
    title: deadline.title,
    description: deadline.description,
    due_date: deadline.due_date,
    due_time: deadline.due_time?.slice(0, 5) ?? null,
    category: deadline.category,
    url: deadline.url,
    status: deadline.status,
  };
}

function DeadlinesView() {
  const { data, error, loading, retry } = useApiData(fetchDeadlines);
  const [draft, setDraft] = useState<DeadlineDraft>(emptyDeadlineDraft);
  const [editingId, setEditingId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [success, setSuccess] = useState<string>();

  if (loading) return <DataLoading label="Loading deadlines" />;
  if (error) return <DataError message={error} retry={retry} />;
  const deadlines = data ?? [];
  const upcoming = deadlines.filter((deadline) => deadline.classification === "upcoming");
  const overdue = deadlines.filter((deadline) => deadline.classification === "overdue");
  const completed = deadlines.filter((deadline) => deadline.classification === "completed");

  function resetForm() {
    setEditingId(undefined);
    setDraft(emptyDeadlineDraft);
    setErrorMessage(undefined);
    setSuccess(undefined);
  }

  async function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMessage(undefined);
    setSuccess(undefined);
    const values = {
      ...draft,
      due_time: draft.due_time || null,
      url: draft.url || null,
    };
    try {
      if (editingId) {
        await updateDeadline(editingId, values);
        setSuccess("Deadline updated.");
      } else {
        await createDeadline(values);
        setSuccess("Deadline saved.");
      }
      resetForm();
      setSuccess(editingId ? "Deadline updated." : "Deadline saved.");
      retry();
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "Could not save this deadline.");
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(deadline: Deadline) {
    setErrorMessage(undefined);
    try {
      await completeDeadline(deadline.id);
      setSuccess(`${deadline.title} marked complete.`);
      retry();
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : "Could not complete this deadline.",
      );
    }
  }

  async function removeDeadline(deadline: Deadline) {
    if (!window.confirm(`Delete "${deadline.title}"? This cannot be undone.`)) return;
    setErrorMessage(undefined);
    try {
      await deleteDeadline(deadline.id);
      setSuccess("Deadline deleted.");
      if (editingId === deadline.id) resetForm();
      retry();
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "Could not delete this deadline.");
    }
  }

  function renderGroup(title: string, items: Deadline[], classification: string) {
    return (
      <section className="deadline-group" key={title}>
        <div className="list-heading">
          <h2>{title}</h2>
          <span>{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="empty-history">No {title.toLowerCase()} deadlines.</p>
        ) : (
          items.map((deadline) => (
            <article className="deadline-row persistent-deadline-row" key={deadline.id}>
              <div className={`deadline-date ${classification === "upcoming" ? "blue-date" : ""}`}>
                <CalendarDays size={17} />
              </div>
              <div className="deadline-copy">
                <span
                  className={`deadline-type ${classification === "overdue" ? "personal" : "estimate"}`}
                >
                  {deadline.category} · {classification.toUpperCase()}
                </span>
                <h3>{deadline.title}</h3>
                <p>
                  {deadline.due_date}
                  {deadline.due_time ? ` · ${deadline.due_time.slice(0, 5)}` : ""}
                </p>
                {deadline.description && <p>{deadline.description}</p>}
                {deadline.url && (
                  <a href={deadline.url} rel="noreferrer" target="_blank">
                    Open link <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="deadline-actions">
                {deadline.status === "pending" && (
                  <button
                    aria-label={`Mark ${deadline.title} complete`}
                    className="icon-button"
                    onClick={() => void markComplete(deadline)}
                    type="button"
                  >
                    <CheckCircle2 size={17} />
                  </button>
                )}
                <button
                  aria-label={`Edit ${deadline.title}`}
                  className="icon-button"
                  onClick={() => {
                    setDraft(deadlineDraft(deadline));
                    setEditingId(deadline.id);
                    setErrorMessage(undefined);
                    setSuccess(undefined);
                  }}
                  type="button"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`Delete ${deadline.title}`}
                  className="icon-button danger"
                  onClick={() => void removeDeadline(deadline)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    );
  }

  return (
    <div className="page-stack">
      <div className="deadline-banner">
        <CalendarDays size={21} />
        <div>
          <strong>Your personal deadlines</strong>
          <p>
            Due dates use your configured local timezone. Official program dates are not confirmed
            here.
          </p>
        </div>
      </div>
      <form className="review-form deadline-form" onSubmit={(event) => void saveDeadline(event)}>
        <h2>{editingId ? "Edit deadline" : "Add a deadline"}</h2>
        <div className="deadline-form-grid">
          <label>
            Title
            <input
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
              value={draft.title}
            />
          </label>
          <label>
            Category
            <input
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              required
              value={draft.category}
            />
          </label>
          <label>
            Due date
            <input
              onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
              required
              type="date"
              value={draft.due_date}
            />
          </label>
          <label>
            Due time (optional)
            <input
              onChange={(event) => setDraft({ ...draft, due_time: event.target.value || null })}
              type="time"
              value={draft.due_time ?? ""}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            maxLength={5000}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            value={draft.description}
          />
        </label>
        <label>
          Link (optional)
          <input
            onChange={(event) => setDraft({ ...draft, url: event.target.value || null })}
            placeholder="https://…"
            type="url"
            value={draft.url ?? ""}
          />
        </label>
        {errorMessage && (
          <p className="form-message form-error" role="alert">
            {errorMessage}
          </p>
        )}
        {success && (
          <p className="inline-confirmation" role="status">
            <CheckCircle2 size={16} />
            {success}
          </p>
        )}
        <div className="form-actions">
          <button className="button button-primary review-submit" disabled={saving} type="submit">
            {saving ? <span aria-hidden="true" className="button-spinner" /> : <Save size={16} />}
            {saving ? "Saving…" : editingId ? "Update deadline" : "Save deadline"}
          </button>
          {editingId && (
            <button className="button button-secondary" onClick={resetForm} type="button">
              Cancel edit
            </button>
          )}
        </div>
      </form>
      {renderGroup("Upcoming", upcoming, "upcoming")}
      {renderGroup("Overdue", overdue, "overdue")}
      {renderGroup("Completed", completed, "completed")}
      <section className="official-date-card">
        <div className="official-date-icon">
          <CircleHelp size={20} />
        </div>
        <div>
          <span className="eyebrow">OFFICIAL PROGRAM DATES</span>
          <h3>Not confirmed in Questo</h3>
          <p>
            Check official announcements for current dates. Personal targets are never presented as
            official deadlines.
          </p>
          <a href="https://summerofcode.withgoogle.com/" target="_blank" rel="noreferrer">
            Visit Google Summer of Code <ExternalLink size={14} />
          </a>
        </div>
        <span className="verification-badge">UNVERIFIED</span>
      </section>
    </div>
  );
}

function SettingsView() {
  const settingsState = useApiData(fetchSettings);
  const [draftOverride, setDraftOverride] = useState<SettingsUpdate>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const draft =
    draftOverride ??
    (settingsState.data
      ? settingsToUpdate(settingsState.data)
      : {
          daily_goal_minutes: 45 as const,
          timezone: "Asia/Kolkata",
          reminders_enabled: true,
          celebrations_enabled: true,
        });

  if (settingsState.loading) return <DataLoading label="Loading saved settings" />;
  if (settingsState.error) {
    return <DataError message={settingsState.error} retry={settingsState.retry} />;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const saved = await updateSettings(draft);
      setDraftOverride(settingsToUpdate(saved));
      setSuccess("Your settings were saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="page-stack settings-stack" onSubmit={(event) => void save(event)}>
      <section className="settings-group">
        <div className="settings-group-heading">
          <Settings2 size={18} />
          <div>
            <h2>Your learning routine</h2>
            <p>Gentle defaults you can make your own.</p>
          </div>
        </div>
        <label className="setting-row" htmlFor="daily-goal">
          <span>
            <strong>Daily time budget</strong>
            <small>How much time feels realistic most days?</small>
          </span>
          <select
            id="daily-goal"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 30 || value === 45 || value === 60 || value === 90) {
                setDraftOverride({ ...draft, daily_goal_minutes: value });
              }
            }}
            value={draft.daily_goal_minutes}
          >
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
          </select>
        </label>
        <label className="setting-row" htmlFor="settings-timezone">
          <span>
            <strong>Timezone</strong>
            <small>Used for future activity dates and current streak calculations.</small>
          </span>
          <input
            autoComplete="off"
            id="settings-timezone"
            list="timezone-options"
            maxLength={100}
            onChange={(event) => setDraftOverride({ ...draft, timezone: event.target.value })}
            placeholder="IANA name, e.g. Asia/Kolkata"
            required
            value={draft.timezone}
          />
          <datalist id="timezone-options">
            <option value="Asia/Kolkata" />
            <option value="UTC" />
            <option value="Europe/London" />
            <option value="Europe/Paris" />
            <option value="America/New_York" />
            <option value="America/Los_Angeles" />
            <option value="Australia/Sydney" />
          </datalist>
        </label>
        <div className="setting-row">
          <span>
            <strong>Learning focus</strong>
            <small>Your roadmap focus is currently configured in the app.</small>
          </span>
          <span className="setting-value">GSoC 2027 + open source</span>
        </div>
      </section>
      <section className="settings-group">
        <div className="settings-group-heading">
          <Bell size={18} />
          <div>
            <h2>Reminders & encouragement</h2>
            <p>Stay in the loop without the pressure.</p>
          </div>
        </div>
        <label className="setting-row setting-toggle" htmlFor="reminders-toggle">
          <span>
            <strong>Daily reminder</strong>
            <small>Preference only; reminder delivery is not implemented.</small>
          </span>
          <input
            checked={draft.reminders_enabled}
            id="reminders-toggle"
            onChange={(event) =>
              setDraftOverride({ ...draft, reminders_enabled: event.target.checked })
            }
            role="switch"
            type="checkbox"
          />
        </label>
        <label className="setting-row setting-toggle" htmlFor="encouragement-toggle">
          <span>
            <strong>Celebration moments</strong>
            <small>Show small celebrations when you finish.</small>
          </span>
          <input
            id="encouragement-toggle"
            onChange={(event) =>
              setDraftOverride({ ...draft, celebrations_enabled: event.target.checked })
            }
            role="switch"
            type="checkbox"
            checked={draft.celebrations_enabled}
          />
        </label>
      </section>
      <section className="settings-group profile-settings">
        <div className="settings-group-heading">
          <Target size={18} />
          <div>
            <h2>About this journey</h2>
            <p>Your profile starts focused and can grow with you.</p>
          </div>
        </div>
        <div className="profile-setting">
          <span className="profile-setting-avatar">Q</span>
          <div>
            <strong>Your learning journey</strong>
            <small>Python · AI/ML · software engineering · testing</small>
          </div>
          <span className="setting-edit-tag">PREVIEW</span>
        </div>
        <div className="settings-note">
          <Lightbulb size={16} /> Saved timezone changes apply to future activity only. Existing
          activity dates remain unchanged.
        </div>
      </section>
      {error && (
        <p className="form-message form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="inline-confirmation" role="status">
          <CheckCircle2 size={16} /> {success}
        </p>
      )}
      <div className="form-actions settings-form-actions">
        <button className="button button-primary" disabled={saving} type="submit">
          {saving ? <span aria-hidden="true" className="button-spinner" /> : <Save size={16} />}
          {saving ? "Saving…" : error ? "Retry save" : "Save settings"}
        </button>
        {settingsState.data?.updated_at_utc && (
          <span className="settings-saved-at">Saved settings are stored by the API.</span>
        )}
      </div>
    </form>
  );
}

function settingsToUpdate(settings: UserSettings): SettingsUpdate {
  return {
    daily_goal_minutes: settings.daily_goal_minutes,
    timezone: settings.timezone,
    reminders_enabled: settings.reminders_enabled,
    celebrations_enabled: settings.celebrations_enabled,
  };
}

export function FeaturePage({ page }: { page: FeaturePageKey }) {
  const details = pageDetails[page];
  return (
    <div className="feature-page">
      <DataLabel page={page} />
      <div className="page-title-block">
        <span className="eyebrow">{details.eyebrow}</span>
        <h1>{details.title}</h1>
        <p>{details.subtitle}</p>
      </div>
      {page === "quests" && <QuestList />}
      {page === "roadmap" && <RoadmapView />}
      {page === "progress" && <ProgressView />}
      {page === "weekly-review" && <WeeklyReviewView />}
      {page === "deadlines" && <DeadlinesView />}
      {page === "settings" && <SettingsView />}
      <footer className="feature-footer">
        <span>One quest at a time</span>
        <Sparkles size={14} />
        <Link href="/">
          Back to your path <ArrowRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
