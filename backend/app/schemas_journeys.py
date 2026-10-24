"""Pydantic schemas for the Repository-Specific Contribution Journey API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

JourneyStatus = Literal[
    "preparing",
    "issue_selected",
    "in_progress",
    "pr_open",
    "changes_requested",
    "merged",
    "closed",
    "paused",
    "abandoned",
]

VALID_STATUSES: set[str] = {
    "preparing",
    "issue_selected",
    "in_progress",
    "pr_open",
    "changes_requested",
    "merged",
    "closed",
    "paused",
    "abandoned",
}


class JourneyCreate(BaseModel):
    repo_owner: str = Field(min_length=1, max_length=100)
    repo_name: str = Field(min_length=1, max_length=100)
    org_slug: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=200)

    @field_validator("repo_owner", "repo_name")
    @classmethod
    def _strip_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Must not be blank.")
        return cleaned


class JourneyStatusUpdate(BaseModel):
    status: JourneyStatus
    note: str | None = Field(default=None, max_length=1000)


class ChecklistItemUpdate(BaseModel):
    completed: bool
    notes: str = Field(default="", max_length=5000)


class ChecklistItem(BaseModel):
    item_key: str
    title: str
    completed: bool
    notes: str = ""
    completed_at_utc: str | None = None
    updated_at_utc: str


class JournalUpdate(BaseModel):
    summary: str = Field(default="", max_length=10000)
    reproduction_steps: str = Field(default="", max_length=10000)
    expected_vs_actual: str = Field(default="", max_length=10000)
    relevant_files: str = Field(default="", max_length=5000)
    potential_causes: str = Field(default="", max_length=10000)
    proposed_solution: str = Field(default="", max_length=10000)
    tests_to_run: str = Field(default="", max_length=5000)
    questions_for_maintainers: str = Field(default="", max_length=5000)
    lessons_learned: str = Field(default="", max_length=10000)


class JournalResponse(JournalUpdate):
    updated_at_utc: str


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Task title cannot be empty.")
        return cleaned


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    completed: bool | None = None


class TaskResponse(BaseModel):
    id: str
    journey_id: str
    title: str
    completed: bool
    sort_order: int
    created_at_utc: str
    updated_at_utc: str


class IssueAttachPayload(BaseModel):
    issue_number: int | None = Field(default=None, ge=1)
    issue_url: str | None = Field(default=None, max_length=500)


class PullRequestLinkPayload(BaseModel):
    pr_number: int | None = Field(default=None, ge=1)
    pr_url: str | None = Field(default=None, max_length=500)


class JourneyEventResponse(BaseModel):
    id: str
    event_type: str
    description: str
    created_at_utc: str


class JourneySummaryResponse(BaseModel):
    id: str
    user_id: str
    repo_owner: str
    repo_name: str
    repo_full_name: str
    repo_url: str
    org_slug: str | None = None
    title: str
    status: JourneyStatus
    issue_number: int | None = None
    issue_title: str | None = None
    issue_url: str | None = None
    issue_state: str | None = None
    issue_labels: list[str] = Field(default_factory=list)
    pr_number: int | None = None
    pr_title: str | None = None
    pr_url: str | None = None
    pr_state: str | None = None
    pr_is_draft: bool = False
    checklist_completed_count: int = 0
    checklist_total_count: int = 10
    tasks_completed_count: int = 0
    tasks_total_count: int = 0
    created_at_utc: str
    updated_at_utc: str


class JourneyDetailResponse(JourneySummaryResponse):
    issue_comments: int = 0
    issue_attached_at_utc: str | None = None
    pr_merged_at: str | None = None
    pr_closed_at: str | None = None
    pr_synced_at_utc: str | None = None
    checklist: list[ChecklistItem] = Field(default_factory=list)
    journal: JournalResponse
    tasks: list[TaskResponse] = Field(default_factory=list)
    events: list[JourneyEventResponse] = Field(default_factory=list)


class JourneyListResponse(BaseModel):
    journeys: list[JourneySummaryResponse]
