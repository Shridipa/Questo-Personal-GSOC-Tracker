import assert from "node:assert/strict";
import test from "node:test";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
  buildPortfolioSummary,
} from "../src/components/questline/explore/portfolio-summary.ts";

function entry(overrides = {}) {
  return {
    id: "j1",
    user_id: "u1",
    repo_owner: "pallets",
    repo_name: "flask",
    repo_full_name: "pallets/flask",
    repo_url: "https://github.com/pallets/flask",
    org_slug: null,
    title: "First contribution",
    status: "merged",
    issue_number: null,
    issue_title: null,
    issue_url: null,
    issue_state: null,
    issue_labels: [],
    pr_number: null,
    pr_title: null,
    pr_url: null,
    pr_state: null,
    pr_is_draft: false,
    checklist_completed_count: 10,
    checklist_total_count: 10,
    tasks_completed_count: 6,
    tasks_total_count: 6,
    created_at_utc: "2026-10-20T00:00:00Z",
    updated_at_utc: "2026-10-23T00:00:00Z",
    pr_complete: false,
    pr_outcome: "no_pr",
    lessons_learned: "",
    skills_practiced: "",
    completed_at_utc: null,
    ...overrides,
  };
}

test("closed-without-merging is never labelled as merged", () => {
  assert.equal(OUTCOME_LABELS.closed_unmerged.label, "Closed without merging");
  assert.equal(OUTCOME_LABELS.merged.label, "Merged on GitHub");
  assert.notEqual(OUTCOME_LABELS.closed_unmerged.cls, OUTCOME_LABELS.merged.cls);
});

test("summary marks merged PRs as merged and open PRs as open", () => {
  const text = buildPortfolioSummary([
    entry({ repo_full_name: "encode/httpx", pr_number: 12, pr_outcome: "merged" }),
    entry({ repo_full_name: "encode/starlette", pr_number: 7, pr_outcome: "open", status: "pr_open" }),
  ]);
  assert.match(text, /PR #12 — merged/);
  assert.match(text, /PR #7 — open/);
});

test("summary states closed-unmerged PRs accurately", () => {
  const text = buildPortfolioSummary([
    entry({ repo_full_name: "encode/starlette", pr_number: 7, pr_outcome: "closed_unmerged" }),
  ]);
  assert.match(text, /PR #7 — closed without merging/);
  assert.doesNotMatch(text, /merged/);
});

test("journeys without a PR are not presented as merged contributions", () => {
  const text = buildPortfolioSummary([entry()]);
  assert.doesNotMatch(text, /merged/);
  assert.doesNotMatch(text, /PR #/);
});

test("summary includes user-authored skills and lessons only", () => {
  const text = buildPortfolioSummary([
    entry({ skills_practiced: "pytest", lessons_learned: "Read the docs first." }),
  ]);
  assert.match(text, /Skills practiced: pytest/);
  assert.match(text, /Lessons learned: Read the docs first\./);
});

test("status labels cover every journey status", () => {
  for (const status of [
    "preparing",
    "issue_selected",
    "in_progress",
    "pr_open",
    "changes_requested",
    "merged",
    "closed",
    "paused",
    "abandoned",
  ]) {
    assert.ok(STATUS_LABELS[status]);
  }
});
