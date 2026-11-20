"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Pencil, Play, Send, SkipForward, X } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { InterviewState } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Notice, Stat, inputClass } from "@/components/ui";

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [state, setState] = useState<InterviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await api.getInterview(companyId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the interview.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (Number.isFinite(companyId)) void load();
  }, [companyId, load]);

  async function start() {
    setBusy("start");
    setError(null);
    try {
      setState(await api.startInterview(companyId));
      setNotice(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start the interview.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(skip: boolean) {
    if (!state || state.current_idx === null) return;
    setBusy(skip ? "skip" : "answer");
    setError(null);
    try {
      const next = await api.answer(companyId, skip ? { idx: state.current_idx, skip: true } : { idx: state.current_idx, answer });
      setState(next);
      setAnswer("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the answer.");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(qaId: number) {
    setBusy(`edit-${qaId}`);
    setError(null);
    try {
      setState(await api.editAnswer(qaId, editText));
      setEditingId(null);
      setEditText("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not edit the answer.");
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy("complete");
    setError(null);
    try {
      await api.completeInterview(companyId);
      setState(await api.getInterview(companyId));
      setNotice("Interview complete. Answers are merged into the profile as founder intelligence.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not complete the interview.");
    } finally {
      setBusy(null);
    }
  }

  const current = state?.questions.find((question) => question.idx === state.current_idx) ?? null;
  const progress = state ? Math.round(((state.answered + state.skipped) / Math.max(state.questions.length, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {loading ? <Loading label="Loading interview…" /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {!loading && state && !state.started ? (
        <Card>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Adaptive founder interview</h2>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
            Ten company-specific questions generated from the stored profile. A follow-up is asked only when an answer is
            vague (maximum three). Every answer commits to SQLite immediately so a restart loses nothing.
          </p>
          <div className="mt-5">
            <Button onClick={start} disabled={busy === "start"}>
              <Play size={15} /> {busy === "start" ? "Generating questions…" : "Start interview"}
            </Button>
          </div>
        </Card>
      ) : null}

      {state && state.started ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Questions" value={state.questions.length} />
            <Stat label="Answered" value={state.answered} />
            <Stat label="Skipped" value={state.skipped} />
            <Stat label="Follow-ups" value={`${state.followups_used}/${state.max_followups}`} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Interview progress</span>
              <span className="tabular font-medium text-ink">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {state.completed ? (
            <Card>
              <div className="flex items-center gap-2.5 text-success">
                <CheckCircle2 size={18} />
                <span className="text-base font-semibold">Interview completed</span>
              </div>
              <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted">
                Answers are stored verbatim in the profile under <code className="font-mono text-ink/90">intelligence.founder_answers</code> and
                guide signal relevance and the Monday Morning Brief.
              </p>
            </Card>
          ) : current ? (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <span className="tabular text-xs font-medium text-muted">
                  Question {state.answered + state.skipped + 1} of {state.questions.length}
                </span>
                {current.is_followup ? <Badge tone="info">Follow-up</Badge> : null}
              </div>
              <h3 className="mt-3 max-w-[54ch] text-lg font-medium leading-snug text-ink">{current.question}</h3>
              <textarea
                className={`${inputClass} mt-4 h-28`}
                placeholder="Answer in your own words — concrete specifics sharpen downstream analysis."
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void submit(false)} disabled={busy !== null || answer.trim().length === 0}>
                  <Send size={15} /> {busy === "answer" ? "Saving…" : "Save answer"}
                </Button>
                <Button variant="ghost" onClick={() => void submit(true)} disabled={busy !== null}>
                  <SkipForward size={15} /> Skip question
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-ink">Every question has been answered or skipped.</p>
              <div className="mt-4">
                <Button variant="success" onClick={complete} disabled={busy === "complete" || state.completed}>
                  <CheckCircle2 size={15} /> {busy === "complete" ? "Completing…" : "Complete interview"}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="mb-4 text-base font-semibold tracking-[-0.015em] text-ink">Transcript</h3>
            <ul className="space-y-4">
              {state.questions.map((item) => (
                <li
                  key={item.id}
                  className="border-l-2 border-[rgba(233,237,243,0.12)] pl-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">
                      <span className="tabular text-muted">{item.idx + 1}.</span> {item.question}
                    </p>
                    {item.is_followup ? <Badge tone="info">Follow-up</Badge> : null}
                  </div>
                  {item.skipped ? (
                    <p className="mt-1.5 text-xs font-medium text-warning">Skipped</p>
                  ) : editingId === item.id ? (
                    <div className="mt-2.5 space-y-2">
                      <textarea
                        className={`${inputClass} h-20`}
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => void saveEdit(item.id)} disabled={busy !== null}>
                          Save edit
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                          <X size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : item.answer ? (
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 text-sm text-muted">
                      <span>{item.answer}</span>
                      <button
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditText(item.answer ?? "");
                        }}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted/70">Awaiting answer</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {!loading && state && state.started === false && !error ? (
        <Empty title="Not started" hint="Start the interview to generate ten questions from the profile." />
      ) : null}
    </div>
  );
}
