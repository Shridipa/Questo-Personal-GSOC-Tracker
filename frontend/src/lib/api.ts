import type { Quest, RoadmapPhase } from "@/lib/quest-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://questo-personal-gsoc-tracker-1.onrender.com"
    : "http://127.0.0.1:8000";
const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const configuredApiUrlIsLocal =
  configuredApiBaseUrl !== undefined &&
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(configuredApiBaseUrl);
const resolvedBaseUrl = (
  process.env.NODE_ENV === "production" && configuredApiUrlIsLocal
    ? DEFAULT_API_BASE_URL
    : (configuredApiBaseUrl ?? DEFAULT_API_BASE_URL)
).replace(/\/+$/, "");

// Auto-correct any legacy URL missing the '-1' suffix
const API_BASE_URL = resolvedBaseUrl.replace(
  "https://questo-personal-gsoc-tracker.onrender.com",
  "https://questo-personal-gsoc-tracker-1.onrender.com",
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

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Session retrieval failed; proceed without token
  }
  return {};
}

async function requestJson(
  path: string,
  method = "GET",
  body?: unknown,
  expectJson = true,
  isRetry = false,
): Promise<unknown> {
  const authHeaders = await getAuthHeaders();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      method,
      headers: {
        ...authHeaders,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown network error";
    throw new ApiError(`Could not reach the Questo API at ${API_BASE_URL}: ${detail}`);
  }

  // Handle recoverable 401 with session refresh
  if (response.status === 401 && !isRetry && isSupabaseConfigured) {
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session) {
        return requestJson(path, method, body, expectJson, true);
      }
    } catch {
      // Refresh failed; proceed to throw standard ApiError
    }
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

export type ClaimResult = {
  imported_completions: number;
  imported_work_states: number;
  imported_reviews: number;
  imported_deadlines: number;
  message: string;
};

function isClaimResult(value: unknown): value is ClaimResult {
  return (
    isRecord(value) &&
    typeof value.imported_completions === "number" &&
    typeof value.imported_work_states === "number" &&
    typeof value.imported_reviews === "number" &&
    typeof value.imported_deadlines === "number" &&
    typeof value.message === "string"
  );
}

export async function claimGuestData(): Promise<ClaimResult> {
  const payload = await requestJson("/api/account/claim-guest-data", "POST");
  if (!isClaimResult(payload)) {
    throw new ApiError("Questo API returned an unexpected claim response.");
  }
  return payload;
}

export async function exportAccountData(): Promise<Record<string, unknown>> {
  const payload = await requestJson("/api/account/export", "GET");
  return payload as Record<string, unknown>;
}

