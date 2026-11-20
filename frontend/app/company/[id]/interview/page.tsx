"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Pencil, Play, Send, SkipForward, X } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { InterviewState } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Stat, inputClass } from "@/components/ui";

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
      {notice ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>
      ) : null}

      {!loading && state && !state.started ? (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Adaptive founder interview</h2>
          <p className="mt-2 text-sm text-slate-400">
            Ten company-specific questions generated from the stored profile. A follow-up is asked only when an answer is
            vague (maximum three). Answers are saved immediately, so a server restart loses nothing.
          </p>
          <div className="mt-4">
            <Button onClick={start} disabled={busy === "start"}>
              <Play size={16} /> {busy === "start" ? "Generating questions…" : "Start interview"}
            </Button>
          </div>
        </Card>
      ) : null}

      {state && state.started ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Questions" value={state.questions.length} />
            <Stat label="Answered" value={state.answered} />
            <Stat label="Skipped" value={state.skipped} />
            <Stat label="Follow-ups" value={`${state.followups_used}/${state.max_followups}`} />
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>

          {state.completed ? (
            <Card>
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 size={18} /> <span className="text-sm font-medium">Interview completed</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Answers are stored verbatim in the profile under <code>intelligence.founder_answers</code> and feed
                analysis relevance and the brief.
              </p>
            </Card>
          ) : current ? (
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Question {state.answered + state.skipped + 1} of {state.questions.length}
                </p>
                {current.is_followup ? <Badge tone="info">follow-up</Badge> : null}
              </div>
              <h3 className="mt-2 text-lg font-medium text-slate-100">{current.question}</h3>
              <textarea
                className={`${inputClass} mt-4 h-28`}
                placeholder="Answer in your own words — specifics make the analysis sharper."
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void submit(false)} disabled={busy !== null || answer.trim().length === 0}>
                  <Send size={16} /> {busy === "answer" ? "Saving…" : "Save answer"}
                </Button>
                <Button variant="ghost" onClick={() => void submit(true)} disabled={busy !== null}>
                  <SkipForward size={16} /> Skip
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-300">Every question has been answered or skipped.</p>
              <div className="mt-3">
                <Button variant="success" onClick={complete} disabled={busy === "complete" || state.completed}>
                  <CheckCircle2 size={16} /> {busy === "complete" ? "Completing…" : "Complete interview"}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Transcript</h3>
            <ul className="space-y-4">
              {state.questions.map((item) => (
                <li key={item.id} className="border-l-2 border-white/10 pl-3">
                  <p className="text-sm text-slate-200">
                    {item.idx + 1}. {item.question} {item.is_followup ? <Badge tone="info">follow-up</Badge> : null}
                  </p>
                  {item.skipped ? (
                    <p className="mt-1 text-xs text-warning">skipped</p>
                  ) : editingId === item.id ? (
                    <div className="mt-2">
                      <textarea
                        className={`${inputClass} h-20`}
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button onClick={() => void saveEdit(item.id)} disabled={busy !== null}>
                          Save
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                          <X size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : item.answer ? (
                    <p className="mt-1 text-sm text-slate-400">
                      {item.answer}{" "}
                      <button
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditText(item.answer ?? "");
                        }}
                      >
                        <Pencil size={12} /> edit
                      </button>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">awaiting answer</p>
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
