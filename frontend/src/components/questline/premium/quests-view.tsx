"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  Flame,
  LockKeyhole,
  Search,
  Sparkles,
  Star,
  Target,
  Telescope,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { fetchProgress, fetchQuests, fetchStreaks } from "@/lib/api";
import type { Quest } from "@/lib/quest-data";
import { useApiData } from "@/lib/use-api-data";
import { QuestDetails } from "@/components/questline/quest-details";
import {
  EmptyState,
  ErrorPanel,
  FilterChips,
  LoadingSkeletons,
  MetricTile,
  PageHero,
  ProgressBar,
  StatusBadge,
} from "./shared";

type StatusFilter = "all" | "current" | "available" | "completed" | "locked";

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function statusTone(status: Quest["status"]) {
  if (status === "completed") return "green" as const;
  if (status === "current") return "blue" as const;
  if (status === "locked") return "neutral" as const;
  return "lavender" as const;
}

function statusLabel(status: Quest["status"]) {
  if (status === "completed") return "Completed";
  if (status === "current") return "In progress";
  if (status === "locked") return "Locked";
  return "Available";
}

function actionLabel(status: Quest["status"]) {
  if (status === "completed") return "Review quest";
  if (status === "current") return "Continue quest";
  return "Start quest";
}

function nextQuestFrom(quests: Quest[]): Quest | null {
  return (
    quests.find((quest) => quest.status === "current") ??
    quests.find((quest) => quest.status === "available") ??
    null
  );
}