export async function deleteAccountData(): Promise<void> {
  await requestJson("/api/account", "DELETE", undefined, false);
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

// --- Explore: GSoC organizations, repositories, preferences ---
// Mirrors backend/app/schemas_explore.py. Participation years are historical
// records from the GSoC archive; they never confirm future participation.

export type OrgSummary = {
  slug: string;
  name: string;
  description: string;
  category: string | null;
  logo_url: string | null;
  image_background_color: string | null;
  technologies: string[];
  topics: string[];
  participation_years: number[];
  latest_projects_count: number | null;
  repo_url: string | null;
  followed: boolean;
};

export type OrgDetail = OrgSummary & {
  website_url: string | null;
  ideas_url: string | null;
  guide_url: string | null;
  blog_url: string | null;
  twitter_url: string | null;
  irc_channel: string | null;
  contact_email: string | null;
  mailing_list: string | null;
  source: string | null;
  synced_at_utc: string | null;
  github_org_login: string | null;
};

export type CatalogMeta = {
  count: number;
  source: string | null;
  years: number[];
  year_note: string;
  stale: boolean;
};

export type OrgListResponse = {
  orgs: OrgSummary[];
  meta: CatalogMeta;
};

export type FollowState = {
  slug: string;
  followed: boolean;
  note: string;
  target_date: string | null;
};

export type FollowedOrg = {
  org_slug: string;
  name: string;
  note: string;
  target_date: string | null;
  created_at_utc: string;
  logo_url: string | null;
  category: string | null;
  participation_years: number[];
};

export type Preferences = {
  interests: string[];
  languages: string[];
  experience_level: "new" | "some" | "experienced";
  weekly_hours: number;
  updated_at_utc: string | null;
};

export type PreferencesUpdate = Omit<Preferences, "updated_at_utc">;

export type RepoSummary = {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string | null;
  license: string | null;
  archived: boolean;
  pushed_at: string | null;
};

export type RepoListResponse = {
  github_org: string;
  repositories: RepoSummary[];
  synced_at_utc: string;
  total_fetched: number;
  complete: boolean;
  note: string;
};

export type RepoDetail = RepoSummary & {
  created_at: string | null;
  homepage: string | null;
  language_totals: Record<string, number>;
  synced_at_utc: string;
};

export type RepoSelection = {
  org_slug: string | null;
  repo_full_name: string;
  status: "shortlisted" | "selected";
  created_at_utc: string;
  updated_at_utc: string | null;
};

export type IssueSummary = {
  number: number;
  title: string;
  url: string | null;
  state: string | null;
  labels: string[];
  comments: number;
  assignees: (string | null)[];
  created_at: string | null;
  updated_at: string | null;
};

export type IssueListResponse = {
  owner: string;
  repo: string;
  issues: IssueSummary[];
  has_more: boolean;
  labels_used: string[];
  synced_at_utc: string;
  note: string;
};

export type RecommendationEntry = {
  slug: string;
  name: string;
  score: number;
  reasons: string[];
  category: string | null;
  logo_url: string | null;
  participation_years: number[];
};

export type RecommendationResponse = {
  recommendations: RecommendationEntry[];
  based_on: Preferences;
};

export type ExploreOrgQuery = {
  q?: string;
  category?: string;
  technology?: string;
  topic?: string;
  limit?: number;
  offset?: number;
};

export type IssueLabelFilter = "good-first-issue" | "help-wanted" | "all";

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOrgSummary(value: unknown): value is OrgSummary {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (typeof value.category === "string" || value.category === null) &&
    (typeof value.logo_url === "string" || value.logo_url === null) &&
    isStringList(value.technologies) &&
    isStringList(value.topics) &&
    Array.isArray(value.participation_years) &&
    value.participation_years.every((year) => typeof year === "number" && Number.isInteger(year)) &&
    (typeof value.repo_url === "string" || value.repo_url === null) &&
    typeof value.followed === "boolean"
  );
}

function isCatalogMeta(value: unknown): value is CatalogMeta {
  return (
    isRecord(value) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    (typeof value.source === "string" || value.source === null) &&
    Array.isArray(value.years) &&
    value.years.every((year) => typeof year === "number" && Number.isInteger(year)) &&
    typeof value.year_note === "string" &&
    typeof value.stale === "boolean"
  );
}

export async function fetchOrgs(query: ExploreOrgQuery = {}): Promise<OrgListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.technology) params.set("technology", query.technology);
  if (query.topic) params.set("topic", query.topic);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const suffix = params.toString();
  const payload = await requestJson(`/api/orgs${suffix ? `?${suffix}` : ""}`);
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.orgs) ||
    !payload.orgs.every(isOrgSummary) ||
    !isCatalogMeta(payload.meta)
  ) {
    throw new ApiError("Questo API returned organizations in an unexpected format.");
  }
  return { orgs: payload.orgs, meta: payload.meta };
}

export async function fetchOrg(slug: string): Promise<OrgDetail> {
  const payload = await requestJson(`/api/orgs/${encodeURIComponent(slug)}`);
  if (!isRecord(payload) || !isOrgDetail(payload)) {
    throw new ApiError("Questo API returned an organization in an unexpected format.");
  }
  return payload;
}

function isOrgDetail(value: unknown): value is OrgDetail {
  if (!isOrgSummary(value)) return false;
  const record = value as Record<string, unknown>;
  const optionalFields: readonly string[] = [
    "website_url",
    "ideas_url",
    "guide_url",
    "blog_url",
    "twitter_url",
    "irc_channel",
    "contact_email",
    "mailing_list",
    "source",
    "synced_at_utc",
    "github_org_login",
  ];
  return optionalFields.every(
    (field) => typeof record[field] === "string" || record[field] === null,
  );
}

function isFollowState(value: unknown): value is FollowState {
  return isRecord(value) && typeof value.slug === "string" && typeof value.followed === "boolean";
}

export async function followOrg(
  slug: string,
  note = "",
  targetDate?: string,
): Promise<FollowState> {
  const payload = await requestJson(`/api/orgs/${encodeURIComponent(slug)}/follow`, "POST", {
    note,
    target_date: targetDate ?? null,
  });
  if (!isFollowState(payload)) {
    throw new ApiError("Questo API returned an unexpected follow response.");
  }
  return payload;
}

