"""FastAPI router for Repository-Specific Contribution Journeys (Phase 3)."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from . import github_service, journeys_data
from .auth import AuthUser, get_current_user
from .http_client import ExternalSourceError
from .schemas_journeys import (
    ChecklistItemUpdate,
    IssueAttachPayload,
    JournalResponse,
    JournalUpdate,
    JourneyCreate,
    JourneyDetailResponse,
    JourneyListResponse,
    JourneyStatusUpdate,
    JourneySummaryResponse,
    PullRequestLinkPayload,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    VALID_STATUSES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journeys", tags=["journeys"])


def _parse_issue_number(repo_owner: str, repo_name: str, payload: IssueAttachPayload) -> int:
    """Extract and strictly validate that an issue belongs to this repository."""
    if payload.issue_number is not None and payload.issue_number > 0:
        return payload.issue_number

    if not payload.issue_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either issue_number or issue_url must be provided.",
        )

    try:
        parsed = urlparse(payload.issue_url.strip())
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid issue URL format.",
        ) from err

    if parsed.netloc.lower() not in ("github.com", "www.github.com"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Issue URL must point to github.com.",
        )

    # Expected path: /{owner}/{repo}/issues/{number}
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 4 or parts[2] != "issues":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL does not match the GitHub issue path format (e.g. https://github.com/owner/repo/issues/123).",
        )

    url_owner, url_repo, _, issue_num_str = parts[0], parts[1], parts[2], parts[3]
    if url_owner.lower() != repo_owner.lower() or url_repo.lower() != repo_name.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The provided issue belongs to '{url_owner}/{url_repo}', "
                f"which does not match this journey's repository ('{repo_owner}/{repo_name}')."
            ),
        )

    try:
        num = int(issue_num_str)
        if num <= 0:
            raise ValueError
        return num
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Issue number in URL must be a positive integer.",
        ) from None


def _parse_pr_number(repo_owner: str, repo_name: str, payload: PullRequestLinkPayload) -> int:
    """Extract and strictly validate that a PR belongs to this repository."""
    if payload.pr_number is not None and payload.pr_number > 0:
        return payload.pr_number

    if not payload.pr_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either pr_number or pr_url must be provided.",
        )

    try:
        parsed = urlparse(payload.pr_url.strip())
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid pull request URL format.",
        ) from err

    if parsed.netloc.lower() not in ("github.com", "www.github.com"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pull request URL must point to github.com.",
        )

    # Expected path: /{owner}/{repo}/pull/{number}
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 4 or parts[2] != "pull":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL does not match the GitHub pull request format (e.g. https://github.com/owner/repo/pull/123).",
        )

    url_owner, url_repo, _, pr_num_str = parts[0], parts[1], parts[2], parts[3]
    if url_owner.lower() != repo_owner.lower() or url_repo.lower() != repo_name.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The provided pull request belongs to '{url_owner}/{url_repo}', "
                f"which does not match this journey's repository ('{repo_owner}/{repo_name}')."
            ),
        )

    try:
        num = int(pr_num_str)
        if num <= 0:
            raise ValueError
        return num
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pull request number in URL must be a positive integer.",
        ) from None


@router.post("", response_model=JourneyDetailResponse)
def start_or_get_journey(
    payload: JourneyCreate,
    response: Response,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Start a new contribution journey or return existing active quest (idempotent)."""
    try:
        owner = github_service.validate_owner(payload.repo_owner)
        repo = github_service.validate_repo_name(payload.repo_name)
    except github_service.NotFoundError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    journey, is_new = journeys_data.create_or_get_journey(
        user_id=current_user.id,
        repo_owner=owner,
        repo_name=repo,
        org_slug=payload.org_slug,
        title=payload.title,
    )

    response.status_code = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
    return JourneyDetailResponse.model_validate(journey)


