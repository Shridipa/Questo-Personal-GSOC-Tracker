"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Circle,
  CircleCheck,
  GitBranch,
  Loader2,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import {
  describeApiError,
  fetchMyRepoSelections,
  fetchRepoDetail,
  fetchRepoIssues,
  deleteRepoSelection,
  getActiveJourneyForRepo,
  putRepoSelection,
  startJourney,
  type IssueLabelFilter,
  type IssueListResponse,
  type JourneySummary,
  type RepoDetail,
  type RepoSelection,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTimestamp } from "@/components/questline/explore/explore-shared";
import { ExploreCatalogError } from "@/components/questline/explore/catalog-error";

export function RepoDetail({ slug, fullName }: { slug: string; fullName: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [owner, repoName] = useMemo(() => {
    const parts = fullName.split("/");
    if (parts.length < 2) return [fullName, ""];
    const [head, ...tail] = parts;
    return [head, tail.join("/")];
  }, [fullName]);

  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [repoState, setRepoState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  const [label, setLabel] = useState<IssueLabelFilter>("good-first-issue");
  const [page, setPage] = useState(1);
  const [issues, setIssues] = useState<IssueListResponse | null>(null);
  const [issuesState, setIssuesState] = useState<"loading" | "ready" | "error" | "switching">(
    "loading",
  );
  const [issuesMessage, setIssuesMessage] = useState("");

  const [selection, setSelection] = useState<RepoSelection | null>(null);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [reloadRepoTrigger, setReloadRepoTrigger] = useState(0);
  const [reloadIssuesTrigger, setReloadIssuesTrigger] = useState(0);

  // Journey state
  const [activeJourney, setActiveJourney] = useState<JourneySummary | null>(null);
  const [journeyBusy, setJourneyBusy] = useState(false);
  const [journeyError, setJourneyError] = useState("");

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const payload = await fetchRepoDetail(owner, repoName);
        if (!ignore) {
          setRepo(payload);
          setRepoState("ready");
        }
      } catch (error) {
        if (!ignore) {
          setMessage(describeApiError(error));
          setRepoState("error");
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [owner, repoName, reloadRepoTrigger]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const payload = await fetchRepoIssues(owner, repoName, label, page);
        if (!ignore) {
          setIssues(payload);
          setIssuesState("ready");
        }
      } catch (error) {
        if (!ignore) {
          setIssuesMessage(describeApiError(error));
          setIssuesState("error");
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [owner, repoName, label, page, reloadIssuesTrigger]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const list = await fetchMyRepoSelections();
        if (!ignore) {
          setSelection(list.find((item) => item.repo_full_name === fullName) ?? null);
        }
      } catch {
        // Ancillary state; the repository view still renders.
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [fullName]);

  // Look up any existing active journey for this repo
  useEffect(() => {
    if (!user) return;
    let ignore = false;
    async function load() {
      try {
        const j = await getActiveJourneyForRepo(owner, repoName);
        if (!ignore) setActiveJourney(j);
      } catch {
        // Ancillary; repo view still renders.
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [user, owner, repoName]);

  const startOrOpenJourney = async () => {
    if (activeJourney) {
      router.push(`/journeys/${activeJourney.id}`);
      return;
    }
    setJourneyBusy(true);
    setJourneyError("");
    try {
      const journey = await startJourney(owner, repoName, slug || null);
      router.push(`/journeys/${journey.id}`);
    } catch (error) {
      setJourneyError(describeApiError(error));
      setJourneyBusy(false);
    }
  };

  const changeLabel = (next: IssueLabelFilter) => {
    setIssuesState("switching");
    setIssuesMessage("");
    setLabel(next);
    setPage(1);
  };

  const goToPage = (next: number) => {
    setIssuesState("switching");
    setIssuesMessage("");
    setPage(next);
  };

  const retryIssues = () => {
    setIssuesState("loading");
    setIssuesMessage("");
    setReloadIssuesTrigger((v) => v + 1);
  };

  const retryRepo = () => {
    setRepoState("loading");
    setMessage("");
    setReloadRepoTrigger((v) => v + 1);
  };

  const toggleSelection = async () => {
    setSelectionBusy(true);
    setSelectionError("");
    try {
      if (selection) {
        await deleteRepoSelection(owner, repoName);
        setSelection(null);
      } else {
        const updated = await putRepoSelection(owner, repoName, slug, "selected");
        setSelection(updated.find((item) => item.repo_full_name === fullName) ?? null);
      }
    } catch (error) {
      setSelectionError(describeApiError(error));
    } finally {
      setSelectionBusy(false);
    }
  };

  if (repoState === "loading") {
    return (
      <div aria-live="polite" className="org-loading-banner">
        <Loader2 aria-hidden="true" className="button-spinner" size={18} />
        <span>Fetching {fullName}…</span>
      </div>
    );
  }

  if (repoState === "error" || !repo) {
    return (
      <div className="feature-page explore-page">
        <Link className="explore-back-link" href={`/explore/${slug}`}>
          <ArrowLeft aria-hidden="true" size={14} /> Back to the organization
        </Link>
        <ExploreCatalogError message={message} onRetry={retryRepo} />
      </div>
    );
  }

  const languageTotals = Object.entries(repo.language_totals).sort((a, b) => b[1] - a[1]);
  const languageSum = languageTotals.reduce((sum, entry) => sum + entry[1], 0);

  return (
    <div className="feature-page explore-page">
      <Link className="explore-back-link" href={`/explore/${slug}`}>
        <ArrowLeft aria-hidden="true" size={14} /> Back to the organization
      </Link>

      <div className="page-title-block">
        <span className="eyebrow">
          REPOSITORY <span>✦</span>
        </span>
        <h1>{repo.full_name}</h1>
        <p>{repo.description || "This repository has no description set on GitHub."}</p>
        <div className="repo-detail-meta">
          {repo.language && <span className="org-tag">{repo.language}</span>}
          {repo.license && <span className="org-tag">{repo.license}</span>}
          {repo.archived && <span className="org-tag org-archived-tag">archived</span>}
          <span className="org-meta-note">
            ★ {repo.stargazers_count.toLocaleString()} · {repo.open_issues_count.toLocaleString()}{" "}
            open issues · pushed {formatTimestamp(repo.pushed_at)}
          </span>
        </div>
        <div className="org-official-links">
          {repo.html_url && (
            <a href={repo.html_url} rel="noreferrer noopener" target="_blank">
              <ArrowUpRight aria-hidden="true" size={13} /> Open on GitHub
            </a>
          )}
          {repo.homepage && (
            <a href={repo.homepage} rel="noreferrer noopener" target="_blank">
              <ArrowUpRight aria-hidden="true" size={13} /> Project homepage
            </a>
          )}
        </div>
        {repo.topics.length > 0 && (
          <div className="org-card-tags">
            {repo.topics.slice(0, 8).map((topic) => (
              <span className="org-tag" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        )}
        {languageTotals.length > 0 && languageSum > 0 && (
          <div aria-label="Language breakdown by bytes of code" className="repo-lang-bars">
            {languageTotals.slice(0, 5).map(([language, bytes]) => (
              <span className="repo-lang-entry" key={language}>
                <span
                  className="repo-lang-bar"
                  style={{ width: `${Math.max(4, Math.round((bytes / languageSum) * 100))}%` }}
                />
                <span className="repo-lang-label">
                  {language} {Math.round((bytes / languageSum) * 100)}%
                </span>
              </span>
            ))}
          </div>
        )}
        <p className="org-historical-note">
          Metadata comes from live public GitHub ({formatTimestamp(repo.synced_at_utc)}). Stars are
          popularity, not quality — use activity as a signal, not a guarantee.
        </p>
      </div>

      <section className="org-repos-section">
        <div className="list-heading">
          <h2>Issues</h2>
          <span className="list-heading-note">
            Labels are maintained by each project — availability varies.
          </span>
        </div>

        <div className="explore-toolbar explore-toolbar-repos">
          <div className="explore-segmented" role="group" aria-label="Which issues to show">
            <button
              aria-pressed={label === "good-first-issue"}
              className={label === "good-first-issue" ? "is-active" : ""}
              onClick={() => changeLabel("good-first-issue")}
              type="button"
            >
              good first issue
            </button>
            <button
              aria-pressed={label === "help-wanted"}
              className={label === "help-wanted" ? "is-active" : ""}
              onClick={() => changeLabel("help-wanted")}
              type="button"
            >
              help wanted
            </button>
            <button
              aria-pressed={label === "all"}
              className={label === "all" ? "is-active" : ""}
              onClick={() => changeLabel("all")}
              type="button"
            >
              all open
            </button>
          </div>
          <button
            aria-pressed={Boolean(selection)}
            className={`org-follow-button${selection ? " is-followed" : ""}`}
            disabled={selectionBusy}
            onClick={() => void toggleSelection()}
            type="button"
          >
            {selectionBusy ? (
              <Loader2 aria-hidden="true" className="button-spinner" size={15} />
            ) : selection ? (
              <BookmarkCheck aria-hidden="true" size={15} />
            ) : (
              <Bookmark aria-hidden="true" size={15} />
            )}
            {selection ? "Selected" : "Select this repo"}
          </button>
          {user && (
            <button
              className={`org-follow-button${activeJourney ? " is-followed" : ""}`}
              disabled={journeyBusy}
              onClick={() => void startOrOpenJourney()}
              title={
                activeJourney
                  ? "Open your contribution journey for this repo"
                  : "Start tracking a contribution to this repo"
              }
              type="button"
            >
              {journeyBusy ? (
                <Loader2 aria-hidden="true" className="button-spinner" size={15} />
              ) : (
                <GitBranch aria-hidden="true" size={15} />
              )}
              {activeJourney ? "Open journey" : "Start journey"}
            </button>
          )}
        </div>

        {selectionError && <p className="org-card-error">{selectionError}</p>}
        {journeyError && <p className="org-card-error">{journeyError}</p>}

        {issuesState === "loading" && <div className="org-repos-loading">Fetching issues…</div>}
        {issuesState === "switching" && <div className="org-repos-loading">Switching filters…</div>}
        {issuesState === "error" && (
          <ExploreCatalogError message={issuesMessage} onRetry={retryIssues} />
        )}
        {issuesState === "ready" && issues && (
          <>
            {issues.issues.length === 0 ? (
              <p className="org-repos-empty">
                {label === "all"
                  ? "No open issues here right now — this project may be quiet; check back later."
                  : `No open issues carry the "${issues.labels_used.join(", ") || label}" label in ${issues.owner}/${issues.repo}. Many projects use different labels — try "all open".`}
              </p>
            ) : (
              <ul className="issue-list">
                {issues.issues.map((issue) => (
                  <li className="issue-item" key={issue.number}>
                    <span className="issue-state-icon">
                      {issue.state === "closed" ? (
                        <CircleCheck aria-hidden="true" size={15} />
                      ) : (
                        <Circle aria-hidden="true" size={15} />
                      )}
                    </span>
                    <div className="issue-main">
                      {issue.url ? (
                        <a
                          className="issue-title"
                          href={issue.url}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {issue.title}
                        </a>
                      ) : (
                        <span className="issue-title">{issue.title}</span>
                      )}
                      <small className="issue-meta">
                        #{issue.number}
                        {issue.comments > 0 ? ` · ${issue.comments} comments` : ""}
                        {issue.updated_at ? ` · updated ${formatTimestamp(issue.updated_at)}` : ""}
                        {issue.assignees.length > 0 ? ` · has assignees` : ""}
                      </small>
                      {issue.labels.length > 0 && (
                        <div className="issue-labels">
                          {issue.labels.slice(0, 4).map((issueLabel) => (
                            <span className="org-tag" key={issueLabel}>
                              {issueLabel}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="explore-load-more">
              {page > 1 && (
                <button
                  className="button button-outline"
                  disabled={issuesState !== "ready"}
                  onClick={() => goToPage(page - 1)}
                  type="button"
                >
                  Previous page
                </button>
              )}
              {issues.has_more && (
                <button
                  className="button button-outline"
                  disabled={issuesState !== "ready"}
                  onClick={() => goToPage(page + 1)}
                  type="button"
                >
                  Next page
                </button>
              )}
            </div>
            <p className="org-historical-note">{issues.note}</p>
          </>
        )}
      </section>
    </div>
  );
}
