"use client";

import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  completeDeadline,
  createDeadline,
  deleteDeadline,
  fetchDeadlines,
  updateDeadline,
  type Deadline,
  type DeadlineFields,
} from "@/lib/api";
import { useApiData } from "@/lib/use-api-data";
import {
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  FilterChips,
  InlineNotice,
  LoadingSkeletons,
  MetricTile,
  PageHero,
  SafeExternalLink,
  StatusBadge,
  isSafeHttpUrl,
} from "./shared";

type ViewKey = "upcoming" | "all" | "overdue" | "completed";

type DeadlineDraft = DeadlineFields & { status: "pending" | "completed" };

const emptyDraft: DeadlineDraft = {
  title: "",
  description: "",
  due_date: "",
  due_time: null,
  category: "Personal",
  url: null,
  status: "pending",
};

function draftFrom(deadline: Deadline): DeadlineDraft {
  return {
    title: deadline.title,
    description: deadline.description,
    due_date: deadline.due_date,
    due_time: deadline.due_time?.slice(0, 5) ?? null,
    category: deadline.category,
    url: deadline.url,
    status: deadline.status,
  };
}

/** Human-readable countdown built from the deadline's own date and time. */
function countdownText(deadline: Deadline): string {
  const timePart = deadline.due_time ? `T${deadline.due_time.slice(0, 5)}:00` : "T23:59:59";
  const target = new Date(`${deadline.due_date}${timePart}`);
  if (Number.isNaN(target.getTime())) return "";
  const diffMs = target.getTime() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (deadline.status === "completed") return "Completed";
  if (diffMs < 0) {
    const days = Math.ceil(Math.abs(diffMs) / dayMs);
    return days === 0 ? "Passed earlier today" : `${days} day${days === 1 ? "" : "s"} overdue`;
  }
  const days = Math.floor(diffMs / dayMs);
  if (days >= 2) return `in ${days} days`;
  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
    return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return "tomorrow";
}

