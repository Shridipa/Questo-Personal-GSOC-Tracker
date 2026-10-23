"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Flag,
  Flame,
  Lightbulb,
  Pencil,
  Save,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  fetchActivityHistory,
  fetchCurrentWeekReview,
  fetchDeadlines,
  fetchQuests,
  fetchStreaks,
  fetchWeeklyReviews,
  saveWeeklyReview,
  type ReviewFields,
  type WeeklyReview,
} from "@/lib/api";
import { useApiData } from "@/lib/use-api-data";
import {
  EmptyState,
  ErrorPanel,
  InlineNotice,
  LoadingSkeletons,
  MetricTile,
  PageHero,
} from "./shared";

function shiftIsoDate(value: string, days: number): string {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatWeekRange(startIso: string): string {
  const endIso = shiftIsoDate(startIso, 6);
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return startIso;
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startText = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  const endText = new Intl.DateTimeFormat("en", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${startText} – ${endText}`;
}

function reviewToFields(review: WeeklyReview): ReviewFields {
  return {
    week_start: review.week_start,
    week_end: review.week_end,
    accomplishments: review.accomplishments,
    challenges: review.challenges,
    lessons_learned: review.lessons_learned,
    next_priorities: review.next_priorities,
  };
}

const PROMPTS: Array<{ field: keyof ReviewFields; title: string; hint: string }> = [
  {
    field: "accomplishments",
    title: "What went well this week?",
    hint: "Wins, quests finished, small breakthroughs — they all count.",
  },
  {
    field: "lessons_learned",
    title: "What did you learn?",
    hint: "Something you want to remember next time.",
  },
  {
    field: "challenges",
    title: "What challenged you?",
    hint: "Blockers, friction, or things that took longer than expected.",
  },
  {
    field: "next_priorities",
    title: "Main goal for next week",
    hint: "One or two realistic priorities to carry forward.",
  },
];

const fetchYearActivity = () => fetchActivityHistory(366);

export function WeeklyReviewView() {
  const currentState = useApiData(fetchCurrentWeekReview);
  const historyState = useApiData(fetchWeeklyReviews);
  const streakState = useApiData(fetchStreaks);
  const activityState = useApiData(fetchYearActivity);
  const deadlinesState = useApiData(fetchDeadlines);
  const questsState = useApiData(fetchQuests);

  // The current week start comes from the API itself (server-side convention),
  // so no client-side `new Date()` is needed and static prerendering stays safe.
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const currentWeekStart = currentState.data?.week_start ?? "";
  const selectedStart = selectedWeek ?? currentWeekStart;
  const [draftOverride, setDraftOverride] = useState<ReviewFields>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const selectedEnd = shiftIsoDate(selectedStart, 6);
  const savedReview =
    (historyState.data ?? []).find((review) => review.week_start === selectedStart) ??
    (currentState.data?.review?.week_start === selectedStart
      ? (currentState.data.review ?? undefined)
      : undefined);
  const defaultDraft: ReviewFields = {
    week_start: selectedStart,
    week_end: selectedEnd,
    accomplishments: "",
    challenges: "",
    lessons_learned: "",
    next_priorities: "",
  };
  const draft = draftOverride ?? (savedReview ? reviewToFields(savedReview) : defaultDraft);
  const isCurrentWeek = selectedStart === currentWeekStart;
  const canGoNext = selectedStart < currentWeekStart;

  const timezone = streakState.data?.timezone ?? "UTC";
  const weekDays = useMemo(() => {
    const activity = activityState.data;
    if (!activity) return [];
    return activity.days.filter((day) => day.date >= selectedStart && day.date <= selectedEnd);
  }, [activityState.data, selectedStart, selectedEnd]);
  const weekQuestsCompleted = weekDays.reduce((sum, day) => sum + day.quests_completed, 0);
  const weekXpEarned = weekDays.reduce((sum, day) => sum + day.xp_earned, 0);
  const weekActiveDays = weekDays.filter((day) => day.has_activity).length;
  const upcomingDeadlines = (deadlinesState.data ?? []).filter(
    (deadline) => deadline.classification === "upcoming" || deadline.classification === "overdue",
  );
  const nextQuest =
    (questsState.data ?? []).find((quest) => quest.status === "current") ??
    (questsState.data ?? []).find((quest) => quest.status === "available") ??
    null;

  if (currentState.error) {
    return <ErrorPanel message={currentState.error} retry={currentState.retry} />;
  }
  if (activityState.error && !activityState.data) {
    return <ErrorPanel message={activityState.error} retry={activityState.retry} />;
  }
  if (currentState.loading || activityState.loading) {
    return <LoadingSkeletons label="Loading weekly review" />;
  }
  if (!currentWeekStart) {
    return (
      <ErrorPanel
        message="Could not load the current week range. Please try again."
        retry={currentState.retry}
      />
    );
  }

  function selectWeek(startIso: string) {
    if (!currentWeekStart || startIso > currentWeekStart) return;
    setSelectedWeek(startIso === currentWeekStart ? null : startIso);
    setDraftOverride(undefined);
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
      const saved = await saveWeeklyReview(draft, savedReview?.id);
      setDraftOverride(reviewToFields(saved));
      setSuccess(`Your review for ${formatWeekRange(saved.week_start)} is saved on the server.`);
      historyState.retry();
      if (saved.week_start === currentState.data?.week_start) currentState.retry();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your review was not saved — everything you typed is still here. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(field: keyof ReviewFields, value: string) {
    setDraftOverride({
      ...draft,
      [field]: value,
      ...(field === "week_start" ? { week_end: shiftIsoDate(value, 6) } : {}),
    });
    setError(undefined);
    setSuccess(undefined);
  }

  return (
    <div className="page-stack qo-page">
      <PageHero
        actions={
          <div className="qo-week-nav">
            <button
              aria-label="View previous week"
              className="qo-icon-btn"
              disabled={selectedStart <= "2020-01-01"}
              onClick={() => selectWeek(shiftIsoDate(selectedStart, -7))}
              type="button"
            >
              <ChevronLeft size={19} />
            </button>
            <span className="qo-week-label">
              {isCurrentWeek ? "This week" : "Week of"} {formatWeekRange(selectedStart)}
            </span>
            <button
              aria-label="View current week"
              className="qo-icon-btn"
              disabled={isCurrentWeek}
              onClick={() => selectWeek(currentWeekStart)}
              type="button"
            >
              <CalendarDays size={18} />
            </button>
            <button
              aria-label="View next week"
              className="qo-icon-btn"
              disabled={!canGoNext}
              onClick={() => selectWeek(shiftIsoDate(selectedStart, 7))}
              type="button"
            >
              <ChevronRight size={19} />
            </button>
          </div>
        }
        eyebrow="PAUSE & REFLECT"
        icon={<Lightbulb size={28} />}
        subtitle={
          isCurrentWeek
            ? "Look back at the week so far, capture what you learned, and set next week's focus."
            : "A look back at a saved week — your reflections live here whenever you need them."
        }
        title="Your week in review"
      >
        <p className="qo-hero-motivation">
          {weekQuestsCompleted > 0
            ? `This week you completed ${weekQuestsCompleted} quest${weekQuestsCompleted === 1 ? "" : "s"} and earned ${weekXpEarned} XP. That's real, saved progress.`
            : weekActiveDays > 0
              ? "You showed up this week — every small step counts."
              : "No completions recorded this week yet. One small quest is all it takes to restart."}
        </p>
      </PageHero>

      <section aria-label="Weekly activity summary" className="qo-metric-grid">
        <MetricTile
          hint={`Week of ${formatWeekRange(selectedStart)}`}
          icon={<Trophy size={19} />}
          label="Quests completed"
          tone="green"
          value={weekQuestsCompleted}
        />
        <MetricTile
          hint="From your saved XP ledger"
          icon={<Star size={19} />}
          label="XP earned"
          tone="amber"
          value={weekXpEarned}
        />
        <MetricTile
          hint="Days with recorded activity"
          icon={<Clock3 size={19} />}
          label="Active days"
          tone="blue"
          value={`${weekActiveDays}/7`}
        />
        <MetricTile
          hint="Current streak, saved timezone"
          icon={<Flame size={19} />}
          label="Streak"
          tone="amber"
          value={`${streakState.data?.current_streak ?? 0} d`}
        />
      </section>

      <section aria-labelledby="qo-timeline-title" className="qo-panel">
        <div className="qo-panel-head">
          <h2 id="qo-timeline-title">Your week, day by day</h2>
          <span>{timezone}</span>
        </div>
        {weekActiveDays === 0 ? (
          <EmptyState
            icon={<Compass size={26} />}
            message={
              isCurrentWeek
                ? "No quest completions recorded for this week yet. Complete a quest and it will appear here automatically."
                : "Nothing was recorded during this week. That's okay — not every week is a sprint."
            }
            title="A quiet week"
          />
        ) : (
          <ul className="qo-timeline">
            {weekDays
              .filter((day) => day.has_activity)
              .map((day) => (
                <li key={day.date}>
                  <span aria-hidden="true" className="qo-timeline-dot" />
                  <div>
                    <strong>{formatWeekRange(day.date).split(" – ")[0]}</strong>
                    <p>
                      {day.quests_completed} quest{day.quests_completed === 1 ? "" : "s"} completed
                      · {day.xp_earned} XP earned
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <form className="qo-panel qo-review-form" onSubmit={(event) => void saveReview(event)}>
        <div className="qo-panel-head">
          <h2>Reflection journal</h2>
          <span>{savedReview ? "Editing your saved review" : "New review"}</span>
        </div>
        {PROMPTS.map((prompt, index) => (
          <label className="qo-review-field" key={prompt.field}>
            <span className="qo-review-prompt">
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <strong>{prompt.title}</strong>
            </span>
            <small>{prompt.hint}</small>
            <textarea
              maxLength={10000}
              onChange={(event) => updateDraft(prompt.field, event.target.value)}
              required
              rows={4}
              value={draft[prompt.field]}
            />
          </label>
        ))}
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        {success && <InlineNotice tone="success">{success}</InlineNotice>}
        <div className="qo-form-actions">
          <button className="qo-btn qo-btn-primary qo-btn-lg" disabled={saving} type="submit">
            <Save aria-hidden="true" size={17} />
            {saving
              ? "Saving…"
              : savedReview
                ? `Update review · ${formatWeekRange(selectedStart)}`
                : `Save review · ${formatWeekRange(selectedStart)}`}
          </button>
        </div>
      </form>

      <section aria-labelledby="qo-insights-title" className="qo-panel qo-insights">
        <div className="qo-panel-head">
          <h2 id="qo-insights-title">This week at a glance</h2>
        </div>
        <ul>
          <li>
            <Sparkles aria-hidden="true" size={16} />
            {weekQuestsCompleted > 0
              ? `You completed ${weekQuestsCompleted} quest${weekQuestsCompleted === 1 ? "" : "s"} and earned ${weekXpEarned} XP.`
              : "No quests were completed this week — a fresh one is waiting on your board."}
          </li>
          <li>
            <CalendarDays aria-hidden="true" size={16} />
            {upcomingDeadlines.length > 0
              ? `You have ${upcomingDeadlines.length} deadline${upcomingDeadlines.length === 1 ? "" : "s"} coming up.`
              : "No upcoming deadlines — a clear runway to pick something ambitious."}
          </li>
          <li>
            <Flame aria-hidden="true" size={16} />
            {streakState.data && streakState.data.current_streak > 0
              ? `Your current streak is ${streakState.data.current_streak} day${streakState.data.current_streak === 1 ? "" : "s"}. Keep the chain alive.`
              : "Start a streak by completing one quest today."}
          </li>
        </ul>
      </section>

      <section aria-labelledby="qo-planning-title" className="qo-panel qo-planning">
        <div className="qo-panel-head">
          <h2 id="qo-planning-title">Turn reflection into next week</h2>
        </div>
        <div className="qo-planning-grid">
          <article>
            <h3>
              <Flag aria-hidden="true" size={16} /> Your stated goal
            </h3>
            <p>
              {draft.next_priorities.trim()
                ? draft.next_priorities
                : "Your “Main goal for next week” from the journal above will show up here once you write it."}
            </p>
          </article>
          <article>
            <h3>
              <Target aria-hidden="true" size={16} /> Suggested next quest
            </h3>
            {nextQuest ? (
              <>
                <p>
                  <strong>{nextQuest.title}</strong> — {nextQuest.minutes} min · {nextQuest.xp} XP
                </p>
                <a className="qo-btn qo-btn-secondary" href="/quests">
                  Open quest board
                </a>
              </>
            ) : (
              <p>Every quest is complete — pick a new challenge from the roadmap.</p>
            )}
          </article>
          <article>
            <h3>
              <CalendarDays aria-hidden="true" size={16} /> Coming up
            </h3>
            {upcomingDeadlines.length > 0 ? (
              <>
                <ul className="qo-mini-list">
                  {upcomingDeadlines.slice(0, 3).map((deadline) => (
                    <li key={deadline.id}>
                      <strong>{deadline.title}</strong> · {deadline.due_date}
                    </li>
                  ))}
                </ul>
                <a className="qo-btn qo-btn-secondary" href="/deadlines">
                  Open deadlines
                </a>
              </>
            ) : (
              <p>No deadlines on your list right now.</p>
            )}
          </article>
        </div>
      </section>

      <section aria-labelledby="qo-history-title" className="qo-panel">
        <div className="qo-panel-head">
          <h2 id="qo-history-title">Review history</h2>
          <button className="qo-btn qo-btn-ghost" onClick={historyState.retry} type="button">
            Refresh
          </button>
        </div>
        {historyState.loading ? (
          <p role="status">Loading saved reviews…</p>
        ) : historyState.error ? (
          <ErrorPanel message={historyState.error} retry={historyState.retry} />
        ) : (historyState.data ?? []).length === 0 ? (
          <p className="qo-muted">
            Save your first review above and it will appear here for future reference.
          </p>
        ) : (
          <ul className="qo-history-list">
            {historyState.data?.map((review) => (
              <li key={review.id}>
                <span>
                  <strong>Week of {formatWeekRange(review.week_start)}</strong>
                  <small>
                    {review.week_start} → {review.week_end}
                  </small>
                </span>
                <button
                  aria-label={`Edit review for week of ${review.week_start}`}
                  className="qo-btn qo-btn-secondary"
                  onClick={() => selectWeek(review.week_start)}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={14} /> Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="gentle-note">
        <Lightbulb aria-hidden="true" size={18} />
        <p>
          <strong>Reflection, not judgement.</strong> Weeks with little activity still teach you
          something. Your pace is allowed to change.
        </p>
      </div>
    </div>
  );
}