export async function unfollowOrg(slug: string): Promise<FollowState> {
  const payload = await requestJson(
    `/api/orgs/${encodeURIComponent(slug)}/follow`,
    "DELETE",
    undefined,
    true,
  );
  if (!isFollowState(payload)) {
    throw new ApiError("Questo API returned an unexpected unfollow response.");
  }
  return payload;
}

function isFollowedOrg(value: unknown): value is FollowedOrg {
  return (
    isRecord(value) &&
    typeof value.org_slug === "string" &&
    typeof value.name === "string" &&
    (typeof value.note === "string" || value.note === undefined) &&
    (typeof value.target_date === "string" || value.target_date === null) &&
    typeof value.created_at_utc === "string"
  );
}

export async function fetchFollows(): Promise<FollowedOrg[]> {
  const payload = await requestJson("/api/follows");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.follows) ||
    !payload.follows.every(isFollowedOrg)
  ) {
    throw new ApiError("Questo API returned followed organizations in an unexpected format.");
  }
  return payload.follows;
}

function isPreferences(value: unknown): value is Preferences {
  return (
    isRecord(value) &&
    isStringList(value.interests) &&
    isStringList(value.languages) &&
    (value.experience_level === "new" ||
      value.experience_level === "some" ||
      value.experience_level === "experienced") &&
    typeof value.weekly_hours === "number" &&
    Number.isInteger(value.weekly_hours) &&
    value.weekly_hours >= 0
  );
}

export async function fetchPreferences(): Promise<Preferences> {
  const payload = await requestJson("/api/profile/preferences");
  if (!isPreferences(payload)) {
    throw new ApiError("Questo API returned preferences in an unexpected format.");
  }
  return payload;
}

export async function savePreferences(values: PreferencesUpdate): Promise<Preferences> {
  const payload = await requestJson("/api/profile/preferences", "PUT", values);
  if (!isPreferences(payload)) {
    throw new ApiError("Questo API returned saved preferences in an unexpected format.");
  }
  return payload;
}

function isRecommendationEntry(value: unknown): value is RecommendationEntry {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.score === "number" &&
    isStringList(value.reasons)
  );
}

export async function fetchRecommendations(): Promise<RecommendationResponse> {
  const payload = await requestJson("/api/recommendations");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.recommendations) ||
    !payload.recommendations.every(isRecommendationEntry) ||
    !isPreferences(payload.based_on)
  ) {
    throw new ApiError("Questo API returned recommendations in an unexpected format.");
  }
  return payload as RecommendationResponse;
}

function isRepoSummary(value: unknown): value is RepoSummary {
  return (
    isRecord(value) &&
    typeof value.full_name === "string" &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    (typeof value.html_url === "string" || value.html_url === null) &&
    (typeof value.language === "string" || value.language === null) &&
    isStringList(value.topics) &&
    typeof value.stargazers_count === "number" &&
    typeof value.forks_count === "number" &&
    typeof value.open_issues_count === "number" &&
    typeof value.archived === "boolean"
  );
}

async function requestRepoList(path: string): Promise<RepoListResponse> {
  const payload = await requestJson(path);
  if (
    !isRecord(payload) ||
    typeof payload.github_org !== "string" ||
    !Array.isArray(payload.repositories) ||
    !payload.repositories.every(isRepoSummary)
  ) {
    throw new ApiError("Questo API returned repositories in an unexpected format.");
  }
  return payload as RepoListResponse;
}

export async function fetchOrgRepos(slug: string): Promise<RepoListResponse> {
  return requestRepoList(`/api/orgs/${encodeURIComponent(slug)}/repos`);
}

export async function fetchOrgReposRefreshed(slug: string): Promise<RepoListResponse> {
  return requestRepoList(`/api/orgs/${encodeURIComponent(slug)}/repos?refresh=force`);
}

