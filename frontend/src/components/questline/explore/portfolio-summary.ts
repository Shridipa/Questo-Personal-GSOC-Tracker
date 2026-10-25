import type { JourneyStatus, PortfolioEntry, PortfolioOutcome } from "@/lib/api";

export const STATUS_LABELS: Record<JourneyStatus, string> = {
  preparing: "Preparing",
  issue_selected: "Issue selected",
  in_progress: "In progress",
  pr_open: "PR open",
  changes_requested: "Changes requested",
  merged: "Merged ✓",
  closed: "Closed",
  paused: "Paused",
  abandoned: "Abandoned",
};

/** Outcome wording derived only from GitHub-synced data — never exaggerated. */
export const OUTCOME_LABELS: Record<PortfolioOutcome, { label: string; cls: string }> = {
  merged: { label: "Merged on GitHub", cls: "journey-badge-green" },
  closed_unmerged: { label: "Closed without merging", cls: "journey-badge-neutral" },
  open: { label: "PR open", cls: "journey-badge-purple" },
  no_pr: { label: "No PR yet", cls: "journey-badge-neutral" },
  unknown: { label: "PR state unknown", cls: "journey-badge-neutral" },
};

/** Plain-text summary the user can copy — only public-friendly fields. */
export function buildPortfolioSummary(entries: PortfolioEntry[]): string {
  const lines: string[] = ["My open-source contribution portfolio", ""];
  for (const entry of entries) {
    const parts: string[] = [
      entry.repo_full_name,
      `(${STATUS_LABELS[entry.status] ?? entry.status})`,
    ];
    if (entry.issue_number) parts.push(`Issue #${entry.issue_number}`);
    if (entry.pr_number) {
      const outcome =
        entry.pr_outcome === "merged"
          ? "merged"
          : entry.pr_outcome === "closed_unmerged"
            ? "closed without merging"
            : entry.pr_outcome === "open"
              ? "open"
              : "PR state: see GitHub";
      parts.push(`PR #${entry.pr_number} — ${outcome}`);
    }
    lines.push(`- ${parts.join(" · ")}`);
    if (entry.skills_practiced.trim()) {
      lines.push(`  Skills practiced: ${entry.skills_practiced.trim()}`);
    }
    if (entry.lessons_learned.trim()) {
      lines.push(`  Lessons learned: ${entry.lessons_learned.trim()}`);
    }
  }
  return lines.join("\n");
}
