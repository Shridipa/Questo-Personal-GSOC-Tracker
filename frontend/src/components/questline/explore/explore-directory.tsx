"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, Loader2, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  describeApiError,
  fetchOrgs,
  fetchPreferences,
  fetchRecommendations,
  followOrg,
  savePreferences,
  unfollowOrg,
  type CatalogMeta,
  type OrgSummary,
  type Preferences,
  type RecommendationEntry,
} from "@/lib/api";
import { OrgLogo, ParticipationYears } from "@/components/questline/explore/explore-shared";
import { PreferencesDialog } from "@/components/questline/explore/preferences-dialog";
import { ExploreCatalogError } from "@/components/questline/explore/catalog-error";
import { useDebouncedValue } from "@/components/questline/explore/use-debounced-value";

const PAGE_SIZE = 60;

type LoadState = "loading" | "ready" | "error";

function OrgCard({
  org,
  onToggleFollow,
  busy,
  followError,
}: {
  org: OrgSummary;
  onToggleFollow: (slug: string, followed: boolean) => void;
  busy: boolean;
  followError?: string;
}) {
  return (
    <article className={`org-card${org.followed ? " org-followed" : ""}`} data-org-slug={org.slug}>
      <div className="org-card-top">
        <OrgLogo src={org.logo_url} name={org.name} backgroundColor={org.image_background_color} />
        <div className="org-card-names">
          <Link
            aria-label={`Open the profile of ${org.name}`}
            className="org-card-name"
            href={`/explore/${org.slug}`}
          >
            {org.name}
          </Link>
          <ParticipationYears years={org.participation_years} />
        </div>
        <button
          aria-pressed={org.followed}
          className={`org-follow-button${org.followed ? " is-followed" : ""}`}
          disabled={busy}
          onClick={() => onToggleFollow(org.slug, org.followed)}
          title={org.followed ? "Stop following this organization" : "Follow this organization"}
          type="button"
        >
          <Heart aria-hidden="true" size={15} />
          {org.followed ? "Following" : "Follow"}
        </button>
      </div>
      <p className="org-card-description">
        {org.description || "No description in the catalog yet."}
      </p>
      <div className="org-card-tags">
        {org.category && <span className="org-tag org-category-tag">{org.category}</span>}
        {org.technologies.slice(0, 3).map((tech) => (
          <span className="org-tag" key={`${org.slug}-${tech}`}>
            {tech}
          </span>
        ))}
      </div>
      {followError && <p className="org-card-error">{followError}</p>}
      <footer className="org-card-footer">
        <Link className="text-button" href={`/explore/${org.slug}`}>
          Open profile <ArrowRight aria-hidden="true" size={13} />
        </Link>
        {org.latest_projects_count !== null && org.latest_projects_count > 0 ? (
          <span className="org-meta-note">
            {org.latest_projects_count} project{org.latest_projects_count === 1 ? "" : "s"} in last
            catalog
          </span>
        ) : null}
      </footer>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div aria-hidden="true" className="org-card org-card-skeleton">
      <div className="org-card-top">
        <div className="org-skeleton-avatar" />
        <div className="org-skeleton-lines">
          <div className="org-skeleton-line is-wide" />
          <div className="org-skeleton-line is-narrow" />
        </div>
      </div>
      <div className="org-skeleton-line is-full" />
      <div className="org-skeleton-line is-medium" />
    </div>
  );
}

const DEFAULT_PREFERENCES: Preferences = {
  interests: [],
  languages: [],
  experience_level: "new",
  weekly_hours: 5,
  updated_at_utc: null,
};