export async function fetchRepoDetail(owner: string, repo: string): Promise<RepoDetail> {
  const payload = await requestJson(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  if (!isRecord(payload) || !isRepoDetail(payload)) {
    throw new ApiError("Questo API returned repository details in an unexpected format.");
  }
  return payload;
}

function isRepoDetail(value: unknown): value is RepoDetail {
  if (!isRepoSummary(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (typeof record.created_at === "string" || record.created_at === null) &&
    (typeof record.homepage === "string" || record.homepage === null) &&
    isRecord(record.language_totals) &&
    Object.values(record.language_totals).every(
      (count) => typeof count === "number" && Number.isInteger(count),
    ) &&
    typeof record.synced_at_utc === "string"
  );
}

function isIssueSummary(value: unknown): value is IssueSummary {
  return (
    isRecord(value) &&
    typeof value.number === "number" &&
    Number.isInteger(value.number) &&
    typeof value.title === "string" &&
    isStringList(value.labels)
  );
}

export async function fetchRepoIssues(
  owner: string,
  repo: string,
  label: IssueLabelFilter = "good-first-issue",
  page = 1,
): Promise<IssueListResponse> {
  const payload = await requestJson(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/issues?label=${label}&page=${page}`,
  );
  if (
    !isRecord(payload) ||
    typeof payload.owner !== "string" ||
    typeof payload.repo !== "string" ||
    !Array.isArray(payload.issues) ||
    !payload.issues.every(isIssueSummary) ||
    typeof payload.has_more !== "boolean"
  ) {
    throw new ApiError("Questo API returned issues in an unexpected format.");
  }
  return payload as IssueListResponse;
}

function isRepoSelection(value: unknown): value is RepoSelection {
  return (
    isRecord(value) &&
    typeof value.repo_full_name === "string" &&
    (value.status === "shortlisted" || value.status === "selected") &&
    typeof value.created_at_utc === "string"
  );
}

export async function putRepoSelection(
  owner: string,
  repo: string,
  orgSlug: string | null = null,
  status: RepoSelection["status"] = "shortlisted",
): Promise<RepoSelection[]> {
  const payload = await requestJson(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/selection`,
    "PUT",
    { org_slug: orgSlug, status },
  );
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.selections) ||
    !payload.selections.every(isRepoSelection)
  ) {
    throw new ApiError("Questo API returned repository selections in an unexpected format.");
  }
  return payload.selections;
}

