import type { Quest, RoadmapPhase } from "@/lib/quest-data";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

export type HealthResponse = { status: "ok" };

export type CompletionResult = {
  quest: Quest;
  completion: {
    id: string;
    completed_at_utc: string;
    local_date: string;
    xp_awarded: number;
  };
  total_xp: number;
  already_completed: boolean;
};

export type QuestWork = {
  quest_id: string;
  status: "not_started" | "in_progress";
  notes: string;
  evidence_url: string | null;
  checked_steps: string[];
  updated_at_utc: string | null;
};

export type QuestWorkUpdate = Pick<QuestWork, "notes" | "evidence_url" | "checked_steps">;

export type Progress = {
  total_xp: number;
  completed_quests: number;
  total_quests: number;
};

export type XpHistoryEntry = {
  id: string;
  quest_id: string;
  quest_title: string;
  points: number;
  reason: string;
  awarded_at_utc: string;
};

export type Streaks = {
  current_streak: number;
  longest_streak: number;
  timezone: string;
};

export type UserSettings = {
  daily_goal_minutes: 30 | 45 | 60 | 90;
  timezone: string;
  reminders_enabled: boolean;
  celebrations_enabled: boolean;
  updated_at_utc: string | null;
};

export type SettingsUpdate = Omit<UserSettings, "updated_at_utc">;

export type ActivityDay = {
  date: string;
  quests_completed: number;
  xp_earned: number;
  has_activity: boolean;
};

export type ActivityHistory = {
  start_date: string;
  end_date: string;
  timezone: string;
  days: ActivityDay[];
  totals: {
    quests_completed: number;
    xp_earned: number;
    active_days: number;
  };
};

export type WeeklyReview = {
  id: string;
  week_start: string;
  week_end: string;
  accomplishments: string;
  challenges: string;
  lessons_learned: string;
  next_priorities: string;
  created_at_utc: string;
  updated_at_utc: string;
};

export type ReviewFields = Omit<WeeklyReview, "id" | "created_at_utc" | "updated_at_utc">;

export type CurrentWeekReview = {
  week_start: string;
  review: WeeklyReview | null;
};

export type Deadline = {
  id: string;
  title: string;
  description: string;
  due_date: string;
  due_time: string | null;
  category: string;
  status: "pending" | "completed";
  classification: "upcoming" | "overdue" | "completed";
  url: string | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type DeadlineFields = Omit<
  Deadline,
  "id" | "status" | "classification" | "created_at_utc" | "updated_at_utc"
>;

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isReview(value: unknown): value is WeeklyReview {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isDateString(value.week_start) &&
    isDateString(value.week_end) &&
    typeof value.accomplishments === "string" &&
    typeof value.challenges === "string" &&
    typeof value.lessons_learned === "string" &&
    typeof value.next_priorities === "string" &&
    typeof value.created_at_utc === "string" &&
    typeof value.updated_at_utc === "string"
  );
}

function isDeadline(value: unknown): value is Deadline {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isDateString(value.due_date) &&
    (typeof value.due_time === "string" || value.due_time === null) &&
    typeof value.category === "string" &&
    (value.status === "pending" || value.status === "completed") &&
    (value.classification === "upcoming" ||
      value.classification === "overdue" ||
      value.classification === "completed") &&
    (typeof value.url === "string" || value.url === null) &&
    typeof value.created_at_utc === "string" &&
    typeof value.updated_at_utc === "string"
  );
}

function isQuest(value: unknown): value is Quest {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    typeof value.minutes === "number" &&
    Number.isInteger(value.minutes) &&
    typeof value.xp === "number" &&
    Number.isInteger(value.xp) &&
    (value.status === "completed" ||
      value.status === "current" ||
      value.status === "available" ||
      value.status === "locked") &&
    typeof value.phase === "string" &&
    typeof value.date === "string"
  );
}

function isRoadmapPhase(value: unknown): value is RoadmapPhase {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    typeof value.title === "string" &&
    typeof value.dates === "string" &&
    typeof value.description === "string" &&
    typeof value.milestone === "string" &&
    Array.isArray(value.quests) &&
    value.quests.every((quest) => typeof quest === "string")
  );
}

