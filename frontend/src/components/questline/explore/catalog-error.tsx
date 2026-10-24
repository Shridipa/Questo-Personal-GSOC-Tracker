"use client";

import { RefreshCw } from "lucide-react";

export function ExploreCatalogError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="explore-error-card" role="alert">
      <p>
        Questo couldn&apos;t load this part of the catalog just now.
        <small>{message}</small>
      </p>
      <button className="button button-outline" disabled={retrying} onClick={onRetry} type="button">
        <RefreshCw aria-hidden="true" size={15} />
        Try again
      </button>
    </div>
  );
}
