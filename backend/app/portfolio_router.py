"""FastAPI router for the Contributor Portfolio (Phase 4B).

The portfolio is assembled from the user's persisted contribution journeys.
It is private: every response is scoped to the authenticated owner, and no
request exposes any other user's journeys, journals, or feedback tracking.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import AuthUser, get_current_user
from .journeys_data import list_portfolio_journeys
from .schemas_journeys import (
    VALID_STATUSES,
    PortfolioEntryResponse,
    PortfolioResponse,
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioResponse)
def get_portfolio(
    status: str | None = Query(default=None, max_length=40),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: AuthUser = Depends(get_current_user),
) -> PortfolioResponse:
    """List the user's persisted journeys with accurate GitHub outcomes."""
    if status in (None, "", "all"):
        status_filter = None
    elif status in VALID_STATUSES:
        status_filter = status
    else:
        raise HTTPException(status_code=422, detail=f"Unknown journey status '{status}'.")

    entries, total = list_portfolio_journeys(
        current_user.id,
        status_filter=status_filter,
        search=search,
        limit=limit,
        offset=offset,
    )
    return PortfolioResponse(
        entries=[PortfolioEntryResponse.model_validate(entry) for entry in entries],
        total=total,
        limit=limit,
        offset=offset,
    )
