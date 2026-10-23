"use client";

import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleHelp,
  Download,
  ExternalLink,
  Flag,
  Flame,
  Lightbulb,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import {
  claimGuestData,
  exportAccountData,
  fetchActivityHistory,
  fetchDashboardData,
  fetchProgress,
  fetchSettings,
  fetchStreaks,
  fetchXpHistory,
  updateSettings,
  type SettingsUpdate,
  type UserSettings,
} from "@/lib/api";
import { QuestsView } from "@/components/questline/premium/quests-view";
import { DeadlinesView } from "@/components/questline/premium/deadlines-view";
import { WeeklyReviewView } from "@/components/questline/premium/weekly-review-view";
import { getPhaseResources } from "@/lib/quest-resources";
import { useApiData } from "@/lib/use-api-data";
import { useAuth } from "@/lib/auth-context";

export type FeaturePageKey =
  | "quests"
  | "roadmap"
  | "progress"
  | "weekly-review"
  | "deadlines"
  | "settings";

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

function SettingsView() {
  const { user, signOut, isLoading: authLoading } = useAuth();
  const settingsState = useApiData(fetchSettings);
  const [draftOverride, setDraftOverride] = useState<SettingsUpdate>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [syncingGuest, setSyncingGuest] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string>();
  const [exporting, setExporting] = useState(false);

  async function handleClaimGuest() {
    setSyncingGuest(true);
    setSyncNotice(undefined);
    try {
      const res = await claimGuestData();
      setSyncNotice(res.message);
      settingsState.retry();
    } catch (e) {
      setSyncNotice(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncingGuest(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questo-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export data: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  }
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
            <h2>Reminders &amp; encouragement</h2>
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
      <section className="settings-group">
        <div className="settings-group-heading">
          <UserCircle2 size={18} />
          <div>
            <h2>Account</h2>
            <p>Your identity and cloud sync status.</p>
          </div>
        </div>
        {authLoading ? (
          <div style={{ padding: "0.5rem 0", color: "var(--text-muted, #94a3b8)", fontSize: "0.875rem" }}>Loading account…</div>
        ) : user ? (
          <>
            <div className="setting-row" style={{ alignItems: "flex-start" }}>
              <span>
                <strong>Signed-in account</strong>
                <small>{user.email}</small>
              </span>
              <span className="setting-value" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#10b981", fontWeight: 600 }}>
                <ShieldCheck size={14} />
                {user.email_confirmed_at ? "Verified" : "Unverified"}
              </span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Cloud sync</strong>
                <small>Your progress, quests, and settings save to the cloud.</small>
              </span>
              <span className="setting-value" style={{ color: "#10b981", fontWeight: 600 }}>Active</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Backup &amp; Export</strong>
                <small>Download a full copy of your quests, XP, reviews, and deadlines.</small>
              </span>
              <button
                className="button button-outline"
                disabled={exporting}
                onClick={() => void handleExport()}
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                type="button"
              >
                <Download size={14} /> {exporting ? "Exporting…" : "Export JSON"}
              </button>
            </div>
            <div className="setting-row">
              <span>
                <strong>Sync local guest progress</strong>
                <small>Transfer any milestones or deadlines completed as guest into this account.</small>
              </span>
              <button
                className="button button-outline"
                disabled={syncingGuest}
                onClick={() => void handleClaimGuest()}
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                type="button"
              >
                <RefreshCw size={14} className={syncingGuest ? "spin" : ""} /> {syncingGuest ? "Syncing…" : "Transfer guest data"}
              </button>
            </div>
            {syncNotice && (
              <div style={{ padding: "0.5rem 0.75rem", background: "#f0fdf4", color: "#166534", borderRadius: "8px", fontSize: "0.8125rem" }}>
                {syncNotice}
              </div>
            )}
            <div className="setting-row">
              <span>
                <strong>Sign out</strong>
                <small>You will return to guest mode. Local data is preserved.</small>
              </span>
              <button
                className="button button-outline"
                onClick={() => void signOut()}
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                type="button"
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="setting-row">
              <span>
                <strong>Not signed in</strong>
                <small>Sign in to save and sync your progress across all devices.</small>
              </span>
              <span className="setting-value">Guest mode</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Create account or sign in</strong>
                <small>Free. No spam. Cloud-backed data forever.</small>
              </span>
              <a
                className="button button-primary"
                href="/login"
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", textDecoration: "none" }}
              >
                <LogIn size={14} /> Sign in
              </a>
            </div>
          </>
        )}
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
          {saving ? <span className="button-spinner" /> : <Save size={16} />}
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
      {page === "quests" && <QuestsView />}
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