function isCompletionResult(value: unknown): value is CompletionResult {
  if (!isRecord(value) || !isRecord(value.completion)) return false;
  const completion = value.completion;
  return (
    isQuest(value.quest) &&
    typeof completion.id === "string" &&
    typeof completion.completed_at_utc === "string" &&
    typeof completion.local_date === "string" &&
    typeof completion.xp_awarded === "number" &&
    Number.isInteger(completion.xp_awarded) &&
    typeof value.total_xp === "number" &&
    Number.isInteger(value.total_xp) &&
    typeof value.already_completed === "boolean"
  );
}

function isQuestWork(value: unknown): value is QuestWork {
  return (
    isRecord(value) &&
    typeof value.quest_id === "string" &&
    (value.status === "not_started" || value.status === "in_progress") &&
    typeof value.notes === "string" &&
    (typeof value.evidence_url === "string" || value.evidence_url === null) &&
    Array.isArray(value.checked_steps) &&
    value.checked_steps.every((step) => typeof step === "string") &&
    (typeof value.updated_at_utc === "string" || value.updated_at_utc === null)
  );
}

function isProgress(value: unknown): value is Progress {
  return (
    isRecord(value) &&
    typeof value.total_xp === "number" &&
    Number.isInteger(value.total_xp) &&
    typeof value.completed_quests === "number" &&
    Number.isInteger(value.completed_quests) &&
    typeof value.total_quests === "number" &&
    Number.isInteger(value.total_quests)
  );
}

function isXpHistoryEntry(value: unknown): value is XpHistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.quest_id === "string" &&
    typeof value.quest_title === "string" &&
    typeof value.points === "number" &&
    Number.isInteger(value.points) &&
    typeof value.reason === "string" &&
    typeof value.awarded_at_utc === "string"
  );
}

function isStreaks(value: unknown): value is Streaks {
  return (
    isRecord(value) &&
    typeof value.current_streak === "number" &&
    Number.isInteger(value.current_streak) &&
    typeof value.longest_streak === "number" &&
    Number.isInteger(value.longest_streak) &&
    typeof value.timezone === "string"
  );
}

function isSettings(value: unknown): value is UserSettings {
  return (
    isRecord(value) &&
    (value.daily_goal_minutes === 30 ||
      value.daily_goal_minutes === 45 ||
      value.daily_goal_minutes === 60 ||
      value.daily_goal_minutes === 90) &&
    typeof value.timezone === "string" &&
    typeof value.reminders_enabled === "boolean" &&
    typeof value.celebrations_enabled === "boolean" &&
    (typeof value.updated_at_utc === "string" || value.updated_at_utc === null)
  );
}

function isActivityDay(value: unknown): value is ActivityDay {
  return (
    isRecord(value) &&
    isDateString(value.date) &&
    typeof value.quests_completed === "number" &&
    Number.isInteger(value.quests_completed) &&
    value.quests_completed >= 0 &&
    typeof value.xp_earned === "number" &&
    Number.isInteger(value.xp_earned) &&
    value.xp_earned >= 0 &&
    typeof value.has_activity === "boolean"
  );
}

function isActivityHistory(value: unknown): value is ActivityHistory {
  if (
    !isRecord(value) ||
    !isRecord(value.totals) ||
    !Array.isArray(value.days) ||
    !value.days.every(isActivityDay)
  ) {
    return false;
  }
  const days = value.days;
  const totals = value.totals;
  if (
    !isDateString(value.start_date) ||
    !isDateString(value.end_date) ||
    value.start_date > value.end_date ||
    typeof value.timezone !== "string" ||
    days.length === 0 ||
    days[0].date !== value.start_date ||
    days[days.length - 1].date !== value.end_date
  ) {
    return false;
  }
  let previousDate = "";
  for (const day of days) {
    if (day.date <= previousDate || day.has_activity !== day.quests_completed > 0) {
      return false;
    }
    previousDate = day.date;
  }

  return (
    typeof totals.quests_completed === "number" &&
    Number.isInteger(totals.quests_completed) &&
    totals.quests_completed >= 0 &&
    typeof totals.xp_earned === "number" &&
    Number.isInteger(totals.xp_earned) &&
    totals.xp_earned >= 0 &&
    typeof totals.active_days === "number" &&
    Number.isInteger(totals.active_days) &&
    totals.active_days >= 0 &&
    totals.quests_completed === days.reduce((sum, day) => sum + day.quests_completed, 0) &&
    totals.xp_earned === days.reduce((sum, day) => sum + day.xp_earned, 0) &&
    totals.active_days === days.filter((day) => day.has_activity).length
  );
}

