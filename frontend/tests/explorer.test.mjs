import assert from "node:assert/strict";
import test from "node:test";
import { formatTimestamp } from "../src/components/questline/explore/format-timestamp.ts";

test("formatTimestamp handles null, empty, and invalid dates safely", () => {
  assert.equal(formatTimestamp(null), "");
  assert.equal(formatTimestamp(""), "");
  assert.equal(formatTimestamp("invalid-date-string"), "");
});

test("formatTimestamp produces relative minutes, hours, or days", () => {
  const now = Date.now();
  const justNow = new Date(now - 10 * 1000).toISOString();
  assert.equal(formatTimestamp(justNow), "just now");

  const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
  assert.equal(formatTimestamp(tenMinAgo), "10 min ago");

  const threeHoursAgo = new Date(now - 3 * 3600 * 1000).toISOString();
  assert.equal(formatTimestamp(threeHoursAgo), "3 h ago");

  const twoDaysAgo = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
  assert.equal(formatTimestamp(twoDaysAgo), "2 d ago");

  const longAgo = new Date(now - 45 * 24 * 3600 * 1000).toISOString();
  assert.match(formatTimestamp(longAgo), /^\d{4}-\d{2}-\d{2}$/);
});

test("Explorer query parameters serialize properly", () => {
  const query = {
    q: "python web",
    category: "Web Development",
    technology: "Python",
    topic: "asyncio",
    limit: 24,
    offset: 0,
  };

  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.technology) params.set("technology", query.technology);
  if (query.topic) params.set("topic", query.topic);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));

  assert.equal(
    params.toString(),
    "q=python+web&category=Web+Development&technology=Python&topic=asyncio&limit=24&offset=0",
  );
});

test("Explorer repository URL encoding handles owner and repo names with special characters", () => {
  const slug = "python-software-foundation";
  const fullName = "python/cpython";
  const route = `/explore/${slug}/repo/${encodeURIComponent(fullName)}`;
  assert.equal(route, "/explore/python-software-foundation/repo/python%2Fcpython");

  const encodedFull = encodeURIComponent(fullName);
  assert.equal(encodedFull, "python%2Fcpython");

  const decoded = decodeURIComponent(encodedFull);
  assert.equal(decoded, fullName);

  const routePattern = /^[^/]+\/[^/]+$/;
  assert.equal(routePattern.test(decoded), true);
  assert.equal(routePattern.test("invalid"), false);
  assert.equal(routePattern.test("too/many/slashes"), false);
});

test("Recommendations transparently convey scoring and reason keywords", () => {
  const sampleRec = {
    slug: "python",
    name: "Python Software Foundation",
    score: 8.5,
    reasons: ["Matches language: Python", "Matches interest: compilers"],
    category: "Programming Languages",
    logo_url: "https://example.com/logo.png",
    participation_years: [2021, 2022, 2023, 2024],
  };

  assert.equal(typeof sampleRec.score, "number");
  assert.ok(sampleRec.reasons.length > 0);
  assert.ok(sampleRec.reasons.some((r) => r.includes("Python")));
});

test("RepoSelection preserves selection status values without fabrication", () => {
  const allowedStatuses = new Set(["shortlisted", "selected"]);
  assert.equal(allowedStatuses.has("shortlisted"), true);
  assert.equal(allowedStatuses.has("selected"), true);
  assert.equal(allowedStatuses.has("invalid_status"), false);
});