export function ExploreDirectory() {
  const { user } = useAuth();
  const [queryInput, setQueryInput] = useState("");
  const search = useDebouncedValue(queryInput, 350);
  const [category, setCategory] = useState("");
  const [technology, setTechnology] = useState("");
  const [topic, setTopic] = useState("");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState<string[]>([]);
  const [followErrors, setFollowErrors] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<RecommendationEntry[]>([]);
  const [recommendationsState, setRecommendationsState] = useState<
    "loading" | "ready" | "empty" | "error" | "no-prefs"
  >("loading");
  const [prefsDialogOpen, setPrefsDialogOpen] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState("");

  const fetchCatalog = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setMoreLoading(true);
      else setState("loading");
      try {
        const payload = await fetchOrgs({
          q: search,
          category,
          technology,
          topic,
          limit: PAGE_SIZE,
          offset,
        });
        setOrgs((current) => (append ? [...current, ...payload.orgs] : payload.orgs));
        setMeta(payload.meta);
        setState("ready");
      } catch (error) {
        const text = describeApiError(error);
        if (append) {
          setMessage(text);
        } else {
          setState("error");
          setMessage(text);
        }
      } finally {
        setMoreLoading(false);
      }
    },
    [category, search, technology, topic],
  );

  const loadRecommendations = useCallback(async () => {
    setRecommendationsState("loading");
    try {
      const [prefs, recs] = await Promise.all([fetchPreferences(), fetchRecommendations()]);
      const hasPrefs =
        prefs.interests.length > 0 ||
        prefs.languages.length > 0 ||
        prefs.experience_level !== DEFAULT_PREFERENCES.experience_level ||
        prefs.weekly_hours !== DEFAULT_PREFERENCES.weekly_hours;
      if (!hasPrefs) {
        setRecommendations([]);
        setRecommendationsState("no-prefs");
        return;
      }
      setRecommendations(recs.recommendations);
      setRecommendationsState(recs.recommendations.length === 0 ? "empty" : "ready");
    } catch (error) {
      setRecommendationsState("error");
      setMessage(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    void fetchCatalog(0, false);
  }, [fetchCatalog]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const loadMore = () => {
    void fetchCatalog(orgs.length, true);
  };

  const toggleFollow = async (slug: string, followed: boolean) => {
    setFollowBusy((busy) => [...busy, slug]);
    setFollowErrors((errors) => {
      const next = { ...errors };
      delete next[slug];
      return next;
    });
    try {
      const updated = followed ? await unfollowOrg(slug) : await followOrg(slug);
      setOrgs((current) =>
        current.map((org) => (org.slug === slug ? { ...org, followed: updated.followed } : org)),
      );
    } catch (error) {
      setFollowErrors((errors) => ({ ...errors, [slug]: describeApiError(error) }));
    } finally {
      setFollowBusy((busy) => busy.filter((item) => item !== slug));
    }
  };

  const savePrefs = async (values: Omit<Preferences, "updated_at_utc">) => {
    setPrefsSaving(true);
    setPrefsError("");
    try {
      await savePreferences(values);
      setPrefsDialogOpen(false);
      await loadRecommendations();
    } catch (error) {
      setPrefsError(describeApiError(error));
    } finally {
      setPrefsSaving(false);
    }
  };

  const facets = useMemo(() => {
    const categories = new Set<string>();
    const technologies = new Set<string>();
    const topics = new Set<string>();
    for (const org of orgs) {
      if (org.category) categories.add(org.category);
      for (const tech of org.technologies) technologies.add(tech);
      for (const topicValue of org.topics) topics.add(topicValue);
    }
    return {
      categories: [...categories].sort((a, b) => a.localeCompare(b)),
      technologies: [...technologies].sort((a, b) => a.localeCompare(b)),
      topics: [...topics].sort((a, b) => a.localeCompare(b)),
    };
  }, [orgs]);

  const canLoadMore = meta ? orgs.length < meta.count : false;
  const filtersActive = Boolean(category || technology || topic || search);

  return (
    <div className="feature-page explore-page">
      <div className="page-title-block">
        <span className="eyebrow">
          EXPLORE <span>✦</span>
        </span>
        <h1>Find your open-source home</h1>
        <p>
          Browse the organizations from the official Google Summer of Code archive, peek inside
          their repositories, and shortlist the projects that match your skills. Participation years
          below are historical records — not a promise about any future program.
        </p>
      </div>

      {!user && (
        <p className="explore-guest-note">
          You&apos;re exploring as a guest. Sign in to keep your follows, preferences and shortlists
          in sync across devices.
        </p>
      )}

      <section className="explore-recommendations">
        {recommendationsState === "loading" && (
          <p className="explore-rec-loading">Finding organizations that might fit you…</p>
        )}
        {recommendationsState === "no-prefs" && (
          <div className="explore-rec-cta">
            <p>Looking for your kind of organization? Tell Questo what you build.</p>
            <button
              className="button button-primary"
              onClick={() => setPrefsDialogOpen(true)}
              type="button"
            >
              Set your skills &amp; interests
            </button>
          </div>
        )}
        {recommendationsState === "empty" && (
          <p className="explore-rec-note">
            Nothing matched your saved preferences — browse the full catalog below.
          </p>
        )}
        {recommendationsState === "error" && (
          <p className="explore-rec-error">Recommendations unavailable: {message}</p>
        )}
        {recommendationsState === "ready" && (
          <>
            <div className="explore-rec-head">
              <h2>
                Picked for you
                <small>matched on your saved skills, interests and activity</small>
              </h2>
              <button
                className="text-button"
                onClick={() => setPrefsDialogOpen(true)}
                type="button"
              >
                Tune preferences
              </button>
            </div>
            <ul className="explore-rec-list">
              {recommendations.slice(0, 6).map((rec) => (
                <li key={rec.slug}>
                  <Link className="explore-rec-card" href={`/explore/${rec.slug}`}>
                    <div className="explore-rec-top">
                      <OrgLogo size={38} name={rec.name} src={rec.logo_url} />
                      <span className="explore-rec-name">{rec.name}</span>
                      <ParticipationYears years={rec.participation_years} />
                    </div>
                    <ul className="explore-rec-reasons">
                      {rec.reasons.slice(0, 3).map((reason, index) => (
                        <li key={`${rec.slug}-reason-${index}`}>{reason}</li>
                      ))}
                    </ul>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="explore-toolbar">
        <label className="explore-search">
          <span aria-hidden="true" className="explore-search-icon">
            <Search size={15} />
          </span>
          <span className="visually-hidden">Search organizations</span>
          <input
            aria-label="Search organizations"
            data-testid="org-search"
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search by name, language or mission…"
            type="search"
            value={queryInput}
          />
        </label>
        <select
          aria-label="Filter by category"
          className="explore-filter"
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          <option value="">All categories</option>
          {facets.categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by technology"
          className="explore-filter"
          onChange={(event) => setTechnology(event.target.value)}
          value={technology}
        >
          <option value="">All technologies</option>
          {facets.technologies.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by topic"
          className="explore-filter"
          onChange={(event) => setTopic(event.target.value)}
          value={topic}
        >
          <option value="">All topics</option>
          {facets.topics.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </section>

      <div aria-live="polite" className="explore-status-line">
        {state === "ready" && meta && (
          <span>
            {filtersActive
              ? `${orgs.length} matched of ${meta.count} organizations`
              : `${meta.count} organizations archived`}
            {meta.stale ? " · some archive years still syncing" : ""}
          </span>
        )}
      </div>

      {state === "loading" && (
        <div className="org-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={`skeleton-${index}`} />
          ))}
        </div>
      )}

      {state === "error" && (
        <ExploreCatalogError message={message} onRetry={() => void fetchCatalog(0, false)} />
      )}

      {state === "ready" && orgs.length === 0 && (
        <div className="explore-empty">
          <p>
            {filtersActive
              ? "No organizations match those filters — try widening your search."
              : "The organization catalog is empty. The upstream archive is still syncing; please try again shortly."}
          </p>
        </div>
      )}

      {state === "ready" && orgs.length > 0 && (
        <>
          <div className="org-grid">
            {orgs.map((org) => (
              <OrgCard
                busy={followBusy.includes(org.slug)}
                followError={followErrors[org.slug]}
                key={org.slug}
                onToggleFollow={(slug) => void toggleFollow(slug, org.followed)}
                org={org}
              />
            ))}
          </div>
          {canLoadMore && (
            <div className="explore-load-more">
              <button
                className="button button-outline"
                disabled={moreLoading}
                onClick={loadMore}
                type="button"
              >
                {moreLoading ? (
                  <Loader2 aria-hidden="true" className="button-spinner" size={15} />
                ) : (
                  <RefreshCw aria-hidden="true" size={15} />
                )}
                {moreLoading
                  ? "Loading…"
                  : `Load ${Math.min(PAGE_SIZE, (meta?.count ?? 0) - orgs.length)} more`}
              </button>
            </div>
          )}
        </>
      )}

      {prefsDialogOpen && (
        <PreferencesDialog
          defaultValue={DEFAULT_PREFERENCES}
          error={prefsError}
          onClose={() => setPrefsDialogOpen(false)}
          onSave={savePrefs}
          saving={prefsSaving}
        />
      )}
    </div>
  );
}
