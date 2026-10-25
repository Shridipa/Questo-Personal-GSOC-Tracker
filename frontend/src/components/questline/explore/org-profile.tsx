"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Globe,
  Loader2,
  Lightbulb,
  BookMarked,
} from "lucide-react";
import {
  describeApiError,
  fetchMyRepoSelections,
  fetchOrg,
  fetchOrgRepos,
  fetchOrgReposRefreshed,
  followOrg,
  putRepoSelection,
  unfollowOrg,
  deleteRepoSelection,
  type OrgDetail,
  type RepoListResponse,
  type RepoSelection,
} from "@/lib/api";
import {
  OrgLogo,
  ParticipationYears,
  formatTimestamp,
} from "@/components/questline/explore/explore-shared";
import { ExploreCatalogError } from "@/components/questline/explore/catalog-error";

type RepoSort = "pushed" | "stars" | "name";

function repoSort(repos: RepoListResponse["repositories"], sort: RepoSort) {
  const copy = [...repos];
  copy.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "stars") return b.stargazers_count - a.stargazers_count;
    return (b.pushed_at ?? "").localeCompare(a.pushed_at ?? "");
  });
  return copy;
}

export function OrgProfile({ slug }: { slug: string }) {
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [orgState, setOrgState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [repos, setRepos] = useState<RepoListResponse | null>(null);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [reposMessage, setReposMessage] = useState("");
  const [reposRefreshing, setReposRefreshing] = useState(false);
  const [sort, setSort] = useState<RepoSort>("pushed");
  const [languageFilter, setLanguageFilter] = useState("");
  const [hideArchived, setHideArchived] = useState(true);
  const [selections, setSelections] = useState<Record<string, RepoSelection>>({});
  const [selectionBusy, setSelectionBusy] = useState<string[]>([]);
  const [selectionErrors, setSelectionErrors] = useState<Record<string, string>>({});
  const [followBusy, setFollowBusy] = useState(false);

  const loadOrg = useCallback(async () => {
    setOrgState("loading");
    setMessage("");
    try {
      setOrg(await fetchOrg(slug));
      setOrgState("ready");
    } catch (error) {
      setMessage(describeApiError(error));
      setOrgState("error");
    }
  }, [slug]);

  const loadRepos = useCallback(
    async (force = false) => {
      if (force) setReposRefreshing(true);
      setReposState("loading");
      setReposMessage("");
      try {
        const payload = await (force ? fetchOrgReposRefreshed(slug) : fetchOrgRepos(slug));
        setRepos(payload);
        setReposState("ready");
      } catch (error) {
        setReposMessage(describeApiError(error));
        setReposState("error");
      } finally {
        setReposRefreshing(false);
      }
    },
    [slug],
  );

  const loadSelections = useCallback(async () => {
    try {
      const list = await fetchMyRepoSelections();
      setSelections(
        Object.fromEntries(list.map((selection) => [selection.repo_full_name, selection])),
      );
    } catch {
      // Selection state is ancillary; the repository list still renders.
    }
  }, []);

  useEffect(() => {
    void loadOrg();
    void loadSelections();
  }, [loadOrg, loadSelections]);

  useEffect(() => {
    if (!org) return;
    if (!org.repo_url) {
      setRepos({
        github_org: "",
        repositories: [],
        synced_at_utc: org.synced_at_utc || new Date().toISOString(),
        total_fetched: 0,
        complete: true,
        note: "This organization does not have a linked GitHub repository in the official GSoC archive.",
      });
      setReposState("ready");
      return;
    }
    void loadRepos(false);
  }, [org, loadRepos]);

  const toggleSelection = async (repoFull: string) => {
    if (!repoFull.includes("/")) return;
    const [owner, ...rest] = repoFull.split("/");
    const repo = rest.join("/"); // repo names can contain dots
    const existing = selections[repoFull];
    setSelectionBusy((busy) => [...busy, repoFull]);
    setSelectionErrors((errors) => {
      const next = { ...errors };
      delete next[repoFull];
      return next;
    });
    try {
      if (existing) {
        await deleteRepoSelection(owner, repo);
        setSelections((current) => {
          const next = { ...current };
          delete next[repoFull];
          return next;
        });
      } else {
        const updated = await putRepoSelection(owner, repo, slug, "shortlisted");
        setSelections(
          Object.fromEntries(updated.map((selection) => [selection.repo_full_name, selection])),
        );
      }
    } catch (error) {
      setSelectionErrors((errors) => ({ ...errors, [repoFull]: describeApiError(error) }));
    } finally {
      setSelectionBusy((busy) => busy.filter((item) => item !== repoFull));
    }
  };

  const toggleFollow = async () => {
    if (!org) return;
    setFollowBusy(true);
    try {
      const state = org.followed ? await unfollowOrg(org.slug) : await followOrg(org.slug);
      setOrg({ ...org, followed: state.followed });
    } catch (error) {
      setMessage(describeApiError(error));
    } finally {
      setFollowBusy(false);
    }
  };

  const repoYears = useMemo(
    () => (org ? repoSort(repos?.repositories ?? [], sort) : []),
    [org, repos, sort],
  );

  const visibleRepos = useMemo(() => {
    const filtered = repoYears.filter((repo) => {
      if (hideArchived && repo.archived) return false;
      if (languageFilter && repo.language !== languageFilter) return false;
      return true;
    });
    return filtered;
  }, [repoYears, hideArchived, languageFilter]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const repo of repos?.repositories ?? []) {
      if (repo.language) set.add(repo.language);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [repos]);

  if (orgState === "loading") {
    return (
      <div aria-live="polite" className="org-loading-banner">
        <Loader2 aria-hidden="true" className="button-spinner" size={18} />
        <span>Loading {slug}…</span>
      </div>
    );
  }

  if (orgState === "error" || !org) {
    return (
      <div className="feature-page explore-page">
        <Link className="explore-back-link" href="/explore">
          <ArrowLeft aria-hidden="true" size={14} /> Back to organizations
        </Link>
        <ExploreCatalogError message={message} onRetry={() => void loadOrg()} />
      </div>
    );
  }

  const officialLinks: { href: string | null; label: string; icon: typeof Globe }[] = [
    { href: org.website_url, label: "Website", icon: Globe },
    { href: org.ideas_url, label: "Project ideas list", icon: Lightbulb },
    { href: org.guide_url, label: "Contribution guide", icon: BookMarked },
    { href: org.repo_url, label: "GitHub", icon: ArrowUpRight },
  ];

  return (
    <div className="feature-page explore-page">
      <Link className="explore-back-link" href="/explore">
        <ArrowLeft aria-hidden="true" size={14} /> Back to organizations
      </Link>

      <div className="page-title-block org-header">
        <div className="org-header-top">
          <OrgLogo
            size={56}
            name={org.name}
            src={org.logo_url}
            backgroundColor={org.image_background_color}
          />
          <div className="org-header-copy">
            <span className="eyebrow">
              FINDING YOUR HOME <span>✦</span>
            </span>
            <h1>{org.name}</h1>
            {org.category && <span className="org-tag org-category-tag">{org.category}</span>}
          </div>
          <button
            aria-pressed={org.followed}
            className={`button ${org.followed ? "button-outline" : "button-primary"}`}
            disabled={followBusy}
            onClick={() => void toggleFollow()}
            type="button"
          >
            {followBusy ? (
              <Loader2 aria-hidden="true" className="button-spinner" size={15} />
            ) : (
              <Bookmark aria-hidden="true" size={15} />
            )}
            {org.followed ? "Following" : "Follow this org"}
          </button>
        </div>
        <p>{org.description}</p>
        <div className="org-header-meta">
          <ParticipationYears years={org.participation_years} />
          {org.synced_at_utc && (
            <span className="org-meta-note">
              catalog synced {formatTimestamp(org.synced_at_utc)}
            </span>
          )}
        </div>
        <div className="org-official-links">
          {officialLinks
            .filter((link) => Boolean(link.href))
            .map((link) => (
              <a href={link.href ?? "#"} key={link.label} rel="noreferrer noopener" target="_blank">
                <link.icon aria-hidden="true" size={13} /> {link.label}
              </a>
            ))}
        </div>
        <p className="org-historical-note">
          Participation years come from the official GSoC archive. They do not confirm participation
          in any upcoming program — always check the organization&apos;s own announcements.
        </p>
      </div>

      <section className="org-repos-section">
        <div className="list-heading">
          <h2>Repositories</h2>
          {org.repo_url && (
            <button
              className="text-button"
              disabled={reposRefreshing}
              onClick={() => void loadRepos(true)}
              type="button"
            >
              {reposRefreshing ? (
                <Loader2 aria-hidden="true" className="button-spinner" size={14} />
              ) : null}
              {reposRefreshing ? "Refreshing…" : "Refresh from GitHub"}
            </button>
          )}
        </div>

        {reposState === "error" ? (
          reposMessage.toLowerCase().includes("could not derive a github organization") ? (
            <p className="org-repos-empty">{reposMessage}</p>
          ) : (
            <ExploreCatalogError message={reposMessage} onRetry={() => void loadRepos(false)} />
          )
        ) : reposState === "loading" || !repos ? (
          <div className="org-repos-loading">Fetching repositories…</div>
        ) : repos.repositories.length === 0 ? (
          <p className="org-repos-empty">
            {repos.note || "No public repositories found for this organization on GitHub."}
          </p>
        ) : (
          <>
            <div className="explore-toolbar explore-toolbar-repos">
              <select
                aria-label="Sort repositories"
                className="explore-filter"
                onChange={(event) => setSort(event.target.value as RepoSort)}
                value={sort}
              >
                <option value="pushed">Recently pushed</option>
                <option value="stars">Most stars</option>
                <option value="name">Name (A–Z)</option>
              </select>
              <select
                aria-label="Filter by language"
                className="explore-filter"
                onChange={(event) => setLanguageFilter(event.target.value)}
                value={languageFilter}
              >
                <option value="">All languages</option>
                {languages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
              <label className="org-archived-toggle">
                <input
                  checked={hideArchived}
                  onChange={(event) => setHideArchived(event.target.checked)}
                  type="checkbox"
                />
                Hide archived
              </label>
            </div>
            {repos.note && repos.complete === false && (
              <p className="org-meta-note org-partial-note">{repos.note}</p>
            )}

            <div className="repo-list">
              {visibleRepos.map((repo) => {
                const selection = selections[repo.full_name];
                const busy = selectionBusy.includes(repo.full_name);
                const selectionError = selectionErrors[repo.full_name];
                return (
                  <article className="repo-card" data-repo={repo.full_name} key={repo.full_name}>
                    <div className="repo-card-main">
                      <Link
                        className="repo-card-name"
                        href={`/explore/${org.slug}/repo/${encodeURIComponent(repo.full_name)}`}
                      >
                        {repo.full_name}
                      </Link>
                      {repo.language && <span className="org-tag">{repo.language}</span>}
                      {repo.license && <span className="org-tag">{repo.license}</span>}
                      {repo.archived && <span className="org-tag org-archived-tag">archived</span>}
                    </div>
                    <p className="repo-card-description">
                      {repo.description || "No description set."}
                    </p>
                    <div className="repo-card-meta">
                      <span>★ {repo.stargazers_count.toLocaleString()}</span>
                      <span>Forks {repo.forks_count.toLocaleString()}</span>
                      <span>{repo.open_issues_count.toLocaleString()} open issues</span>
                      {repo.pushed_at && <span>pushed {formatTimestamp(repo.pushed_at)}</span>}
                    </div>
                    {selectionError && <p className="org-card-error">{selectionError}</p>}
                    <div className="repo-card-actions">
                      <button
                        className={`org-follow-button${selection ? " is-followed" : ""}`}
                        disabled={busy}
                        onClick={() => void toggleSelection(repo.full_name)}
                        title={
                          selection ? "Remove from your shortlist" : "Shortlist this repository"
                        }
                        type="button"
                      >
                        {busy ? (
                          <Loader2 aria-hidden="true" className="button-spinner" size={15} />
                        ) : selection ? (
                          <BookmarkCheck aria-hidden="true" size={15} />
                        ) : (
                          <Bookmark aria-hidden="true" size={15} />
                        )}
                        {selection ? "Shortlisted" : "Shortlist"}
                      </button>
                      <Link
                        className="text-button"
                        href={`/explore/${org.slug}/repo/${encodeURIComponent(repo.full_name)}`}
                      >
                        Explore repository <ArrowUpRight aria-hidden="true" size={13} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
            {visibleRepos.length === 0 && (
              <p className="org-repos-empty">No repositories match the current filters.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