@router.get("", response_model=JourneyListResponse)
def list_journeys(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyListResponse:
    """List all contribution journeys for the authenticated user."""
    items = journeys_data.list_user_journeys(current_user.id, status_filter=status_filter)
    return JourneyListResponse(
        journeys=[JourneySummaryResponse.model_validate(item) for item in items]
    )


@router.get("/active/{owner}/{repo}")
def get_active_journey_for_repo(
    owner: str,
    repo: str,
    current_user: AuthUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Check if an active quest exists for this repo to show 'Start Quest' vs 'Open Quest'."""
    repo_full_name = f"{owner}/{repo}"
    active = journeys_data.get_active_journey_for_repo(current_user.id, repo_full_name)
    return {"journey": active}


@router.get("/{journey_id}", response_model=JourneyDetailResponse)
def get_journey(
    journey_id: str,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Fetch complete contribution journey workspace by ID."""
    journey = journeys_data.get_journey_detail(journey_id, current_user.id)
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(journey)


@router.patch("/{journey_id}/status", response_model=JourneyDetailResponse)
def update_status(
    journey_id: str,
    payload: JourneyStatusUpdate,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Update lifecycle status of a contribution journey."""
    if payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{payload.status}'.",
        )
    updated = journeys_data.update_journey_status(
        journey_id, current_user.id, payload.status, payload.note
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.put("/{journey_id}/checklist/{item_key}", response_model=JourneyDetailResponse)
def update_checklist(
    journey_id: str,
    item_key: str,
    payload: ChecklistItemUpdate,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Update checklist item completion state and notes."""
    updated = journeys_data.update_checklist_item(
        journey_id, current_user.id, item_key, payload.completed, payload.notes
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checklist item or journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.put("/{journey_id}/journal", response_model=JourneyDetailResponse)
def save_journal(
    journey_id: str,
    payload: JournalUpdate,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Save investigation journal notes and reproduction details."""
    updated = journeys_data.update_journal(journey_id, current_user.id, payload.model_dump())
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.post("/{journey_id}/tasks", response_model=JourneyDetailResponse, status_code=status.HTTP_201_CREATED)
def create_personal_task(
    journey_id: str,
    payload: TaskCreate,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Add a small personal workflow task to the journey."""
    updated = journeys_data.add_task(journey_id, current_user.id, payload.title)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.patch("/{journey_id}/tasks/{task_id}", response_model=JourneyDetailResponse)
def update_personal_task(
    journey_id: str,
    task_id: str,
    payload: TaskUpdate,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Update task completion or title."""
    updated = journeys_data.update_task(
        journey_id, current_user.id, task_id, payload.title, payload.completed
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task or contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.delete("/{journey_id}/tasks/{task_id}", response_model=JourneyDetailResponse)
def remove_personal_task(
    journey_id: str,
    task_id: str,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Delete a personal task."""
    deleted = journeys_data.delete_task(journey_id, current_user.id, task_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task or contribution journey not found.",
        )
    updated = journeys_data.get_journey_detail(journey_id, current_user.id)
    assert updated is not None
    return JourneyDetailResponse.model_validate(updated)


@router.put("/{journey_id}/issue", response_model=JourneyDetailResponse)
def attach_github_issue(
    journey_id: str,
    payload: IssueAttachPayload,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Validate and attach a real GitHub issue to the journey."""
    journey = journeys_data.get_journey_detail(journey_id, current_user.id)
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )

    issue_number = _parse_issue_number(journey["repo_owner"], journey["repo_name"], payload)

    try:
        issue_info = github_service.fetch_single_issue(
            journey["repo_owner"], journey["repo_name"], issue_number
        )
    except github_service.NotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GitHub issue #{issue_number} was not found in {journey['repo_full_name']}.",
        ) from err
    except ExternalSourceError as err:
        raise HTTPException(
            status_code=err.status if err.status >= 400 else 503,
            detail=f"Could not reach GitHub to verify issue: {err}",
        ) from err

    updated = journeys_data.attach_issue(journey_id, current_user.id, issue_info)
    assert updated is not None
    return JourneyDetailResponse.model_validate(updated)


@router.delete("/{journey_id}/issue", response_model=JourneyDetailResponse)
def detach_github_issue(
    journey_id: str,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Detach target issue from the journey."""
    updated = journeys_data.detach_issue(journey_id, current_user.id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)


@router.put("/{journey_id}/pr", response_model=JourneyDetailResponse)
def link_pull_request(
    journey_id: str,
    payload: PullRequestLinkPayload,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Validate and link a real GitHub pull request to the journey."""
    journey = journeys_data.get_journey_detail(journey_id, current_user.id)
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )

    pr_number = _parse_pr_number(journey["repo_owner"], journey["repo_name"], payload)

    try:
        pr_info = github_service.fetch_single_pull_request(
            journey["repo_owner"], journey["repo_name"], pr_number
        )
    except github_service.NotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GitHub pull request #{pr_number} was not found in {journey['repo_full_name']}.",
        ) from err
    except ExternalSourceError as err:
        raise HTTPException(
            status_code=err.status if err.status >= 400 else 503,
            detail=f"Could not reach GitHub to verify PR: {err}",
        ) from err

    updated = journeys_data.link_pull_request(journey_id, current_user.id, pr_info)
    assert updated is not None
    return JourneyDetailResponse.model_validate(updated)


@router.post("/{journey_id}/pr/refresh", response_model=JourneyDetailResponse)
def refresh_pull_request_status(
    journey_id: str,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Manually re-sync linked PR status directly from GitHub."""
    journey = journeys_data.get_journey_detail(journey_id, current_user.id)
    if not journey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )

    pr_number = journey.get("pr_number")
    if not pr_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pull request is linked to this journey yet.",
        )

    try:
        pr_info = github_service.fetch_single_pull_request(
            journey["repo_owner"], journey["repo_name"], pr_number
        )
    except ExternalSourceError as err:
        raise HTTPException(
            status_code=err.status if err.status >= 400 else 503,
            detail=f"Could not refresh PR from GitHub: {err}",
        ) from err

    updated = journeys_data.link_pull_request(journey_id, current_user.id, pr_info)
    assert updated is not None
    return JourneyDetailResponse.model_validate(updated)


@router.delete("/{journey_id}/pr", response_model=JourneyDetailResponse)
def unlink_pull_request(
    journey_id: str,
    current_user: AuthUser = Depends(get_current_user),
) -> JourneyDetailResponse:
    """Unlink pull request from the journey."""
    updated = journeys_data.unlink_pull_request(journey_id, current_user.id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contribution journey not found.",
        )
    return JourneyDetailResponse.model_validate(updated)
