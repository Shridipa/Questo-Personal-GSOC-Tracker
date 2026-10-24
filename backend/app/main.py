from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from uuid import UUID

from dotenv import load_dotenv

load_dotenv()  # Load .env if present (local dev; Render uses dashboard env vars)

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import AuthUser, get_current_user, get_optional_user
from .database import (
    claim_guest_data,
    complete_deadline,
    complete_quest,
    create_deadline,
    create_weekly_review,
    current_week_start,
    delete_deadline,
    delete_user_data,
    export_user_data,
    get_activity_history,
    get_current_weekly_review,
    get_progress,
    get_quest_work,
    get_settings,
    get_streaks,
    get_weekly_review,
    initialize_database,
    list_deadlines,
    list_quests,
    list_roadmap_phases,
    list_weekly_reviews,
    list_xp_history,
    save_quest_work,
    save_settings,
    update_deadline,
    update_weekly_review,
)
from .explore_router import router as explore_router
from .http_client import ExternalSourceError
from .journeys_data import initialize_journey_tables
from .journeys_router import router as journeys_router
from .orgs_data import initialize_explore_tables
from .schemas import (
    AccountClaimResponse,
    AccountExportResponse,
    ActivityHistoryResponse,
    CurrentWeekReviewResponse,
    DeadlineCreate,
    DeadlineListResponse,
    DeadlineResponse,
    DeadlineUpdate,
    HealthResponse,
    ProgressResponse,
    QuestCompletionResponse,
    QuestListResponse,
    QuestResponse,
    QuestWorkResponse,
    QuestWorkUpdate,
    RoadmapPhaseResponse,
    RoadmapResponse,
    SettingsResponse,
    SettingsUpdate,
    StreakResponse,
    WeeklyReviewCreate,
    WeeklyReviewListResponse,
    WeeklyReviewResponse,
    WeeklyReviewUpdate,
    XpHistoryEntryResponse,
    XpHistoryResponse,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    initialize_database()
    initialize_explore_tables()
    yield


app = FastAPI(
    title="Questo API",
    description="API for the Questo open-source learning tracker.",
    version="0.3.0",
    lifespan=lifespan,
)

app.include_router(explore_router)


@app.exception_handler(ExternalSourceError)
def external_source_error_handler(
    request: Request, exc: ExternalSourceError
) -> JSONResponse:
    """Map upstream-data failures to structured API errors with usable messages."""
    status = exc.status if exc.status >= 400 else 503
    return JSONResponse(status_code=status, content={"detail": str(exc)})

allowed_origins = [
    origin.strip()
    for origin in os.environ.get(
        "QUESTLINE_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3002,http://127.0.0.1:3002,"
        "https://questo-personal-gsoc-tracker-sq2i.vercel.app",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/quests", response_model=QuestListResponse, tags=["quests"])
def get_quests(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> QuestListResponse:
    user_id = current_user.id if current_user else None
    return QuestListResponse(
        quests=[QuestResponse.model_validate(quest) for quest in list_quests(user_id=user_id)]
    )


@app.get("/api/roadmap", response_model=RoadmapResponse, tags=["roadmap"])
def get_roadmap(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> RoadmapResponse:
    return RoadmapResponse(
        phases=[
            RoadmapPhaseResponse.model_validate(phase)
            for phase in list_roadmap_phases()
        ]
    )


@app.get(
    "/api/quests/{quest_id}/work",
    response_model=QuestWorkResponse,
    tags=["quests"],
)
def get_quest_work_state(
    quest_id: str,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> QuestWorkResponse:
    user_id = current_user.id if current_user else None
    work = get_quest_work(quest_id, user_id=user_id)
    if work is None:
        raise HTTPException(status_code=404, detail="Quest not found.")
    return QuestWorkResponse.model_validate(work)


@app.put(
    "/api/quests/{quest_id}/work",
    response_model=QuestWorkResponse,
    tags=["quests"],
)
def put_quest_work_state(
    quest_id: str,
    work: QuestWorkUpdate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> QuestWorkResponse:
    user_id = current_user.id if current_user else None
    try:
        saved = save_quest_work(quest_id, work.model_dump(mode="json"), user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if saved is None:
        raise HTTPException(status_code=404, detail="Quest not found.")
    return QuestWorkResponse.model_validate(saved)


@app.post(
    "/api/quests/{quest_id}/complete",
    response_model=QuestCompletionResponse,
    tags=["quests"],
)
def post_quest_completion(
    quest_id: str,
    response: Response,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> QuestCompletionResponse:
    user_id = current_user.id if current_user else None
    try:
        result = complete_quest(quest_id, user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if result is None:
        raise HTTPException(status_code=404, detail="Quest not found.")

    response.status_code = 200 if result["already_completed"] else 201
    return QuestCompletionResponse.model_validate(result)


@app.get("/api/progress", response_model=ProgressResponse, tags=["progress"])
def get_progress_summary(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> ProgressResponse:
    user_id = current_user.id if current_user else None
    return ProgressResponse.model_validate(get_progress(user_id=user_id))


@app.get("/api/progress/xp-history", response_model=XpHistoryResponse, tags=["progress"])
def get_xp_history(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> XpHistoryResponse:
    user_id = current_user.id if current_user else None
    return XpHistoryResponse(
        entries=[
            XpHistoryEntryResponse.model_validate(entry)
            for entry in list_xp_history(user_id=user_id)
        ]
    )


@app.get("/api/progress/streaks", response_model=StreakResponse, tags=["progress"])
def get_streak_summary(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> StreakResponse:
    user_id = current_user.id if current_user else None
    return StreakResponse.model_validate(get_streaks(user_id=user_id))


@app.get(
    "/api/progress/activity",
    response_model=ActivityHistoryResponse,
    tags=["progress"],
)
def get_activity_summary(
    days: int = Query(default=30, ge=1, le=366),
    current_user: AuthUser | None = Depends(get_optional_user),
) -> ActivityHistoryResponse:
    user_id = current_user.id if current_user else None
    return ActivityHistoryResponse.model_validate(get_activity_history(days, user_id=user_id))


@app.get("/api/settings", response_model=SettingsResponse, tags=["settings"])
def get_user_settings(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> SettingsResponse:
    user_id = current_user.id if current_user else None
    return SettingsResponse.model_validate(get_settings(user_id=user_id))


@app.put("/api/settings", response_model=SettingsResponse, tags=["settings"])
def put_user_settings(
    settings: SettingsUpdate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> SettingsResponse:
    user_id = current_user.id if current_user else None
    return SettingsResponse.model_validate(
        save_settings(settings.model_dump(mode="json"), user_id=user_id)
    )


@app.get("/api/reviews", response_model=WeeklyReviewListResponse, tags=["reviews"])
def get_weekly_reviews(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> WeeklyReviewListResponse:
    user_id = current_user.id if current_user else None
    return WeeklyReviewListResponse(
        reviews=[
            WeeklyReviewResponse.model_validate(review)
            for review in list_weekly_reviews(user_id=user_id)
        ]
    )


@app.get(
    "/api/reviews/current",
    response_model=CurrentWeekReviewResponse,
    tags=["reviews"],
)
def get_current_week_review(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> CurrentWeekReviewResponse:
    user_id = current_user.id if current_user else None
    review = get_current_weekly_review(user_id=user_id)
    return CurrentWeekReviewResponse(
        week_start=current_week_start(),
        review=WeeklyReviewResponse.model_validate(review) if review else None,
    )


@app.get(
    "/api/reviews/{review_id}",
    response_model=WeeklyReviewResponse,
    tags=["reviews"],
)
def get_weekly_review_by_id(
    review_id: UUID,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> WeeklyReviewResponse:
    user_id = current_user.id if current_user else None
    review = get_weekly_review(str(review_id), user_id=user_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Weekly review not found.")
    return WeeklyReviewResponse.model_validate(review)


@app.post(
    "/api/reviews",
    response_model=WeeklyReviewResponse,
    status_code=201,
    tags=["reviews"],
)
def post_weekly_review(
    review: WeeklyReviewCreate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> WeeklyReviewResponse:
    user_id = current_user.id if current_user else None
    try:
        created = create_weekly_review(review.model_dump(mode="json"), user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return WeeklyReviewResponse.model_validate(created)


@app.put(
    "/api/reviews/{review_id}",
    response_model=WeeklyReviewResponse,
    tags=["reviews"],
)
def put_weekly_review(
    review_id: UUID,
    review: WeeklyReviewUpdate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> WeeklyReviewResponse:
    user_id = current_user.id if current_user else None
    try:
        updated = update_weekly_review(str(review_id), review.model_dump(mode="json"), user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if updated is None:
        raise HTTPException(status_code=404, detail="Weekly review not found.")
    return WeeklyReviewResponse.model_validate(updated)


@app.get("/api/deadlines", response_model=DeadlineListResponse, tags=["deadlines"])
def get_deadlines(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> DeadlineListResponse:
    user_id = current_user.id if current_user else None
    return DeadlineListResponse(
        deadlines=[
            DeadlineResponse.model_validate(deadline)
            for deadline in list_deadlines(user_id=user_id)
        ]
    )


@app.post(
    "/api/deadlines",
    response_model=DeadlineResponse,
    status_code=201,
    tags=["deadlines"],
)
def post_deadline(
    deadline: DeadlineCreate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> DeadlineResponse:
    user_id = current_user.id if current_user else None
    created = create_deadline(deadline.model_dump(mode="json"), user_id=user_id)
    return DeadlineResponse.model_validate(created)


@app.put(
    "/api/deadlines/{deadline_id}",
    response_model=DeadlineResponse,
    tags=["deadlines"],
)
def put_deadline(
    deadline_id: UUID,
    deadline: DeadlineUpdate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> DeadlineResponse:
    user_id = current_user.id if current_user else None
    updated = update_deadline(
        str(deadline_id), deadline.model_dump(mode="json"), user_id=user_id
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return DeadlineResponse.model_validate(updated)


@app.post(
    "/api/deadlines/{deadline_id}/complete",
    response_model=DeadlineResponse,
    tags=["deadlines"],
)
def post_deadline_completion(
    deadline_id: UUID,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> DeadlineResponse:
    user_id = current_user.id if current_user else None
    completed = complete_deadline(str(deadline_id), user_id=user_id)
    if completed is None:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return DeadlineResponse.model_validate(completed)


@app.delete("/api/deadlines/{deadline_id}", status_code=204, tags=["deadlines"])
def remove_deadline(
    deadline_id: UUID,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> Response:
    user_id = current_user.id if current_user else None
    if not delete_deadline(str(deadline_id), user_id=user_id):
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Account Management & Data Portability Endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/api/account/claim-guest-data",
    response_model=AccountClaimResponse,
    tags=["account"],
)
def claim_guest_data_endpoint(
    current_user: AuthUser = Depends(get_current_user),
) -> AccountClaimResponse:
    counts = claim_guest_data(current_user.id)
    total = sum(counts.values())
    return AccountClaimResponse(
        **counts,
        message=(
            f"Successfully transferred {total} guest item(s) to your account."
            if total > 0
            else "No guest records were pending import."
        ),
    )


@app.get(
    "/api/account/export",
    response_model=AccountExportResponse,
    tags=["account"],
)
def export_account_endpoint(
    current_user: AuthUser = Depends(get_current_user),
) -> AccountExportResponse:
    data = export_user_data(current_user.id, email=current_user.email)
    return AccountExportResponse.model_validate(data)


@app.delete(
    "/api/account",
    status_code=204,
    tags=["account"],
)
def delete_account_endpoint(
    current_user: AuthUser = Depends(get_current_user),
) -> Response:
    delete_user_data(current_user.id)
    return Response(status_code=204)