export function QuestsView() {
  const questsState = useApiData(fetchQuests);
  const progressState = useApiData(fetchProgress);
  const streakState = useApiData(fetchStreaks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

  const closeSelectedQuest = () => {
    setSelectedQuest(null);
    questsState.retry();
    progressState.retry();
    streakState.retry();
  };

  const quests = useMemo(
    () => (questsState.data ?? []).filter((quest) => quest.id !== "welcome"),
    [questsState.data],
  );
  const phases = useMemo(() => {
    const seen: string[] = [];
    for (const quest of quests) {
      if (quest.phase && !seen.includes(quest.phase)) seen.push(quest.phase);
    }
    return seen;
  }, [quests]);

  if (questsState.loading) return <LoadingSkeletons label="Loading quests" />;
  if (questsState.error) {
    return <ErrorPanel message={questsState.error} retry={questsState.retry} />;
  }

  if (quests.length === 0) {
    return (
      <EmptyState
        action={
          <button className="qo-btn qo-btn-primary" onClick={questsState.retry} type="button">
            Refresh quests
          </button>
        }
        icon={<Trophy size={30} />}
        message="The API returned an empty quest list for now. Try refreshing in a moment."
        title="No quests available yet"
      />
    );
  }

  const progress = progressState.data;
  const streaks = streakState.data;
  const completedCount = quests.filter((quest) => quest.status === "completed").length;
  const availableCount = quests.filter((quest) => quest.status === "available").length;
  const currentCount = quests.filter((quest) => quest.status === "current").length;
  const lockedCount = quests.filter((quest) => quest.status === "locked").length;
  const remainingMinutes = quests
    .filter((quest) => quest.status !== "completed")
    .reduce((total, quest) => total + quest.minutes, 0);
  const nextQuest = nextQuestFrom(quests);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = quests.filter((quest) => {
    if (statusFilter !== "all" && quest.status !== statusFilter) return false;
    if (phaseFilter !== "all" && quest.phase !== phaseFilter) return false;
    if (
      normalizedSearch &&
      !quest.title.toLowerCase().includes(normalizedSearch) &&
      !quest.description.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });
  const filtersActive = statusFilter !== "all" || phaseFilter !== "all" || normalizedSearch !== "";

  return (
    <div className="page-stack qo-page">
      <PageHero
        actions={
          nextQuest ? (
            <button
              className="qo-btn qo-btn-primary qo-btn-lg"
              onClick={() => setSelectedQuest(nextQuest)}
              type="button"
            >
              {nextQuest.status === "current" ? "Continue your quest" : "Start your first quest"}
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          ) : (
            <span className="qo-hero-all-done">
              <CheckCircle2 aria-hidden="true" size={20} /> All quests complete — amazing work!
            </span>
          )
        }
        eyebrow="YOUR OPEN-SOURCE ADVENTURE"
        icon={<Telescope size={28} />}
        subtitle={
          nextQuest
            ? `${greetingForNow()}! "${nextQuest.title}" is your next step — about ${nextQuest.minutes} minutes.`
            : `${greetingForNow()}! Every quest on your board is complete. Check the roadmap for what comes next.`
        }
        title="Quest board"
      >
        <div className="qo-hero-progress">
          <ProgressBar
            label={`quests complete (${completedCount} of ${quests.length})`}
            max={quests.length}
            value={completedCount}
          />
          <div className="qo-hero-progress-side">
            <strong>
              {progress?.total_xp ?? 0} XP <span>earned</span>
            </strong>
            <small>
              <Flame aria-hidden="true" size={14} /> {streaks?.current_streak ?? 0}-day streak
            </small>
          </div>
        </div>
      </PageHero>

      <section aria-label="Quest summary" className="qo-metric-grid">
        <MetricTile
          hint="Quests you can begin right now"
          icon={<Target size={19} />}
          label="Available"
          tone="green"
          value={availableCount}
        />
        <MetricTile
          hint="Finished and saved on the server"
          icon={<CheckCircle2 size={19} />}
          label="Completed"
          tone="blue"
          value={`${completedCount}/${quests.length}`}
        />
        <MetricTile
          hint="Total XP in your ledger"
          icon={<Star size={19} />}
          label="Total XP"
          tone="amber"
          value={progress?.total_xp ?? 0}
        />
        <MetricTile
          hint="Across quests you haven't finished yet"
          icon={<Clock3 size={19} />}
          label="Minutes to go"
          value={remainingMinutes}
        />
      </section>

      <section aria-label="Filter quests" className="qo-toolbar">
        <FilterChips
          legend="Filter quests by status"
          onSelect={(id) => setStatusFilter(id as StatusFilter)}
          options={[
            { id: "all", label: "All quests", count: quests.length },
            { id: "current", label: "Continue", count: currentCount },
            { id: "available", label: "Available", count: availableCount },
            { id: "completed", label: "Completed", count: completedCount },
            { id: "locked", label: "Locked", count: lockedCount },
          ]}
          selected={statusFilter}
        />
        <div className="qo-toolbar-row">
          <label className="qo-search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search quests by title or description</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quests…"
              type="search"
              value={search}
            />
          </label>
          {phases.length > 1 && (
            <label className="qo-select-label">
              <span>Phase</span>
              <select onChange={(event) => setPhaseFilter(event.target.value)} value={phaseFilter}>
                <option value="all">All phases</option>
                {phases.map((phase) => (
                  <option key={phase} value={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </label>
          )}
          {filtersActive && (
            <button
              className="qo-btn qo-btn-ghost"
              onClick={() => {
                setStatusFilter("all");
                setPhaseFilter("all");
                setSearch("");
              }}
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          action={
            <button
              className="qo-btn qo-btn-secondary"
              onClick={() => {
                setStatusFilter("all");
                setPhaseFilter("all");
                setSearch("");
              }}
              type="button"
            >
              Show all quests
            </button>
          }
          icon={<Compass size={28} />}
          message="No quests match the current filters. Try clearing them to see the full board."
          title="Nothing matches these filters"
        />
      ) : (
        <ul className="qo-quest-grid">
          {filtered.map((quest) => {
            const isLocked = quest.status === "locked";
            const isDone = quest.status === "completed";
            const isNext = nextQuest?.id === quest.id;
            return (
              <li
                className={`qo-quest-card${isNext ? " qo-quest-card-next" : ""}${isDone ? " qo-quest-card-done" : ""}${isLocked ? " qo-quest-card-locked" : ""}`}
                key={quest.id}
              >
                {isNext && (
                  <span className="qo-quest-flag">
                    <Sparkles aria-hidden="true" size={14} /> Your next quest
                  </span>
                )}
                <div className="qo-quest-card-head">
                  <StatusBadge tone={statusTone(quest.status)}>{statusLabel(quest.status)}</StatusBadge>
                  <span className={`quest-category ${quest.category.toLowerCase()}`}>
                    {quest.category}
                  </span>
                </div>
                <h3>{quest.title}</h3>
                <p className="qo-quest-desc">{quest.description}</p>
                <dl className="qo-quest-meta">
                  <div>
                    <dt>
                      <Clock3 aria-hidden="true" size={14} /> Time
                    </dt>
                    <dd>{quest.minutes} min</dd>
                  </div>
                  <div>
                    <dt>
                      <Star aria-hidden="true" size={14} /> Reward
                    </dt>
                    <dd>{quest.xp} XP</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{quest.phase || "—"}</dd>
                  </div>
                </dl>
                <button
                  className={`qo-btn ${isNext ? "qo-btn-primary" : "qo-btn-secondary"} qo-quest-action`}
                  disabled={isLocked}
                  onClick={() => setSelectedQuest(quest)}
                  type="button"
                >
                  {isLocked ? (
                    <>
                      <LockKeyhole aria-hidden="true" size={16} /> Locked
                    </>
                  ) : (
                    actionLabel(quest.status)
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="gentle-note">
        <Trophy aria-hidden="true" size={18} />
        <p>
          <strong>No pressure.</strong> XP is awarded once per quest, right from the server. Missing
          a day never takes progress away.
        </p>
      </div>

      {selectedQuest && (
        <QuestDetails key={selectedQuest.id} onClose={closeSelectedQuest} quest={selectedQuest} />
      )}
    </div>
  );
}