export async function deleteRepoSelection(owner: string, repo: string): Promise<void> {
  await requestJson(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/selection`,
    "DELETE",
    undefined,
    true,
  );
}

export async function fetchMyRepoSelections(): Promise<RepoSelection[]> {
  const payload = await requestJson("/api/me/repos");
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.selections) ||
    !payload.selections.every(isRepoSelection)
  ) {
    throw new ApiError("Questo API returned repository selections in an unexpected format.");
  }
  return payload.selections;
}

// ─── Journey / Contribution workspace ────────────────────────────────────────

export type JourneyStatus =
  | "preparing"
  | "issue_selected"
  | "in_progress"
  | "pr_open"
  | "changes_requested"
  | "merged"
  | "closed"
  | "paused"
  | "abandoned";

export type JourneyChecklistItem = {
  item_key: string;
  title: string;
  completed: boolean;
  notes: string;
  completed_at_utc: string | null;
  updated_at_utc: string;
};

export type JourneyTask = {
  id: string;
  journey_id: string;
  title: string;
  completed: boolean;
  sort_order: number;
  created_at_utc: string;
  updated_at_utc: string;
};

export type JourneyEvent = {
  id: string;
  event_type: string;
  description: string;
  created_at_utc: string;
};

export type JournalFields = {
  summary: string;
  reproduction_steps: string;
  expected_vs_actual: string;
  relevant_files: string;
  potential_causes: string;
  proposed_solution: string;
  tests_to_run: string;
  questions_for_maintainers: string;
  lessons_learned: string;
  updated_at_utc: string;
};

export type JourneySummary = {
  id: string;
  user_id: string;
  repo_owner: string;
  repo_name: string;
  repo_full_name: string;
  repo_url: string;
  org_slug: string | null;
  title: string;
  status: JourneyStatus;
  issue_number: number | null;
  issue_title: string | null;
  issue_url: string | null;
  issue_state: string | null;
  issue_labels: string[];
  pr_number: number | null;
  pr_title: string | null;
  pr_url: string | null;
  pr_state: string | null;
  pr_is_draft: boolean;
  checklist_completed_count: number;
  checklist_total_count: number;
  tasks_completed_count: number;
  tasks_total_count: number;
  created_at_utc: string;
  updated_at_utc: string;
};

export type JourneyDetail = JourneySummary & {
  issue_comments: number;
  issue_attached_at_utc: string | null;
  pr_merged_at: string | null;
  pr_closed_at: string | null;
  pr_synced_at_utc: string | null;
  checklist: JourneyChecklistItem[];
  journal: JournalFields;
  tasks: JourneyTask[];
  events: JourneyEvent[];
};

function isJourneySummary(value: unknown): value is JourneySummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.repo_owner === "string" &&
    typeof value.repo_name === "string" &&
    typeof value.repo_full_name === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    typeof value.checklist_completed_count === "number" &&
    typeof value.checklist_total_count === "number"
  );
}

export async function fetchJourneys(statusFilter?: string): Promise<JourneySummary[]> {
  const suffix = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  const payload = await requestJson(`/api/journeys${suffix}`);
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.journeys) ||
    !payload.journeys.every(isJourneySummary)
  ) {
    throw new ApiError("Questo API returned journeys in an unexpected format.");
  }
  return payload.journeys;
}

export async function fetchJourney(journeyId: string): Promise<JourneyDetail> {
  const payload = await requestJson(`/api/journeys/${encodeURIComponent(journeyId)}`);
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function startJourney(
  repoOwner: string,
  repoName: string,
  orgSlug: string | null = null,
  title?: string,
): Promise<JourneyDetail> {
  const payload = await requestJson("/api/journeys", "POST", {
    repo_owner: repoOwner,
    repo_name: repoName,
    org_slug: orgSlug,
    title: title ?? null,
  });
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function getActiveJourneyForRepo(
  owner: string,
  repo: string,
): Promise<JourneySummary | null> {
  const payload = await requestJson(
    `/api/journeys/active/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  if (!isRecord(payload)) {
    throw new ApiError("Questo API returned an unexpected journey lookup response.");
  }
  const j = payload.journey;
  if (j === null || j === undefined) return null;
  if (!isJourneySummary(j)) throw new ApiError("Active journey has unexpected shape.");
  return j;
}

export async function updateJourneyStatus(
  journeyId: string,
  status: JourneyStatus,
  note?: string,
): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/status`,
    "PATCH",
    {
      status,
      note: note ?? null,
    },
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function updateChecklistItem(
  journeyId: string,
  itemKey: string,
  completed: boolean,
  notes: string,
): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/checklist/${encodeURIComponent(itemKey)}`,
    "PUT",
    { completed, notes },
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function saveJournal(
  journeyId: string,
  fields: Omit<JournalFields, "updated_at_utc">,
): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/journal`,
    "PUT",
    fields,
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function addJourneyTask(journeyId: string, title: string): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/tasks`,
    "POST",
    { title },
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function updateJourneyTask(
  journeyId: string,
  taskId: string,
  update: { title?: string; completed?: boolean },
): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/tasks/${encodeURIComponent(taskId)}`,
    "PATCH",
    update,
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function deleteJourneyTask(journeyId: string, taskId: string): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/tasks/${encodeURIComponent(taskId)}`,
    "DELETE",
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function attachJourneyIssue(
  journeyId: string,
  issueNumber?: number,
  issueUrl?: string,
): Promise<JourneyDetail> {
  const payload = await requestJson(`/api/journeys/${encodeURIComponent(journeyId)}/issue`, "PUT", {
    issue_number: issueNumber ?? null,
    issue_url: issueUrl ?? null,
  });
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function detachJourneyIssue(journeyId: string): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/issue`,
    "DELETE",
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function linkJourneyPr(
  journeyId: string,
  prNumber?: number,
  prUrl?: string,
): Promise<JourneyDetail> {
  const payload = await requestJson(`/api/journeys/${encodeURIComponent(journeyId)}/pr`, "PUT", {
    pr_number: prNumber ?? null,
    pr_url: prUrl ?? null,
  });
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function refreshJourneyPr(journeyId: string): Promise<JourneyDetail> {
  const payload = await requestJson(
    `/api/journeys/${encodeURIComponent(journeyId)}/pr/refresh`,
    "POST",
  );
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

export async function unlinkJourneyPr(journeyId: string): Promise<JourneyDetail> {
  const payload = await requestJson(`/api/journeys/${encodeURIComponent(journeyId)}/pr`, "DELETE");
  if (!isRecord(payload) || !isJourneySummary(payload)) {
    throw new ApiError("Questo API returned a journey in an unexpected format.");
  }
  return payload as JourneyDetail;
}

/** Normalize a thrown error into a user-facing message without faking success. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while reaching Questo's API.";
}
