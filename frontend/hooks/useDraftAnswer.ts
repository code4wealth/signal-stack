"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(companyId: number, turnIndex: number): string {
  return `signalstack:interview-draft:${companyId}:${turnIndex}`;
}

export function useDraftAnswer(companyId: number, turnIndex: number) {
  const [draft, setDraftState] = useState<string>("");

  useEffect(() => {
    if (!Number.isFinite(companyId) || turnIndex < 0) return;
    try {
      const saved = window.localStorage.getItem(storageKey(companyId, turnIndex));
      setDraftState(saved ?? "");
    } catch {
      setDraftState("");
    }
  }, [companyId, turnIndex]);

  const setDraft = useCallback(
    (nextValue: string) => {
      setDraftState(nextValue);
      try {
        const key = storageKey(companyId, turnIndex);
        if (nextValue) {
          window.localStorage.setItem(key, nextValue);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch {
        /* ignore storage quota errors */
      }
    },
    [companyId, turnIndex],
  );

  const clearDraft = useCallback(() => {
    setDraftState("");
    try {
      window.localStorage.removeItem(storageKey(companyId, turnIndex));
    } catch {
      /* ignore */
    }
  }, [companyId, turnIndex]);

  return { draft, setDraft, clearDraft };
}
