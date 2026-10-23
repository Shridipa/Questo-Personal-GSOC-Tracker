"use client";

import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  LockKeyhole,
  MapPin,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { fetchDashboardData, fetchProgress, fetchStreaks } from "@/lib/api";
import { QuestDetails } from "@/components/questline/quest-details";
import { useApiData } from "@/lib/use-api-data";
import type { Quest, QuestStatus } from "@/lib/quest-data";
import { getQuestResources } from "@/lib/quest-resources";

const pathOffsets = [50, 68, 35, 65, 35, 52, 66, 38];

function statusIcon(status: QuestStatus, isMilestone: boolean) {
  if (status === "completed") return <Check aria-hidden="true" size={22} strokeWidth={3} />;
  if (status === "locked") return <LockKeyhole aria-hidden="true" size={20} />;
  if (isMilestone) return <Trophy aria-hidden="true" size={23} />;
  if (status === "current") return <BookOpen aria-hidden="true" size={22} />;
  return <Star aria-hidden="true" size={20} />;
}

function makePath(quests: Quest[]) {
  return quests.reduce((path, _quest, index) => {
    const x = pathOffsets[index % pathOffsets.length];
    const y = 46 + index * 112;
    if (index === 0) return `M ${x} ${y}`;
    const previousX = pathOffsets[(index - 1) % pathOffsets.length];
    const previousY = 46 + (index - 1) * 112;
    const controlY = (previousY + y) / 2;
    return `${path} C ${previousX} ${controlY}, ${x} ${controlY}, ${x} ${y}`;
  }, "");
}

function DashboardLoading() {
  return (
    <div aria-label="Loading quest and roadmap data" className="home-grid" role="status">
      <section className="learning-column">
        <div className="welcome-row">
          <div className="loading-copy">
            <span className="skeleton skeleton-line short" />
            <span className="skeleton skeleton-line heading" />
            <span className="skeleton skeleton-line medium" />
          </div>
        </div>
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-path" />
      </section>
      <aside className="home-rail">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </aside>
    </div>
  );
}

function DashboardFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section aria-labelledby="dashboard-error-title" className="data-state" role="alert">
      <h1 id="dashboard-error-title">Quest data couldn&apos;t be loaded</h1>
      <p>{message}</p>
      <p>Check that the FastAPI service is running, then try again.</p>
      <button className="button button-primary" onClick={retry} type="button">
        Retry
      </button>
    </section>
  );
}

