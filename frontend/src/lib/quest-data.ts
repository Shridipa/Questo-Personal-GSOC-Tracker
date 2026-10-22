export type QuestStatus = "completed" | "current" | "available" | "locked";

export type Quest = {
  id: string;
  title: string;
  description: string;
  category: string;
  minutes: number;
  xp: number;
  status: QuestStatus;
  phase: string;
  date: string;
};

export type RoadmapPhase = {
  id: number;
  title: string;
  dates: string;
  description: string;
  milestone: string;
  quests: string[];
};
