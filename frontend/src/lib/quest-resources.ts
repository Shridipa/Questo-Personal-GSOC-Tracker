export type QuestResource = {
  title: string;
  url: string;
  description: string;
  resourceType: "Official documentation" | "Official program guidance" | "Contribution guide";
  verifiedAt: "2026-10-22";
};

const resources = {
  git: {
    title: "Git reference documentation",
    url: "https://git-scm.com/docs",
    description: "Review branches, commits, merges, and pull-request preparation.",
    resourceType: "Official documentation",
    verifiedAt: "2026-10-22",
  },
  githubContributing: {
    title: "GitHub: Contributing to open source",
    url: "https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source",
    description: "Follow a complete contribution workflow and learn to follow project guidelines.",
    resourceType: "Official documentation",
    verifiedAt: "2026-10-22",
  },
  githubForks: {
    title: "GitHub Docs: About forks",
    url: "https://docs.github.com/en/pull-requests/reference/forks",
    description: "Understand how forks relate to upstream repositories and branches.",
    resourceType: "Official documentation",
    verifiedAt: "2026-10-22",
  },
  openSourceGuide: {
    title: "Open Source Guides: How to contribute",
    url: "https://opensource.guide/how-to-contribute/",
    description: "Learn how to find a project, understand its community, and make a contribution.",
    resourceType: "Contribution guide",
    verifiedAt: "2026-10-22",
  },
  python: {
    title: "The Python Tutorial",
    url: "https://docs.python.org/3/tutorial/",
    description: "Refresh Python fundamentals before setting up or changing a project.",
    resourceType: "Official documentation",
    verifiedAt: "2026-10-22",
  },
  pytest: {
    title: "pytest: Get started",
    url: "https://docs.pytest.org/en/stable/getting-started.html",
    description: "Learn how to run tests and write assertions with pytest.",
    resourceType: "Official documentation",
    verifiedAt: "2026-10-22",
  },
  openvino: {
    title: "OpenVINO contribution guide",
    url: "https://github.com/openvinotoolkit/openvino/blob/master/CONTRIBUTING.md",
    description: "Read OpenVINO's actual contribution, technical, and testing guidance.",
    resourceType: "Contribution guide",
    verifiedAt: "2026-10-22",
  },
  goodFirstIssues: {
    title: "GitHub topic: good first issues",
    url: "https://github.com/topics/good-first-issue",
    description: "Browse a broad discovery list, then confirm requirements in each project.",
    resourceType: "Contribution guide",
    verifiedAt: "2026-10-22",
  },
  firstContributions: {
    title: "First Contributions walkthrough",
    url: "https://github.com/firstcontributions/first-contributions/blob/main/README.md",
    description: "Practice the first-contribution workflow using its guided repository.",
    resourceType: "Contribution guide",
    verifiedAt: "2026-10-22",
  },
  gsocHelp: {
    title: "Official GSoC help",
    url: "https://summerofcode.withgoogle.com/help",
    description: "Check official program help and community support links.",
    resourceType: "Official program guidance",
    verifiedAt: "2026-10-22",
  },
  gsocGuidance: {
    title: "GSoC contributor guidance",
    url: "https://developers.google.com/open-source/gsoc/help/contributor-guidance",
    description: "Review proposal expectations, project prerequisites, and community engagement.",
    resourceType: "Official program guidance",
    verifiedAt: "2026-10-22",
  },
  gsocTimeline: {
    title: "Official GSoC timeline",
    url: "https://developers.google.com/open-source/gsoc/timeline",
    description: "Check the program's published timeline; dates vary by program year.",
    resourceType: "Official program guidance",
    verifiedAt: "2026-10-22",
  },
} satisfies Record<string, QuestResource>;

const questResources: Record<string, QuestResource[]> = {
  welcome: [resources.openSourceGuide, resources.githubContributing],
  "git-workflow": [resources.git, resources.githubForks],
  "merge-conflict": [resources.git],
  "python-env": [resources.python],
  pytest: [resources.pytest],
  openvino: [resources.openvino],
  "first-issue": [
    resources.goodFirstIssues,
    resources.firstContributions,
    resources.openSourceGuide,
  ],
  "first-pr": [resources.githubContributing, resources.githubForks],
};

const phaseResources: Record<number, QuestResource[]> = {
  1: [resources.git, resources.python, resources.openSourceGuide],
  2: [resources.githubContributing, resources.git],
  3: [resources.openSourceGuide, resources.githubContributing],
  4: [resources.gsocHelp, resources.gsocTimeline],
  5: [resources.gsocGuidance],
  6: [resources.gsocHelp, resources.gsocTimeline, resources.gsocGuidance],
  7: [resources.gsocHelp, resources.openSourceGuide],
};

export function getQuestResources(questId: string): QuestResource[] {
  return questResources[questId] ?? [];
}

export function getPhaseResources(phaseId: number): QuestResource[] {
  return phaseResources[phaseId] ?? [];
}

export function getQuestChecklist(questId: string): { id: string; label: string }[] {
  const checklists: Record<string, { id: string; label: string }[]> = {
    welcome: [
      { id: "read-contribution-guide", label: "Read how open-source contributions work." },
      { id: "choose-focus", label: "Write down one area or project type to explore." },
      { id: "note-next-step", label: "Choose one concrete next step." },
    ],
    "git-workflow": [
      { id: "review-branches", label: "Review how branches keep work isolated." },
      { id: "practice-commit", label: "Create a small branch and commit locally." },
      { id: "review-pull-request", label: "Review how a fork and pull request work." },
    ],
    "merge-conflict": [
      { id: "create-conflict", label: "Create a small conflict in a practice repository." },
      { id: "resolve-conflict", label: "Resolve it and inspect the final diff." },
      { id: "record-commands", label: "Record the commands or steps that helped." },
    ],
    "python-env": [
      { id: "choose-python", label: "Check the Python version required by your target project." },
      { id: "create-environment", label: "Create and activate an isolated environment." },
      { id: "verify-python", label: "Run Python and pip from the environment." },
    ],
    pytest: [
      { id: "run-pytest", label: "Run a pytest test command and inspect the result." },
      { id: "write-assertion", label: "Write one small assertion in a practice test." },
      { id: "record-test-command", label: "Save the test command you will reuse." },
    ],
    openvino: [
      { id: "read-openvino-guide", label: "Read the OpenVINO contribution guide." },
      { id: "review-project-tests", label: "Find the project's testing and setup instructions." },
      {
        id: "note-contribution-area",
        label: "Record one area to investigate; don't assume an issue is available.",
      },
    ],
    "first-issue": [
      { id: "find-candidates", label: "Find three issues in projects you actually want to use." },
      {
        id: "check-contribution-guide",
        label: "Check each project's contribution guide and issue activity.",
      },
      {
        id: "choose-candidate",
        label: "Choose one issue to investigate or ask maintainers about.",
      },
    ],
    "first-pr": [
      {
        id: "confirm-scope",
        label: "Confirm the issue and proposed change with project guidance.",
      },
      { id: "test-change", label: "Run the relevant tests and inspect your diff." },
      { id: "submit-pr", label: "Submit a focused pull request and save its link as evidence." },
    ],
  };
  return (
    checklists[questId] ?? [
      { id: "review-objective", label: "Review the quest objective and project guidance." },
      { id: "complete-work", label: "Complete the work described in the quest." },
      { id: "record-outcome", label: "Record what you learned or produced." },
    ]
  );
}
