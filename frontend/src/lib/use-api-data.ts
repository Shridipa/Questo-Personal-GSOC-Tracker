"use client";

import { useCallback, useEffect, useState } from "react";

type ApiDataState<T> = {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  retry: () => void;
};

export function useApiData<T>(loadData: () => Promise<T>): ApiDataState<T> {
  const [result, setResult] = useState<{
    loadData: () => Promise<T>;
    attempt: number;
    data?: T;
    error?: string;
  }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void loadData()
      .then((data) => {
        if (active) setResult({ loadData, attempt, data });
      })
      .catch((reason: unknown) => {
        if (active) {
          setResult({
            loadData,
            attempt,
            error: reason instanceof Error ? reason.message : "An unexpected error occurred.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, loadData]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  const currentResult =
    result?.attempt === attempt &&
    (result.loadData === loadData || result.data !== undefined || result.error !== undefined)
      ? result
      : undefined;

  return {
    data: currentResult?.data,
    error: currentResult?.error,
    loading: currentResult === undefined,
    retry,
  };
}