export function HomeDashboard() {
  const { data, error, loading, retry } = useApiData(fetchDashboardData);
  const progressState = useApiData(fetchProgress);
  const streakState = useApiData(fetchStreaks);
  const retryProgress = progressState.retry;
  const retryStreak = streakState.retry;
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const closeSelectedQuest = useCallback(() => {
    setSelectedQuest(null);
    retry();
    retryProgress();
    retryStreak();
  }, [retry, retryProgress, retryStreak]);

  if (loading) return <DashboardLoading />;
  if (error) {
    return (
      <DashboardFailure
        message={error}
        retry={() => {
          retry();
          progressState.retry();
          streakState.retry();
        }}
      />
    );
  }

  const quests = data?.quests ?? [];
  const phases = data?.phases ?? [];
  if (quests.length === 0) {
    return (
      <section aria-labelledby="dashboard-empty-title" className="data-state">
        <h1 id="dashboard-empty-title">Your quest path is ready for its first step</h1>
        <p>The API returned no quests. Add quest records to the local SQLite database to begin.</p>
        <button className="button button-secondary" onClick={retry} type="button">
          Refresh data
        </button>
      </section>
    );
  }

  const currentQuest = quests.find((quest) => quest.status === "current");
  const nextQuest =
    currentQuest ??
    quests.find((quest) => quest.status === "available") ??
    quests.find((quest) => quest.status !== "completed");
  const completedCount = quests.filter((quest) => quest.status === "completed").length;
  const allQuestsCompleted = quests.length > 0 && completedCount === quests.length;
  const activePhaseIndex = nextQuest
    ? phases.findIndex((phase) => phase.title === nextQuest.phase)
    : -1;
  const activePhase = activePhaseIndex >= 0 ? phases[activePhaseIndex] : undefined;
  const nextDeadline = data?.deadlines.find((deadline) => deadline.classification === "upcoming");
  const overdueDeadlineCount =
    data?.deadlines.filter((deadline) => deadline.classification === "overdue").length ?? 0;
  const path = makePath(quests);

  function openQuest(quest: Quest) {
    setSelectedQuest(quest);
  }

  return (
    <>
      <div className="preview-banner">
        <Sparkles aria-hidden="true" size={15} />
        <span>Quest, completion, XP, and streak data are loaded from the local API.</span>
      </div>
      <div className="home-grid">
        <section aria-labelledby="welcome-title" className="learning-column">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">
                YOUR OPEN-SOURCE JOURNEY <span aria-hidden="true">✦</span>
              </p>
              <h1 id="welcome-title">
                Hey, explorer! <span aria-hidden="true">👋</span>
              </h1>
              <p className="welcome-subtitle">Ready to make a little progress today?</p>
            </div>
            <div aria-hidden="true" className="welcome-sparkles">
              ✦
            </div>
          </div>

          <article className="daily-quest-card next-quest-card">
            <div className="daily-card-top">
              <div className="daily-status-group">
                <span className="daily-label">
                  <span className="live-dot" />{" "}
                  {allQuestsCompleted
                    ? "ALL QUESTS COMPLETE"
                    : currentQuest
                      ? "IN PROGRESS"
                      : "YOUR NEXT QUEST"}
                </span>
                {!allQuestsCompleted && nextQuest && (
                  <span className="next-quest-pulse-badge">
                    <Zap size={11} aria-hidden="true" /> Next Action
                  </span>
                )}
              </div>
              {nextQuest && <span className="date-chip">{nextQuest.phase}</span>}
              {allQuestsCompleted && <span className="date-chip gold-chip">🎉 All Done</span>}
            </div>

            {allQuestsCompleted ? (
              <div className="daily-card-content completed-all-content">
                <div className="daily-illustration completed-illustration" aria-hidden="true">
                  <Trophy size={32} className="trophy-gold" />
                </div>
                <div className="daily-copy">
                  <span className="quest-category celebration">MILESTONE ACHIEVED</span>
                  <h2>You&apos;ve completed every quest!</h2>
                  <p>
                    Outstanding work! You have finished all {quests.length} quests across all{" "}
                    {phases.length} phases. Keep your knowledge sharp or record this week&apos;s
                    reflection.
                  </p>
                  <div className="completed-card-actions">
                    <Link className="button button-primary" href="/weekly-review">
                      Open weekly review <ArrowRight size={15} />
                    </Link>
                    <Link className="button button-secondary" href="/roadmap">
                      View full roadmap <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="daily-card-content">
                <div className="daily-illustration" aria-hidden="true">
                  <div className="book-orbit">
                    <BookOpen size={28} strokeWidth={2} />
                  </div>
                  <span className="orbit-star star-one">✦</span>
                  <span className="orbit-star star-two">✦</span>
                  <span className="orbit-dot" />
                </div>
                <div className="daily-copy">
                  <div className="quest-header-tags">
                    <span className="quest-category learn">
                      {nextQuest
                        ? `${nextQuest.category} · ${nextQuest.phase}`
                        : "NO CURRENT QUEST"}
                    </span>
                    {nextQuest && <span className="quest-xp-badge">+{nextQuest.xp} XP</span>}
                  </div>
                  <h2>{nextQuest?.title ?? "No available quest is configured"}</h2>
                  <p>
                    {nextQuest?.description ??
                      "All listed quests are complete or locked. Check the quest board for the next available task."}
                  </p>
                  <div className="daily-meta">
                    {nextQuest && (
                      <span className="meta-time">
                        <Clock3 size={15} /> {nextQuest.minutes} min
                      </span>
                    )}
                    {nextQuest && nextQuest.date && (
                      <span className="meta-date">Target: {nextQuest.date}</span>
                    )}
                  </div>
                  {nextQuest &&
                    (() => {
                      const resources = getQuestResources(nextQuest.id);
                      const topResource = resources[0];
                      if (!topResource) return null;
                      return (
                        <div className="next-quest-resource-block">
                          <span className="resource-lead">Recommended resource:</span>
                          <a
                            href={topResource.url}
                            rel="noopener noreferrer"
                            target="_blank"
                            className="next-quest-resource-link"
                          >
                            <BookOpen size={13} aria-hidden="true" />
                            <span>{topResource.title}</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </a>
                        </div>
                      );
                    })()}
                  <button
                    className="button button-primary start-quest action-next-quest hero-action-btn"
                    disabled={!nextQuest}
                    onClick={() => nextQuest && openQuest(nextQuest)}
                    type="button"
                  >
                    <span>
                      {nextQuest?.status === "current"
                        ? "Continue Current Quest"
                        : "Start Quest Now"}
                    </span>
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            )}

            <div className="daily-card-footer">
              <span>
                <Sparkles size={14} /> One focused step is a win.
              </span>
              <span>
                {completedCount} of {quests.length} quests complete
              </span>
            </div>
          </article>

          <div className="section-heading quest-path-heading">
            <div>
              <p className="eyebrow">YOUR LEARNING ADVENTURE</p>
              <h2>
                {activePhase?.title ?? "Quest path"}{" "}
                {activePhase && (
                  <span className="phase-count">
                    PHASE {activePhase.id} OF {phases.length}
                  </span>
                )}
              </h2>
            </div>
            <button
              className="text-button"
              onClick={() =>
                document.getElementById("quest-path")?.scrollIntoView({ behavior: "smooth" })
              }
              type="button"
            >
              View path <ArrowDown size={16} />
            </button>
          </div>

          <section
            aria-label="Quest path"
            className="quest-path"
            id="quest-path"
            style={{ minHeight: `${quests.length * 112 + 120}px` }}
          >
            <svg
              aria-hidden="true"
              className="path-connector"
              preserveAspectRatio="none"
              viewBox={`0 0 100 ${quests.length * 112}`}
            >
              <path d={path} />
            </svg>
            {quests.map((quest, index) => {
              const isMilestone = quest.category.toLowerCase() === "milestone";
              const disabled = quest.status === "locked";
              return (
                <button
                  aria-label={`${quest.status === "locked" ? "Locked: " : ""}${quest.title}`}
                  className={`quest-node-row status-${quest.status}${isMilestone ? " milestone-node" : ""}`}
                  disabled={disabled}
                  key={quest.id}
                  onClick={() => openQuest(quest)}
                  style={{
                    left: `${pathOffsets[index % pathOffsets.length]}%`,
                    top: `${index * 112 + 18}px`,
                  }}
                  type="button"
                >
                  <span className="quest-node-icon">{statusIcon(quest.status, isMilestone)}</span>
                  <span className="quest-node-copy">
                    <strong>{quest.title}</strong>
                    <small>
                      {quest.date} <span>·</span> {quest.phase}
                    </small>
                  </span>
                  {isMilestone && (
                    <span aria-hidden="true" className="milestone-sparkle">
                      ✦
                    </span>
                  )}
                </button>
              );
            })}
            {activePhase?.milestone && (
              <div className="path-end">
                <span aria-hidden="true">🎁</span>
                <div>
                  <strong>Phase milestone</strong>
                  <small>{activePhase.milestone}</small>
                </div>
              </div>
            )}
          </section>
        </section>

        <aside aria-label="Roadmap information" className="home-rail">
          <section className="rail-card stats-rail-card compact-stats-card">
            <div className="rail-title">
              <span className="rail-icon goal-icon">
                <Trophy size={16} />
              </span>
              <div>
                <h3>Path at a glance</h3>
                <p>Personal roadmap totals</p>
              </div>
            </div>
            <div className="stats-grid data-summary compact-grid">
              <div className="stat-item">
                <span className="stat-label">
                  <Target size={11} aria-hidden="true" className="stat-sub-icon" /> Quests
                </span>
                <strong className="stat-value">{quests.length}</strong>
              </div>
              <div className="stat-item">
                <span className="stat-label">
                  <MapPin size={11} aria-hidden="true" className="stat-sub-icon" /> Phases
                </span>
                <strong className="stat-value">{phases.length}</strong>
              </div>
              <div className="stat-item stat-item-xp">
                <span className="stat-label">
                  <Star size={11} aria-hidden="true" className="stat-sub-icon" /> Total XP
                </span>
                <strong className="stat-value">
                  {progressState.data ? progressState.data.total_xp : 0}
                </strong>
              </div>
              <div className="stat-item stat-item-done">
                <span className="stat-label">
                  <CheckCircle2 size={11} aria-hidden="true" className="stat-sub-icon" /> Done
                </span>
                <strong className="stat-value">
                  {progressState.data ? progressState.data.completed_quests : 0}
                </strong>
              </div>
            </div>
          </section>

          {streakState.data && (
            <section className="rail-card streak-rail-card compact-streak-card">
              <div className="streak-compact-layout">
                <div className="streak-badge-orb" aria-hidden="true">
                  <Flame size={20} className="flame-active-glow" />
                </div>
                <div className="streak-badge-details">
                  <div className="streak-hero-reading">
                    <strong className="streak-hero-number">
                      {streakState.data.current_streak}
                    </strong>
                    <span className="streak-hero-text">day streak</span>
                  </div>
                  <div className="streak-meta-pill">
                    <span>Best: {streakState.data.longest_streak} days</span>
                  </div>
                </div>
              </div>
            </section>
          )}
          {activePhase && (
            <section className="deadline-note compact-phase-note">
              <div className="deadline-note-icon">
                <Trophy size={18} />
              </div>
              <div>
                <span className="eyebrow">CURRENT PHASE</span>
                <strong>{activePhase.title}</strong>
                {activePhase.dates && <small>{activePhase.dates}</small>}
              </div>
            </section>
          )}
          <section className="planning-summary compact-planning" aria-label="Planning summary">
            <div className="planning-row">
              <strong>Next deadline</strong>
              {nextDeadline ? (
                <span>
                  {nextDeadline.title} · {nextDeadline.due_date}
                </span>
              ) : (
                <span>No upcoming deadlines</span>
              )}
              <Link href="/deadlines">
                Manage deadlines <ArrowRight size={13} />
              </Link>
            </div>
            <div className="planning-row">
              <strong>{overdueDeadlineCount} overdue</strong>
              <span>Weekly review {data?.currentReview.review ? "saved" : "not written yet"}</span>
              <Link href="/weekly-review">
                Open weekly review <ArrowRight size={13} />
              </Link>
            </div>
          </section>
          <p className="progress-unavailable">
            {progressState.data
              ? `${progressState.data.completed_quests} of ${progressState.data.total_quests} quests complete · ${progressState.data.total_xp} XP earned.`
              : "Progress totals are loading from the API."}{" "}
            Streaks count distinct calendar days.
          </p>
        </aside>
      </div>
      {selectedQuest && (
        <QuestDetails key={selectedQuest.id} onClose={closeSelectedQuest} quest={selectedQuest} />
      )}
    </>
  );
}
