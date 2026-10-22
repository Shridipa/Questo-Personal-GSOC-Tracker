"use client";

import { CheckCircle2, Clock3, ExternalLink, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  completeQuest,
  fetchQuestWork,
  saveQuestWork,
  type CompletionResult,
  type QuestWork,
} from "@/lib/api";
import type { Quest } from "@/lib/quest-data";
import { getQuestChecklist, getQuestResources } from "@/lib/quest-resources";

function emptyWork(questId: string): QuestWork {
  return {
    quest_id: questId,
    status: "not_started",
    notes: "",
    evidence_url: null,
    checked_steps: [],
    updated_at_utc: null,
  };
}

export function QuestDetails({ quest, onClose }: { quest: Quest; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [savedWork, setSavedWork] = useState<QuestWork>();
  const [draft, setDraft] = useState<QuestWork>(() => emptyWork(quest.id));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [savePending, setSavePending] = useState(false);
  const [completePending, setCompletePending] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [completionError, setCompletionError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<string>();
  const [completionResult, setCompletionResult] = useState<CompletionResult>();
  const steps = useMemo(() => getQuestChecklist(quest.id), [quest.id]);
  const resources = getQuestResources(quest.id);
  const isDone = quest.status === "completed" || completionResult !== undefined;
  const allStepsChecked =
    steps.length > 0 && steps.every((step) => draft.checked_steps.includes(step.id));
  const isDirty =
    savedWork !== undefined &&
    (draft.notes !== savedWork.notes ||
      (draft.evidence_url || "") !== (savedWork.evidence_url || "") ||
      JSON.stringify([...draft.checked_steps].sort()) !==
        JSON.stringify([...savedWork.checked_steps].sort()));

  useEffect(() => {
    let active = true;
    closeButtonRef.current?.focus();
    void fetchQuestWork(quest.id)
      .then((loaded) => {
        if (!active) return;
        setSavedWork(loaded);
        setDraft(loaded);
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadError(
            reason instanceof Error ? reason.message : "Quest work could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quest.id, onClose]);

  async function retryLoadWork() {
    setLoading(true);
    setLoadError(undefined);
    try {
      const loaded = await fetchQuestWork(quest.id);
      setSavedWork(loaded);
      setDraft(loaded);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Quest work could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function getUpdate() {
    return {
      notes: draft.notes,
      evidence_url: draft.evidence_url?.trim() || null,
      checked_steps: draft.checked_steps,
    };
  }

  async function persistWork() {
    const saved = await saveQuestWork(quest.id, getUpdate());
    setSavedWork(saved);
    setDraft(saved);
    setSaveError(undefined);
    setSaveMessage("Your quest notes and checklist are saved.");
    return saved;
  }

  async function handleSave() {
    if (savePending || completePending || loading || loadError) return;
    setSavePending(true);
    setSaveError(undefined);
    setSaveMessage(undefined);
    try {
      await persistWork();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Quest progress could not be saved.");
    } finally {
      setSavePending(false);
    }
  }

  async function handleComplete() {
    if (isDone || !allStepsChecked || savePending || completePending || loading || loadError) {
      return;
    }
    setCompletePending(true);
    setSaveError(undefined);
    setCompletionError(undefined);
    setSaveMessage(undefined);
    try {
      await persistWork();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Quest progress could not be saved.");
      setCompletePending(false);
      return;
    }
    try {
      const result = await completeQuest(quest.id);
      setCompletionResult(result);
    } catch (reason) {
      setCompletionError(
        reason instanceof Error ? reason.message : "Quest completion could not be confirmed.",
      );
    } finally {
      setCompletePending(false);
    }
  }

  function toggleStep(stepId: string) {
    setDraft((current) => ({
      ...current,
      checked_steps: current.checked_steps.includes(stepId)
        ? current.checked_steps.filter((item) => item !== stepId)
        : [...current.checked_steps, stepId],
    }));
    setSaveMessage(undefined);
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="quest-dialog-title"
        aria-modal="true"
        className="quest-dialog quest-work-dialog"
        role="dialog"
      >
        <button
          aria-label="Close quest details"
          className="dialog-close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <X size={19} />
        </button>
        <span className={`quest-category ${quest.category.toLowerCase()}`}>{quest.category}</span>
        <h2 id="quest-dialog-title">{quest.title}</h2>
        <p>{quest.description}</p>
        <div className="dialog-meta">
          <span>
            <Clock3 size={16} /> {quest.minutes} min
          </span>
          <span>{quest.phase}</span>
        </div>

        {resources.length > 0 && (
          <section aria-labelledby="quest-resources-title" className="quest-resource-section">
            <h3 id="quest-resources-title">Recommended resources</h3>
            <ul>
              {resources.map((resource) => (
                <li key={resource.url}>
                  <a href={resource.url} rel="noopener noreferrer" target="_blank">
                    <span>
                      <strong>{resource.title}</strong>
                      <small>{resource.description}</small>
                      <small>
                        {resource.resourceType} · link checked {resource.verifiedAt}
                      </small>
                    </span>
                    <ExternalLink aria-hidden="true" size={16} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="quest-checklist-title" className="quest-work-section">
          <h3 id="quest-checklist-title">Definition of done</h3>
          {loading ? (
            <p role="status">Loading your saved quest progress…</p>
          ) : loadError ? (
            <div className="quest-work-error" role="alert">
              <p>{loadError}</p>
              <button
                className="button button-secondary"
                onClick={() => void retryLoadWork()}
                type="button"
              >
                Retry loading
              </button>
            </div>
          ) : (
            <>
              <fieldset
                className="quest-checklist"
                disabled={isDone || savePending || completePending}
              >
                <legend className="sr-only">Quest completion checklist</legend>
                {steps.map((step) => (
                  <label key={step.id}>
                    <input
                      checked={draft.checked_steps.includes(step.id)}
                      onChange={() => toggleStep(step.id)}
                      type="checkbox"
                    />
                    <span>{step.label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="quest-work-label" htmlFor="quest-work-notes">
                Notes and what you learned <span>(optional)</span>
              </label>
              <textarea
                disabled={isDone || savePending || completePending}
                id="quest-work-notes"
                maxLength={10_000}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, notes: event.target.value }));
                  setSaveMessage(undefined);
                }}
                placeholder="Capture commands, decisions, blockers, or learning notes…"
                rows={4}
                value={draft.notes}
              />
              <label className="quest-work-label" htmlFor="quest-evidence-url">
                Evidence link <span>(optional)</span>
              </label>
              <input
                disabled={isDone || savePending || completePending}
                id="quest-evidence-url"
                onChange={(event) => {
                  setDraft((current) => ({ ...current, evidence_url: event.target.value || null }));
                  setSaveMessage(undefined);
                }}
                placeholder="https://github.com/…"
                type="url"
                value={draft.evidence_url ?? ""}
              />
              <p className="quest-checklist-progress">
                {draft.checked_steps.length} of {steps.length} steps checked
              </p>
            </>
          )}
        </section>

        {saveMessage && (
          <p className="inline-confirmation" role="status">
            <CheckCircle2 size={16} /> {saveMessage}
          </p>
        )}
        {saveError && (
          <p className="completion-error" role="alert">
            Progress was not saved: {saveError}
          </p>
        )}
        {completionError && (
          <p className="completion-error" role="alert">
            Quest progress was saved, but completion was not confirmed: {completionError}
          </p>
        )}
        {completionResult && (
          <div className="completion-success" role="status">
            <CheckCircle2 size={18} />
            <span>
              {completionResult.already_completed
                ? `Already complete. The reward was recorded once; total XP is ${completionResult.total_xp}.`
                : `Quest complete! +${completionResult.completion.xp_awarded} XP awarded. Total: ${completionResult.total_xp} XP.`}{" "}
              Completion was confirmed by the server.
            </span>
          </div>
        )}
        {isDone && !completionResult && (
          <div className="already-done">
            <CheckCircle2 size={18} /> Quest completion saved
          </div>
        )}
        {!isDone && !loading && !loadError && (
          <div className="quest-work-actions">
            <button
              className="button button-secondary"
              disabled={
                savePending || completePending || (savedWork?.status === "in_progress" && !isDirty)
              }
              onClick={() => void handleSave()}
              type="button"
            >
              <Save size={16} />
              {savePending
                ? "Saving…"
                : savedWork?.status === "in_progress"
                  ? "Save progress"
                  : "Start quest"}
            </button>
            <button
              className="button button-primary"
              disabled={!allStepsChecked || savePending || completePending}
              onClick={() => void handleComplete()}
              type="button"
            >
              <CheckCircle2 size={18} />
              {completePending ? "Confirming completion…" : "Complete quest"}
            </button>
          </div>
        )}
        <a className="quest-next-action" href="/quests">
          {completionResult
            ? "Choose your next quest"
            : "Open the quest board to choose another task"}
        </a>
      </section>
    </div>
  );
}
