from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from .database import (
    complete_deadline,
    complete_quest,
    create_deadline,
    create_weekly_review,
    current_week_start,
    delete_deadline,
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
from .schemas import (
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
    yield

app = FastAPI(
    title="Questo API",
    description="API for the Questo open-source learning tracker.",
    version="0.1.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get(
        "QUESTLINE_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3002,http://127.0.0.1:3002",
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
def get_quests() -> QuestListResponse:
    return QuestListResponse(
        quests=[QuestResponse.model_validate(quest) for quest in list_quests()]
    )


@app.get("/api/roadmap", response_model=RoadmapResponse, tags=["roadmap"])
def get_roadmap() -> RoadmapResponse:
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
def get_quest_work_state(quest_id: str) -> QuestWorkResponse:
    work = get_quest_work(quest_id)
    if work is None:
        raise HTTPException(status_code=404, detail="Quest not found.")
    return QuestWorkResponse.model_validate(work)


@app.put(
    "/api/quests/{quest_id}/work",
    response_model=QuestWorkResponse,
    tags=["quests"],
)
def put_quest_work_state(quest_id: str, work: QuestWorkUpdate) -> QuestWorkResponse:
    try:
        saved = save_quest_work(quest_id, work.model_dump(mode="json"))
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
def post_quest_completion(quest_id: str, response: Response) -> QuestCompletionResponse:
    try:
        result = complete_quest(quest_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if result is None:
        raise HTTPException(status_code=404, detail="Quest not found.")

    response.status_code = 200 if result["already_completed"] else 201
    return QuestCompletionResponse.model_validate(result)


@app.get("/api/progress", response_model=ProgressResponse, tags=["progress"])
def get_progress_summary() -> ProgressResponse:
    return ProgressResponse.model_validate(get_progress())


@app.get("/api/progress/xp-history", response_model=XpHistoryResponse, tags=["progress"])
def get_xp_history() -> XpHistoryResponse:
    return XpHistoryResponse(
        entries=[
            XpHistoryEntryResponse.model_validate(entry) for entry in list_xp_history()
        ]
    )


@app.get("/api/progress/streaks", response_model=StreakResponse, tags=["progress"])
def get_streak_summary() -> StreakResponse:
    return StreakResponse.model_validate(get_streaks())


@app.get(
    "/api/progress/activity",
    response_model=ActivityHistoryResponse,
    tags=["progress"],
)
def get_activity_summary(
    days: int = Query(default=30, ge=1, le=366),
) -> ActivityHistoryResponse:
    return ActivityHistoryResponse.model_validate(get_activity_history(days))


@app.get("/api/settings", response_model=SettingsResponse, tags=["settings"])
def get_user_settings() -> SettingsResponse:
    return SettingsResponse.model_validate(get_settings())


@app.put("/api/settings", response_model=SettingsResponse, tags=["settings"])
def put_user_settings(settings: SettingsUpdate) -> SettingsResponse:
    return SettingsResponse.model_validate(
        save_settings(settings.model_dump(mode="json"))
    )


@app.get("/api/reviews", response_model=WeeklyReviewListResponse, tags=["reviews"])
def get_weekly_reviews() -> WeeklyReviewListResponse:
    return WeeklyReviewListResponse(
        reviews=[
            WeeklyReviewResponse.model_validate(review)
            for review in list_weekly_reviews()
        ]
    )


@app.get(
    "/api/reviews/current",
    response_model=CurrentWeekReviewResponse,
    tags=["reviews"],
)
def get_current_week_review() -> CurrentWeekReviewResponse:
    review = get_current_weekly_review()
    return CurrentWeekReviewResponse(
        week_start=current_week_start(),
        review=WeeklyReviewResponse.model_validate(review) if review else None,
    )


@app.get(
    "/api/reviews/{review_id}",
    response_model=WeeklyReviewResponse,
    tags=["reviews"],
)
def get_weekly_review_by_id(review_id: UUID) -> WeeklyReviewResponse:
    review = get_weekly_review(str(review_id))
    if review is None:
        raise HTTPException(status_code=404, detail="Weekly review not found.")
    return WeeklyReviewResponse.model_validate(review)


@app.post(
    "/api/reviews",
    response_model=WeeklyReviewResponse,
    status_code=201,
    tags=["reviews"],
)
def post_weekly_review(review: WeeklyReviewCreate) -> WeeklyReviewResponse:
    try:
        created = create_weekly_review(review.model_dump(mode="json"))
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return WeeklyReviewResponse.model_validate(created)


@app.put(
    "/api/reviews/{review_id}",
    response_model=WeeklyReviewResponse,
    tags=["reviews"],
)
def put_weekly_review(
    review_id: UUID, review: WeeklyReviewUpdate
) -> WeeklyReviewResponse:
    try:
        updated = update_weekly_review(str(review_id), review.model_dump(mode="json"))
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if updated is None:
        raise HTTPException(status_code=404, detail="Weekly review not found.")
    return WeeklyReviewResponse.model_validate(updated)


@app.get("/api/deadlines", response_model=DeadlineListResponse, tags=["deadlines"])
def get_deadlines() -> DeadlineListResponse:
    return DeadlineListResponse(
        deadlines=[
            DeadlineResponse.model_validate(deadline) for deadline in list_deadlines()
        ]
    )


@app.post(
    "/api/deadlines",
    response_model=DeadlineResponse,
    status_code=201,
    tags=["deadlines"],
)
def post_deadline(deadline: DeadlineCreate) -> DeadlineResponse:
    created = create_deadline(deadline.model_dump(mode="json"))
    return DeadlineResponse.model_validate(created)


@app.put(
    "/api/deadlines/{deadline_id}",
    response_model=DeadlineResponse,
    tags=["deadlines"],
)
def put_deadline(deadline_id: UUID, deadline: DeadlineUpdate) -> DeadlineResponse:
    updated = update_deadline(
        str(deadline_id), deadline.model_dump(mode="json")
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return DeadlineResponse.model_validate(updated)


@app.post(
    "/api/deadlines/{deadline_id}/complete",
    response_model=DeadlineResponse,
    tags=["deadlines"],
)
def post_deadline_completion(deadline_id: UUID) -> DeadlineResponse:
    completed = complete_deadline(str(deadline_id))
    if completed is None:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return DeadlineResponse.model_validate(completed)


@app.delete("/api/deadlines/{deadline_id}", status_code=204, tags=["deadlines"])
def remove_deadline(deadline_id: UUID) -> Response:
    if not delete_deadline(str(deadline_id)):
        raise HTTPException(status_code=404, detail="Deadline not found.")
    return Response(status_code=204)