async function requestJson(
  path: string,
  method = "GET",
  body?: unknown,
  expectJson = true,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown network error";
    throw new ApiError(`Could not reach the Questo API at ${API_BASE_URL}: ${detail}`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (typeof payload.detail === "string") detail = ` ${payload.detail}`;
        else if (Array.isArray(payload.detail)) {
          detail = ` ${payload.detail
            .map((item) =>
              isRecord(item) && typeof item.msg === "string" ? item.msg : "Invalid input",
            )
            .join(" ")}`;
        }
      }
    } catch {
      detail = "";
    }
    throw new ApiError(
      `Questo API request failed (${response.status} ${response.statusText}).${detail}`,
    );
  }

  if (!expectJson) return undefined;
  try {
    return await response.json();
  } catch {
    throw new ApiError("Questo API returned an invalid JSON response.");
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const payload = await requestJson("/health");
  if (!isRecord(payload) || payload.status !== "ok") {
    throw new ApiError("Questo API returned an unexpected health response.");
  }
  return { status: "ok" };
}

export async function fetchQuests(): Promise<Quest[]> {
  const payload = await requestJson("/api/quests");
  if (!isRecord(payload) || !Array.isArray(payload.quests) || !payload.quests.every(isQuest)) {
    throw new ApiError("Questo API returned quests in an unexpected format.");
  }
  return payload.quests;
}

export async function fetchRoadmapPhases(): Promise<RoadmapPhase[]> {
  const payload = await requestJson("/api/roadmap");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.phases) ||
    !payload.phases.every(isRoadmapPhase)
  ) {
    throw new ApiError("Questo API returned roadmap phases in an unexpected format.");
  }
  return payload.phases;
}

export async function completeQuest(questId: string): Promise<CompletionResult> {
  const payload = await requestJson(`/api/quests/${encodeURIComponent(questId)}/complete`, "POST");
  if (!isCompletionResult(payload)) {
    throw new ApiError("Questo API returned an unexpected completion response.");
  }
  return payload;
}

export async function fetchQuestWork(questId: string): Promise<QuestWork> {
  const payload = await requestJson(`/api/quests/${encodeURIComponent(questId)}/work`);
  if (!isQuestWork(payload) || payload.quest_id !== questId) {
    throw new ApiError("Questo API returned quest work in an unexpected format.");
  }
  return payload;
}

export async function saveQuestWork(questId: string, values: QuestWorkUpdate): Promise<QuestWork> {
  const payload = await requestJson(
    `/api/quests/${encodeURIComponent(questId)}/work`,
    "PUT",
    values,
  );
  if (!isQuestWork(payload) || payload.quest_id !== questId) {
    throw new ApiError("Questo API returned saved quest work in an unexpected format.");
  }
  return payload;
}

export async function fetchProgress(): Promise<Progress> {
  const payload = await requestJson("/api/progress");
  if (!isProgress(payload)) {
    throw new ApiError("Questo API returned progress in an unexpected format.");
  }
  return payload;
}

export async function fetchXpHistory(): Promise<XpHistoryEntry[]> {
  const payload = await requestJson("/api/progress/xp-history");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.entries) ||
    !payload.entries.every(isXpHistoryEntry)
  ) {
    throw new ApiError("Questo API returned XP history in an unexpected format.");
  }
  return payload.entries;
}

export async function fetchStreaks(): Promise<Streaks> {
  const payload = await requestJson("/api/progress/streaks");
  if (!isStreaks(payload)) {
    throw new ApiError("Questo API returned streaks in an unexpected format.");
  }
  return payload;
}

