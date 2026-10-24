"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Preferences } from "@/lib/api";

const EXPERIENCE_OPTIONS: { value: Preferences["experience_level"]; label: string }[] = [
  { value: "new", label: "New to open source" },
  { value: "some", label: "A few contributions so far" },
  { value: "experienced", label: "Regular contributor" },
];

function toInput(list: string[]): string {
  return list.join(", ");
}

function parseInput(raw: string): string[] {
  const seen = new Set<string>([]);
  const entries: string[] = [];
  for (const item of raw.split(",")) {
    const entry = item.trim().slice(0, 40);
    const key = entry.toLowerCase();
    if (!entry || seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries.slice(0, 15);
}

export function PreferencesDialog({
  defaultValue,
  saving,
  error,
  onClose,
  onSave,
}: {
  defaultValue: Preferences;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: Omit<Preferences, "updated_at_utc">) => void;
}) {
  const [interests, setInterests] = useState(toInput(defaultValue.interests));
  const [languages, setLanguages] = useState(toInput(defaultValue.languages));
  const [experienceLevel, setExperienceLevel] = useState(defaultValue.experience_level);
  const [weeklyHours, setWeeklyHours] = useState(String(defaultValue.weekly_hours));

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div aria-modal="true" className="quest-dialog" role="dialog">
        <button
          aria-label="Close preferences"
          className="dialog-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
        <h2>Your skills &amp; interests</h2>
        <p>
          Questo uses these to explain which organizations could fit you. Matched picks always show
          their reasons — nothing is a hidden score.
        </p>

        <div className="quest-work-section">
          <label className="quest-work-label">
            Interests
            <span> (topics or projects you care about, comma-separated)</span>
          </label>
          <input
            aria-label="Interests, comma-separated"
            onChange={(event) => setInterests(event.target.value)}
            placeholder="machine translation, climate data, design systems"
            value={interests}
          />

          <label className="quest-work-label" style={{ display: "block", marginTop: 14 }}>
            Programming languages
            <span> (the ones you already know)</span>
          </label>
          <input
            aria-label="Programming languages, comma-separated"
            onChange={(event) => setLanguages(event.target.value)}
            placeholder="Python, TypeScript, Rust"
            value={languages}
          />

          <label className="quest-work-label" style={{ display: "block", marginTop: 14 }}>
            Open-source experience
          </label>
          <select
            aria-label="Open-source experience level"
            onChange={(event) =>
              setExperienceLevel(event.target.value as Preferences["experience_level"])
            }
            value={experienceLevel}
          >
            {EXPERIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="quest-work-label" style={{ display: "block", marginTop: 14 }}>
            Hours per week you can give
          </label>
          <input
            aria-label="Weekly hours you can contribute"
            inputMode="numeric"
            max={60}
            min={0}
            onChange={(event) => setWeeklyHours(event.target.value)}
            pattern="[0-9]*"
            placeholder="5"
            value={weeklyHours}
          />
        </div>

        {error && <p className="completion-error">{error}</p>}

        <div className="quest-work-actions">
          <button
            className="button button-primary"
            disabled={saving || !/^\d+$/.test(weeklyHours) || Number(weeklyHours) > 60}
            onClick={() =>
              onSave({
                interests: parseInput(interests),
                languages: parseInput(languages),
                experience_level: experienceLevel,
                weekly_hours: Number.parseInt(weeklyHours, 10) || 0,
              })
            }
            type="button"
          >
            {saving && <Loader2 aria-hidden="true" className="button-spinner" size={15} />}
            Save preferences
          </button>
          <button
            className="button button-outline"
            onClick={onClose}
            type="button"
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
