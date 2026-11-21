"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { askSignals } from "@/lib/api";
import type { AskMessage } from "@/lib/types";

export function useAskSignals(companyId: number, initialSuggested: string[] = []) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [apiSuggested, setApiSuggested] = useState<string[] | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ question, quote }: { question: string; quote?: string | null }) =>
      askSignals(companyId, question, quote),
    onMutate: ({ question, quote }) => {
      setError(null);
      const userMsg: AskMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: question,
        quotedText: quote ?? null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setQuotedText(null);
    },
    onSuccess: (res) => {
      const hasCitations = Boolean(res.citations && res.citations.length > 0);
      const hasAnswer = Boolean(res.answer && res.answer.trim().length > 0);
      const noEvidence = !hasCitations && !hasAnswer;
      const assistantMsg: AskMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: noEvidence
          ? "No supporting evidence found in your collected signals for that question."
          : res.answer,
        citations: res.citations ?? [],
        answerCard: hasCitations ? (res.answerCard ?? null) : null,
        recommendation: hasCitations ? (res.recommendation ?? null) : null,
        noEvidence,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (res.suggestedQuestions && res.suggestedQuestions.length > 0) {
        setApiSuggested(res.suggestedQuestions);
      }
    },
    onError: (err: Error) => {
      setError(err.message || "Ask AI request failed.");
    },
  });

  const sendQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || mutation.isPending) return;
    mutation.mutate({ question: trimmed, quote: quotedText });
  };

  return {
    messages,
    suggestedQuestions: apiSuggested ?? initialSuggested,
    quotedText,
    setQuotedText,
    isPending: mutation.isPending,
    error,
    sendQuestion,
    clearMessages: () => {
      setMessages([]);
      setError(null);
    },
  };
}