function formatFullDate(deadline: Deadline): string {
  const date = new Date(`${deadline.due_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return deadline.due_date;
  const base = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return deadline.due_time ? `${base} · ${deadline.due_time.slice(0, 5)}` : base;
}

function urgencyTone(deadline: Deadline): "green" | "amber" | "red" | "neutral" {
  if (deadline.classification === "completed") return "neutral";
  if (deadline.classification === "overdue") return "red";
  const days = Number(countdownText(deadline).match(/in (\d+) days/)?.[1] ?? 99);
  return days <= 3 ? "amber" : "green";
}

function urgencyLabel(deadline: Deadline): string {
  if (deadline.classification === "completed") return "Completed";
  if (deadline.classification === "overdue") return "Overdue";
  const text = countdownText(deadline);
  if (text === "tomorrow" || text === "in about 1 hour" || text.startsWith("in about")) {
    return "Due soon";
  }
  return "Upcoming";
}

export function DeadlinesView() {
  const deadlinesState = useApiData(fetchDeadlines);
  const [view, setView] = useState<ViewKey>("upcoming");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<DeadlineDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    due_date?: string;
    url?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmTarget, setConfirmTarget] = useState<Deadline | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const deadlines = useMemo(() => deadlinesState.data ?? [], [deadlinesState.data]);
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const deadline of deadlines) {
      if (deadline.category && !seen.includes(deadline.category)) seen.push(deadline.category);
    }
    return seen;
  }, [deadlines]);

  if (deadlinesState.loading) return <LoadingSkeletons label="Loading deadlines" />;
  if (deadlinesState.error) {
    return <ErrorPanel message={deadlinesState.error} retry={deadlinesState.retry} />;
  }

  const upcoming = deadlines.filter((deadline) => deadline.classification === "upcoming");
  const overdue = deadlines.filter((deadline) => deadline.classification === "overdue");
  const completed = deadlines.filter((deadline) => deadline.classification === "completed");
  const nextDeadline = upcoming[0] ?? overdue[0] ?? null;

  const normalizedSearch = search.trim().toLowerCase();
  const visible = deadlines.filter((deadline) => {
    if (view === "upcoming" && deadline.classification !== "upcoming") return false;
    if (view === "overdue" && deadline.classification !== "overdue") return false;
    if (view === "completed" && deadline.classification !== "completed") return false;
    if (category !== "all" && deadline.category !== category) return false;
    if (
      normalizedSearch &&
      !deadline.title.toLowerCase().includes(normalizedSearch) &&
      !deadline.description.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });

  function openCreate() {
    setEditingId(undefined);
    setDraft(emptyDraft);
    setFieldErrors({});
    setFormError(undefined);
    setFormOpen(true);
  }

  function openEdit(deadline: Deadline) {
    setEditingId(deadline.id);
    setDraft(draftFrom(deadline));
    setFieldErrors({});
    setFormError(undefined);
    setFormOpen(true);
  }

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!draft.title.trim()) errors.title = "Give this deadline a short, clear title.";
    if (!draft.due_date) errors.due_date = "Pick the date this is due.";
    if (draft.url && !isSafeHttpUrl(draft.url)) {
      errors.url = "Links must start with http:// or https://.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setFormError(undefined);
    const values: DeadlineFields & { status: "pending" | "completed" } = {
      ...draft,
      title: draft.title.trim(),
      due_time: draft.due_time || null,
      url: draft.url?.trim() || null,
    };
    try {
      if (editingId) {
        await updateDeadline(editingId, values);
        setNotice(`"${values.title}" was updated.`);
      } else {
        await createDeadline(values);
        setNotice(`"${values.title}" was added to your deadlines.`);
      }
      setFormOpen(false);
      setEditingId(undefined);
      setDraft(emptyDraft);
      deadlinesState.retry();
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "Your changes were not saved. Your entries are still here — try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(deadline: Deadline) {
    setNotice(undefined);
    setFormError(undefined);
    try {
      await completeDeadline(deadline.id);
      setNotice(`"${deadline.title}" marked complete. Nice work.`);
      deadlinesState.retry();
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "Could not mark this deadline complete.",
      );
    }
  }

  async function confirmDelete() {
    if (!confirmTarget || deletePending) return;
    setDeletePending(true);
    try {
      await deleteDeadline(confirmTarget.id);
      setNotice(`"${confirmTarget.title}" was deleted.`);
      if (editingId === confirmTarget.id) setFormOpen(false);
      setConfirmTarget(null);
      deadlinesState.retry();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not delete this deadline.");
      setConfirmTarget(null);
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <div className="page-stack qo-page">
      <PageHero
        actions={
          <button className="qo-btn qo-btn-primary qo-btn-lg" onClick={openCreate} type="button">
            <Plus aria-hidden="true" size={18} /> Add deadline
          </button>
        }
        eyebrow="DATES TO KEEP IN VIEW"
        icon={<CalendarDays size={28} />}
        subtitle="Personal targets you set yourself — kept separate from official program dates."
        title="Your deadlines"
      >
        {nextDeadline ? (
          <div className={`qo-next-deadline qo-next-deadline-${urgencyTone(nextDeadline)}`}>
            <div className="qo-next-deadline-copy">
              <span className="qo-next-deadline-label">
                <Sparkles aria-hidden="true" size={14} />
                {nextDeadline.classification === "overdue" ? "Most urgent right now" : "Next up"}
              </span>
              <h3>{nextDeadline.title}</h3>
              <p>
                {formatFullDate(nextDeadline)} · <strong>{countdownText(nextDeadline)}</strong>
              </p>
            </div>
            <div className="qo-next-deadline-actions">
              <StatusBadge tone={urgencyTone(nextDeadline)}>
                {urgencyLabel(nextDeadline)}
              </StatusBadge>
              <button
                className="qo-btn qo-btn-secondary"
                onClick={() => openEdit(nextDeadline)}
                type="button"
              >
                <Pencil aria-hidden="true" size={15} /> View details
              </button>
            </div>
          </div>
        ) : (
          <p className="qo-hero-empty-note">
            {deadlines.length > 0
              ? "Everything on your list is complete. Add a new target whenever you're ready."
              : "No deadlines yet — add your first target to give your week a anchor point."}
          </p>
        )}
      </PageHero>

      <section aria-label="Deadline summary" className="qo-metric-grid">
        <MetricTile
          hint="Personal targets ahead of you"
          icon={<Clock3 size={19} />}
          label="Upcoming"
          tone="blue"
          value={upcoming.length}
        />
        <MetricTile
          hint={overdue.length > 0 ? "Worth reviewing today" : "Nothing past due — well done"}
          icon={<CalendarDays size={19} />}
          label="Overdue"
          tone={overdue.length > 0 ? "amber" : "green"}
          value={overdue.length}
        />
        <MetricTile
          hint="Completed and kept for your records"
          icon={<Trophy size={19} />}
          label="Completed"
          tone="green"
          value={completed.length}
        />
        <MetricTile
          hint="All deadlines saved by the API"
          icon={<CalendarCheck2 size={19} />}
          label="Total"
          value={deadlines.length}
        />
      </section>

      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}
      {formError && !formOpen && <InlineNotice tone="error">{formError}</InlineNotice>}

      <section aria-label="Filter deadlines" className="qo-toolbar">
        <FilterChips
          legend="Filter deadlines by view"
          onSelect={(id) => setView(id as ViewKey)}
          options={[
            { id: "upcoming", label: "Upcoming", count: upcoming.length },
            { id: "all", label: "All deadlines", count: deadlines.length },
            { id: "overdue", label: "Overdue", count: overdue.length },
            { id: "completed", label: "Completed", count: completed.length },
          ]}
          selected={view}
        />
        <div className="qo-toolbar-row">
          <label className="qo-search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search deadlines by title or description</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search deadlines…"
              type="search"
              value={search}
            />
          </label>
          {categories.length > 1 && (
            <label className="qo-select-label">
              <span>Category</span>
              <select onChange={(event) => setCategory(event.target.value)} value={category}>
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {deadlines.length === 0 ? (
        <EmptyState
          action={
            <button className="qo-btn qo-btn-primary" onClick={openCreate} type="button">
              <Plus aria-hidden="true" size={17} /> Add your first deadline
            </button>
          }
          icon={<Compass size={28} />}
          message="Deadlines are personal planning dates you choose — like an application target or a talk you want to submit to. Add one and it will show up here with a countdown."
          title="Nothing on your calendar yet"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          action={
            <button
              className="qo-btn qo-btn-secondary"
              onClick={() => {
                setView("all");
                setSearch("");
                setCategory("all");
              }}
              type="button"
            >
              Show all deadlines
            </button>
          }
          icon={<CalendarCheck2 size={28} />}
          message="No deadlines match this view right now."
          title="Nothing to show here"
        />
      ) : (
        <ul className="qo-deadline-list">
          {visible.map((deadline) => {
            const tone = urgencyTone(deadline);
            return (
              <li className={`qo-deadline-card qo-deadline-${tone}`} key={deadline.id}>
                <div className="qo-deadline-date">
                  <span aria-hidden="true" className="qo-deadline-month">
                    {new Date(`${deadline.due_date}T00:00:00`).toLocaleDateString("en", {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <strong>
                    {new Date(`${deadline.due_date}T00:00:00`).toLocaleDateString("en", {
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </strong>
                  {deadline.due_time && <small>{deadline.due_time.slice(0, 5)}</small>}
                </div>
                <div className="qo-deadline-body">
                  <div className="qo-deadline-headline">
                    <h3>{deadline.title}</h3>
                    <StatusBadge tone={tone}>{urgencyLabel(deadline)}</StatusBadge>
                  </div>
                  <p className="qo-deadline-when">
                    <Clock3 aria-hidden="true" size={14} /> {formatFullDate(deadline)} ·{" "}
                    <strong>{countdownText(deadline)}</strong>
                  </p>
                  {deadline.category && (
                    <span className="qo-deadline-category">{deadline.category}</span>
                  )}
                  {deadline.description && (
                    <p className="qo-deadline-notes">{deadline.description}</p>
                  )}
                  {deadline.url && <SafeExternalLink label="Open source link" url={deadline.url} />}
                </div>
                <div className="qo-deadline-actions">
                  {deadline.status === "pending" && (
                    <button
                      aria-label={`Mark ${deadline.title} complete`}
                      className="qo-icon-btn qo-icon-btn-success"
                      onClick={() => void markComplete(deadline)}
                      type="button"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  )}
                  <button
                    aria-label={`Edit ${deadline.title}`}
                    className="qo-icon-btn"
                    onClick={() => openEdit(deadline)}
                    type="button"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    aria-label={`Delete ${deadline.title}`}
                    className="qo-icon-btn qo-icon-btn-danger"
                    onClick={() => setConfirmTarget(deadline)}
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="gentle-note">
        <ExternalLink aria-hidden="true" size={17} />
        <p>
          <strong>Honest by design.</strong> Countdowns use your own dates and your saved timezone.
          Official GSoC dates are never presented here unless you add them yourself.
        </p>
      </div>

      {formOpen && (
        <div
          className="dialog-backdrop qo-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setFormOpen(false);
          }}
        >
          <section
            aria-labelledby="deadline-form-title"
            aria-modal="true"
            className="qo-form-dialog"
            role="dialog"
          >
            <h2 id="deadline-form-title">{editingId ? "Edit deadline" : "Add a deadline"}</h2>
            <p className="qo-form-dialog-sub">
              Personal planning dates only — keep official sources official.
            </p>
            <form onSubmit={(event) => void saveDeadline(event)}>
              <label className="qo-field">
                <span>Title</span>
                <input
                  aria-invalid={Boolean(fieldErrors.title)}
                  autoComplete="off"
                  maxLength={200}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="e.g. Submit GSoC proposal draft"
                  required
                  value={draft.title}
                />
                {fieldErrors.title && (
                  <small className="qo-field-error" role="alert">
                    {fieldErrors.title}
                  </small>
                )}
              </label>
              <div className="qo-field-row">
                <label className="qo-field">
                  <span>Due date</span>
                  <input
                    aria-invalid={Boolean(fieldErrors.due_date)}
                    onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                    required
                    type="date"
                    value={draft.due_date}
                  />
                  {fieldErrors.due_date && (
                    <small className="qo-field-error" role="alert">
                      {fieldErrors.due_date}
                    </small>
                  )}
                </label>
                <label className="qo-field">
                  <span>Due time (optional)</span>
                  <input
                    onChange={(event) =>
                      setDraft({ ...draft, due_time: event.target.value || null })
                    }
                    type="time"
                    value={draft.due_time ?? ""}
                  />
                </label>
              </div>
              <label className="qo-field">
                <span>Category</span>
                <input
                  autoComplete="off"
                  maxLength={80}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  placeholder="e.g. Proposal, Mentorship, Talk"
                  required
                  value={draft.category}
                />
              </label>
              <label className="qo-field">
                <span>Notes (optional)</span>
                <textarea
                  maxLength={5000}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="What is this deadline about?"
                  rows={3}
                  value={draft.description}
                />
              </label>
              <label className="qo-field">
                <span>Link (optional)</span>
                <input
                  aria-invalid={Boolean(fieldErrors.url)}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value || null })}
                  placeholder="https://…"
                  type="url"
                  value={draft.url ?? ""}
                />
                {fieldErrors.url && (
                  <small className="qo-field-error" role="alert">
                    {fieldErrors.url}
                  </small>
                )}
              </label>
              {formError && <InlineNotice tone="error">{formError}</InlineNotice>}
              <div className="qo-form-actions">
                <button
                  className="qo-btn qo-btn-ghost"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="qo-btn qo-btn-primary" disabled={saving} type="submit">
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add deadline"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <ConfirmDialog
        busy={deletePending}
        message={`"${confirmTarget?.title}" will be permanently removed. This can't be undone.`}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => void confirmDelete()}
        open={confirmTarget !== null}
        title="Delete this deadline?"
      />
    </div>
  );
}
