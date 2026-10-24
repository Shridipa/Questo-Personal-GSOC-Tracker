/**
 * Format ISO timestamps into human-readable relative time or YYYY-MM-DD.
 */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const diffMinutes = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} d ago`;
  return parsed.toISOString().slice(0, 10);
}
