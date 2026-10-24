"""Pydantic schemas for the Explore (organizations/repos) API."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class OrgSummary(BaseModel):
    slug: str
    name: str
    description: str
    category: str | None = None
    logo_url: str | None = None
    image_background_color: str | None = None
    technologies: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    participation_years: list[int] = Field(default_factory=list)
    latest_projects_count: int | None = None
    repo_url: str | None = None
    followed: bool = False


class OrgDetail(OrgSummary):
    website_url: str | None = None
    ideas_url: str | None = None
    guide_url: str | None = None
    blog_url: str | None = None
    twitter_url: str | None = None
    irc_channel: str | None = None
    contact_email: str | None = None
    mailing_list: str | None = None
    source: str | None = None
    synced_at_utc: str | None = None
    github_org_login: str | None = None


class FollowPayload(BaseModel):
    note: str = Field(default="", max_length=2000)
    target_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class CatalogMeta(BaseModel):
    count: int
    source: str | None = None
    years: list[int] = Field(default_factory=list)
    year_note: str = (
        "Participation years are historical records from the official GSoC "
        "archive. They do not confirm participation in any future program."
    )
    stale: bool = False


class OrgListResponse(BaseModel):
    orgs: list[OrgSummary]
    meta: CatalogMeta


class FollowState(BaseModel):
    slug: str
    followed: bool
    note: str = ""
    target_date: str | None = None


class PreferenceUpdate(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=15)
    languages: list[str] = Field(default_factory=list, max_length=15)
    experience_level: str = Field(default="new", pattern=r"^(new|some|experienced)$")
    weekly_hours: int = Field(default=5, ge=0, le=60)

    @field_validator("interests", "languages")
    @classmethod
    def _clean_entries(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("Entries must be strings.")
            entry = item.strip()[:40]
            if entry and entry.casefold() not in {c.casefold() for c in cleaned}:
                cleaned.append(entry)
        return cleaned


class PreferenceResponse(BaseModel):
    interests: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    experience_level: str = "new"
    weekly_hours: int = 5
    updated_at_utc: str | None = None


class FollowedOrg(BaseModel):
    org_slug: str
    name: str
    note: str = ""
    target_date: str | None = None
    created_at_utc: str
    logo_url: str | None = None
    category: str | None = None
    participation_years: list[int] = Field(default_factory=list)


class FollowListResponse(BaseModel):
    follows: list[FollowedOrg]


class RepoSummary(BaseModel):
    full_name: str
    name: str
    description: str | None = None
    html_url: str | None = None
    language: str | None = None
    topics: list[str] = Field(default_factory=list)
    stargazers_count: int = 0
    forks_count: int = 0
    open_issues_count: int = 0
    default_branch: str | None = None
    license: str | None = None
    archived: bool = False
    pushed_at: str | None = None


class RepoListResponse(BaseModel):
    github_org: str
    repositories: list[RepoSummary]
    synced_at_utc: str
    total_fetched: int
    complete: bool
    note: str = "Derived from live public GitHub metadata; stars are popularity, not quality."


class RepoDetailResponse(RepoSummary):
    created_at: str | None = None
    homepage: str | None = None
    language_totals: dict[str, int] = Field(default_factory=dict)
    synced_at_utc: str


class RepoSelectionPayload(BaseModel):
    org_slug: str | None = None
    status: str = Field(default="shortlisted", pattern=r"^(shortlisted|selected)$")


class RepoSelection(BaseModel):
    org_slug: str | None = None
    repo_full_name: str
    status: str
    created_at_utc: str
    updated_at_utc: str | None = None


class RepoSelectionListResponse(BaseModel):
    selections: list[RepoSelection]


class IssueSummary(BaseModel):
    number: int
    title: str
    url: str | None = None
    state: str | None = None
    labels: list[str] = Field(default_factory=list)
    comments: int = 0
    assignees: list[str | None] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class IssueListResponse(BaseModel):
    owner: str
    repo: str
    issues: list[IssueSummary]
    has_more: bool
    labels_used: list[str]
    synced_at_utc: str
    note: str = (
        "Labels are maintained by each repository's maintainers and differ between projects."
    )


class RecommendationEntry(BaseModel):
    slug: str
    name: str
    score: float
    reasons: list[str]
    category: str | None = None
    logo_url: str | None = None
    participation_years: list[int] = Field(default_factory=list)


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationEntry]
    based_on: PreferenceResponse
