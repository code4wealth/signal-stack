"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  completeInterview,
  editAnswer,
  getInterview,
  resetInterview,
  skipQuestion,
  startInterview,
  submitAnswer,
} from "@/lib/api";
import { buildDevMockInterview } from "@/lib/company-adapter";
import type { Interview } from "@/lib/types";

export function useInterview(companyId: number, enabled = true) {
  const queryClient = useQueryClient();
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newlyLearnedId, setNewlyLearnedId] = useState<string | null>(null);

  const queryKey = ["interview", companyId] as const;

  const interviewQuery = useQuery<Interview>({
    queryKey,
    queryFn: async () => {
      if (useMocks) return buildDevMockInterview(companyId);
      return getInterview(companyId);
    },
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    retry: 1,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return buildDevMockInterview(companyId);
      return startInterview(companyId);
    },
    onSuccess: (next) => {
      setSubmitError(null);
      queryClient.setQueryData(queryKey, next);
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Could not start the interview.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (body: { turnIndex: number; text: string; quotedText?: string }) => {
      setSubmitError(null);
      setThinkingStatus("Reading your answer...");
      if (useMocks) {
        return buildDevMockInterview(companyId);
      }
      return submitAnswer(companyId, body, (statusText) => {
        setThinkingStatus(statusText);
      });
    },
    onSuccess: (next, vars) => {
      setThinkingStatus(null);
      setSubmitError(null);
      queryClient.setQueryData(queryKey, next);
      const learnedItem = next.learned.find((item) => item.sourceTurnIndex === vars.turnIndex);
      if (learnedItem) {
        setNewlyLearnedId(learnedItem.id);
      }
    },
    onError: (err) => {
      setThinkingStatus(null);
      setSubmitError(err instanceof ApiError ? err.message : "Could not save your answer.");
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (turnIndex: number) => {
      setSubmitError(null);
      setThinkingStatus("Choosing the next question...");
      if (useMocks) {
        return buildDevMockInterview(companyId);
      }
      return skipQuestion(companyId, turnIndex);
    },
    onSuccess: (next, turnIndex) => {
      setThinkingStatus(null);
      setSubmitError(null);
      queryClient.setQueryData(queryKey, next);
      const learnedItem = next.learned.find((item) => item.sourceTurnIndex === turnIndex);
      if (learnedItem) {
        setNewlyLearnedId(learnedItem.id);
      }
    },
    onError: (err) => {
      setThinkingStatus(null);
      setSubmitError(err instanceof ApiError ? err.message : "Could not skip this question.");
    },
  });

  const editMutation = useMutation({
    mutationFn: async (vars: { turnIndex: number; text: string }) => {
      if (useMocks) return buildDevMockInterview(companyId);
      return editAnswer(companyId, vars.turnIndex, vars.text);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Interview>(queryKey);
      if (previous) {
        const now = new Date().toISOString();
        const optimistic: Interview = {
          ...previous,
          turns: previous.turns.map((t) =>
            t.index === vars.turnIndex
              ? {
                  ...t,
                  answer: {
                    text: vars.text,
                    skipped: false,
                    quotedText: t.answer?.quotedText,
                    answeredAt: t.answer?.answeredAt ?? now,
                    editedAt: now,
                  },
                }
              : t,
          ),
          learned: previous.learned.map((l) =>
            l.sourceTurnIndex === vars.turnIndex
              ? { ...l, text: vars.text, skipped: false }
              : l,
          ),
        };
        queryClient.setQueryData(queryKey, optimistic);
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not update answer — rolled back.",
      );
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      setNotice("Later questions may adapt to this change.");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return { company_id: companyId, intelligence: {} };
      return completeInterview(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Could not complete interview.");
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return buildDevMockInterview(companyId);
      return resetInterview(companyId);
    },
    onSuccess: (next) => {
      setSubmitError(null);
      setNotice("Interview restarted. You can generate a fresh set of questions.");
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Could not restart interview.");
    },
  });

  return {
    interview: interviewQuery.data ?? null,
    isLoading: interviewQuery.isLoading,
    isError: interviewQuery.isError,
    error: interviewQuery.error,
    refetch: interviewQuery.refetch,
    thinkingStatus,
    submitError,
    clearSubmitError: () => setSubmitError(null),
    notice,
    clearNotice: () => setNotice(null),
    newlyLearnedId,
    start: () => startMutation.mutateAsync(),
    isStarting: startMutation.isPending,
    submit: (body: { turnIndex: number; text: string; quotedText?: string }) =>
      submitMutation.mutateAsync(body),
    isSubmitting: submitMutation.isPending,
    skip: (turnIndex: number) => skipMutation.mutateAsync(turnIndex),
    isSkipping: skipMutation.isPending,
    edit: (turnIndex: number, text: string) => editMutation.mutateAsync({ turnIndex, text }),
    isEditing: editMutation.isPending,
    complete: () => completeMutation.mutateAsync(),
    isCompleting: completeMutation.isPending,
    reset: () => resetMutation.mutateAsync(),
    isResetting: resetMutation.isPending,
  };
}
