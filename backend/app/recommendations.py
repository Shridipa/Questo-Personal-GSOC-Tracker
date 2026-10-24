"""Deterministic, transparent organization recommendations.

Scores are simple keyword-overlap signals with reasons attached — never an
opaque ranking. Users can always browse past the recommendations; this only
orders what is visible first.
"""

from __future__ import annotations

import re
from typing import Any

_WORD_RE = re.compile(r"[a-z0-9]+")


def _keywords(values: list[str]) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        normalized = value.casefold()
        tokens.add(re.sub(r"\s+", "-", normalized))
        tokens.update(_WORD_RE.findall(normalized))
    return {token for token in tokens if len(token) >= 2}


def recommend_orgs(
    catalog: list[dict[str, Any]],
    preferences: dict[str, Any],
    *,
    excluded: set[str] | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    """Rank catalog orgs against the user's stated preferences.

    Every entry carries plain-language reasons; an org with no overlap is
    never force-ranked. Historical participation continuity is a small bonus,
    weighted far below actual technology/topic overlap.
    """
    excluded = excluded or set()
    interest_tokens = _keywords(preferences.get("interests") or [])
    language_tokens = _keywords(preferences.get("languages") or [])
    experience = preferences.get("experience_level") or "new"

    scored: list[dict[str, Any]] = []
    for org in catalog:
        slug = org.get("slug")
        if not slug or slug in excluded:
            continue
        tech = [t.casefold() for t in org.get("technologies") or []]
        topics = [t.casefold() for t in org.get("topics") or []]
        tech_tokens = _keywords(tech)
        topic_tokens = _keywords(topics)

        matched_languages = sorted(
            value for value in tech if any(
                token in value or value in token for token in language_tokens
            )
        )
        matched_topics = sorted(
            value for value in topics if any(
                token in value or value in token for token in interest_tokens
            )
        )

        score = 2.0 * len(matched_languages) + 1.5 * len(matched_topics)
        if language_tokens & tech_tokens:
            score += 1.0
        if interest_tokens & topic_tokens:
            score += 1.0

        years: list[int] = org.get("participation_years") or []
        recent_years = len([year for year in years if year >= 2023])
        score += min(recent_years, 3) * 0.3

        reasons: list[str] = []
        if matched_languages:
            reasons.append(
                "Uses technology you listed: " + ", ".join(matched_languages[:4])
            )
        elif language_tokens & tech_tokens:
            reasons.append("Overlaps with the languages you know.")
        if matched_topics:
            topics_text = ", ".join(matched_topics[:4])
            reasons.append("Covers topics you're interested in: " + topics_text)
        elif interest_tokens & topic_tokens:
            reasons.append("Touches topics close to your interests.")
        if recent_years:
            reasons.append(
                f"Active GSoC participant in recent years ({recent_years})."
            )
        if len(years) >= 5:
            reasons.append(
                "Long-running regular organization — likely stable mentorship structures."
            )
        if experience == "new" and score < 2:
            continue  # don't pad a beginner's list with unrelated orgs
        if score <= 0:
            continue

        scored.append(
            {
                "slug": slug,
                "name": org.get("name", slug),
                "score": round(score, 2),
                "reasons": reasons[:4],
                "category": org.get("category"),
                "logo_url": org.get("logo_url"),
                "participation_years": years,
            }
        )

    scored.sort(key=lambda entry: (-entry["score"], entry["name"]))
    return scored[:limit]