export async function fetchSettings(): Promise<UserSettings> {
  const payload = await requestJson("/api/settings");
  if (!isSettings(payload)) {
    throw new ApiError("Questo API returned settings in an unexpected format.");
  }
  return payload;
}

export async function updateSettings(values: SettingsUpdate): Promise<UserSettings> {
  const payload = await requestJson("/api/settings", "PUT", values);
  if (!isSettings(payload)) {
    throw new ApiError("Questo API returned saved settings in an unexpected format.");
  }
  return payload;
}

export async function fetchActivityHistory(days: number): Promise<ActivityHistory> {
  const payload = await requestJson(`/api/progress/activity?days=${days}`);
  if (!isActivityHistory(payload)) {
    throw new ApiError("Questo API returned activity history in an unexpected format.");
  }
  return payload;
}

export async function fetchWeeklyReviews(): Promise<WeeklyReview[]> {
  const payload = await requestJson("/api/reviews");
  if (!isRecord(payload) || !Array.isArray(payload.reviews) || !payload.reviews.every(isReview)) {
    throw new ApiError("Questo API returned weekly reviews in an unexpected format.");
  }
  return payload.reviews;
}

export async function fetchCurrentWeekReview(): Promise<CurrentWeekReview> {
  const payload = await requestJson("/api/reviews/current");
  if (
    !isRecord(payload) ||
    !isDateString(payload.week_start) ||
    !(payload.review === null || isReview(payload.review))
  ) {
    throw new ApiError("Questo API returned the current review in an unexpected format.");
  }
  return { week_start: payload.week_start, review: payload.review };
}

export async function saveWeeklyReview(
  values: ReviewFields,
  reviewId?: string,
): Promise<WeeklyReview> {
  const payload = await requestJson(
    reviewId ? `/api/reviews/${encodeURIComponent(reviewId)}` : "/api/reviews",
    reviewId ? "PUT" : "POST",
    values,
  );
  if (!isReview(payload)) {
    throw new ApiError("Questo API returned a weekly review in an unexpected format.");
  }
  return payload;
}

export async function fetchDeadlines(): Promise<Deadline[]> {
  const payload = await requestJson("/api/deadlines");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.deadlines) ||
    !payload.deadlines.every(isDeadline)
  ) {
    throw new ApiError("Questo API returned deadlines in an unexpected format.");
  }
  return payload.deadlines;
}

export async function createDeadline(values: DeadlineFields): Promise<Deadline> {
  const payload = await requestJson("/api/deadlines", "POST", values);
  if (!isDeadline(payload)) {
    throw new ApiError("Questo API returned a deadline in an unexpected format.");
  }
  return payload;
}

export async function updateDeadline(
  deadlineId: string,
  values: DeadlineFields & { status: "pending" | "completed" },
): Promise<Deadline> {
  const payload = await requestJson(
    `/api/deadlines/${encodeURIComponent(deadlineId)}`,
    "PUT",
    values,
  );
  if (!isDeadline(payload)) {
    throw new ApiError("Questo API returned a deadline in an unexpected format.");
  }
  return payload;
}

export async function completeDeadline(deadlineId: string): Promise<Deadline> {
  const payload = await requestJson(
    `/api/deadlines/${encodeURIComponent(deadlineId)}/complete`,
    "POST",
  );
  if (!isDeadline(payload)) {
    throw new ApiError("Questo API returned a deadline in an unexpected format.");
  }
  return payload;
}

export async function deleteDeadline(deadlineId: string): Promise<void> {
  await requestJson(`/api/deadlines/${encodeURIComponent(deadlineId)}`, "DELETE", undefined, false);
}

export async function fetchDashboardData(): Promise<{
  quests: Quest[];
  phases: RoadmapPhase[];
  deadlines: Deadline[];
  currentReview: CurrentWeekReview;
}> {
  const [quests, phases, deadlines, currentReview] = await Promise.all([
    fetchQuests(),
    fetchRoadmapPhases(),
    fetchDeadlines(),
    fetchCurrentWeekReview(),
  ]);
  return { quests, phases, deadlines, currentReview };
}
