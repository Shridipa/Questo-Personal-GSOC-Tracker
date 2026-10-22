from datetime import date, datetime, time, timedelta
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

QuestStatus = Literal["completed", "current", "available", "locked"]


class HealthResponse(BaseModel):
    status: Literal["ok"]


class QuestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    category: str
    minutes: int
    xp: int
    status: QuestStatus
    phase: str
    date: str


class QuestListResponse(BaseModel):
    quests: list[QuestResponse]


class QuestWorkUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str = Field(default="", max_length=10_000)
    evidence_url: HttpUrl | None = None
    checked_steps: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("notes")
    @classmethod
    def trim_notes(cls, value: str) -> str:
        return value.strip()

    @field_validator("checked_steps")
    @classmethod
    def validate_checked_steps(cls, value: list[str]) -> list[str]:
        normalized = [step.strip() for step in value]
        if any(not step or len(step) > 80 for step in normalized):
            raise ValueError("Checklist step IDs must contain 1 to 80 characters.")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Checklist step IDs must be unique.")
        return normalized


class QuestWorkResponse(QuestWorkUpdate):
    quest_id: str
    status: Literal["not_started", "in_progress"]
    updated_at_utc: datetime | None


class RoadmapPhaseResponse(BaseModel):
    id: int
    title: str
    dates: str
    description: str
    milestone: str
    quests: list[str]


class RoadmapResponse(BaseModel):
    phases: list[RoadmapPhaseResponse]


class CompletionRecordResponse(BaseModel):
    id: str
    completed_at_utc: str
    local_date: str
    xp_awarded: int


class QuestCompletionResponse(BaseModel):
    quest: QuestResponse
    completion: CompletionRecordResponse
    total_xp: int
    already_completed: bool


class ProgressResponse(BaseModel):
    total_xp: int
    completed_quests: int
    total_quests: int


class XpHistoryEntryResponse(BaseModel):
    id: str
    quest_id: str
    quest_title: str
    points: int
    reason: str
    awarded_at_utc: str


class XpHistoryResponse(BaseModel):
    entries: list[XpHistoryEntryResponse]


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    timezone: str


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daily_goal_minutes: Literal[30, 45, 60, 90]
    timezone: str = Field(min_length=1, max_length=100)
    reminders_enabled: bool
    celebrations_enabled: bool

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        normalized = value.strip()
        try:
            ZoneInfo(normalized)
        except (ValueError, ZoneInfoNotFoundError) as error:
            raise ValueError("Timezone must be a valid IANA timezone name.") from error
        return normalized


class SettingsResponse(SettingsUpdate):
    updated_at_utc: datetime | None


class ActivityDayResponse(BaseModel):
    date: date
    quests_completed: int
    xp_earned: int
    has_activity: bool


class ActivityTotalsResponse(BaseModel):
    quests_completed: int
    xp_earned: int
    active_days: int


class ActivityHistoryResponse(BaseModel):
    start_date: date
    end_date: date
    timezone: str
    days: list[ActivityDayResponse]
    totals: ActivityTotalsResponse


class WeeklyReviewFields(BaseModel):
    week_start: date
    week_end: date
    accomplishments: str = Field(min_length=1, max_length=10000)
    challenges: str = Field(min_length=1, max_length=10000)
    lessons_learned: str = Field(min_length=1, max_length=10000)
    next_priorities: str = Field(min_length=1, max_length=10000)

    @field_validator("accomplishments", "challenges", "lessons_learned", "next_priorities")
    @classmethod
    def trim_review_text(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Review text cannot be blank.")
        return trimmed

    @model_validator(mode="after")
    def validate_week_range(self) -> "WeeklyReviewFields":
        if self.week_start.weekday() != 0:
            raise ValueError("Week start must be a Monday.")
        if self.week_end != self.week_start + timedelta(days=6):
            raise ValueError("Week end must be the Sunday of the selected week.")
        return self


class WeeklyReviewCreate(WeeklyReviewFields):
    pass


class WeeklyReviewUpdate(WeeklyReviewFields):
    pass


class WeeklyReviewResponse(WeeklyReviewFields):
    id: UUID
    created_at_utc: datetime
    updated_at_utc: datetime


class WeeklyReviewListResponse(BaseModel):
    reviews: list[WeeklyReviewResponse]


class CurrentWeekReviewResponse(BaseModel):
    week_start: date
    review: WeeklyReviewResponse | None


class DeadlineFields(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    due_date: date
    due_time: time | None = None
    category: str = Field(min_length=1, max_length=80)
    url: HttpUrl | None = None

    @field_validator("title", "category")
    @classmethod
    def trim_required_deadline_text(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("This field cannot be blank.")
        return trimmed

    @field_validator("description")
    @classmethod
    def trim_deadline_description(cls, value: str) -> str:
        return value.strip()


class DeadlineCreate(DeadlineFields):
    pass


class DeadlineUpdate(DeadlineFields):
    status: Literal["pending", "completed"] = "pending"


class DeadlineResponse(DeadlineFields):
    id: UUID
    status: Literal["pending", "completed"]
    classification: Literal["upcoming", "overdue", "completed"]
    created_at_utc: datetime
    updated_at_utc: datetime


class DeadlineListResponse(BaseModel):
    deadlines: list[DeadlineResponse]
