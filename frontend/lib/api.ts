// Thin typed client around the real FastAPI backend.
// Every call goes to a relative /api path proxied by Next unless NEXT_PUBLIC_API_URL is set.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class SourceValidationError extends ApiError {
  validation: import("./types").AddSourceValidation | null;
  constructor(
    message: string,
    status: number,
    validation: import("./types").AddSourceValidation | null,
  ) {
    super(message, status);
    this.name = "SourceValidationError";
    this.validation = validation;
  }
}

export type JobKind = "research" | "discover" | "crawl" | "analyse" | "competitors";

export type ResearchStatus =
  | "idle"
  | "submitting"
  | "reading_website"
  | "identifying_services"
  | "finding_competitors"
  | "building_profile"
  | "completed"
  | "error";

export type JobStatusResponse<T = Record<string, unknown>> = {
  job_id: number;
  company_id: number;
  job: JobKind;
  status: "running" | "ok" | "error";
  stage?: ResearchStatus | string;
  at: string;
  started_at?: string | null;
  finished_at?: string | null;
  result?: T | null;
  error?: string | null;
  error_type?: string | null;
  status_code?: number | null;
};

// Empty string = same-origin relative calls, proxied by Next's rewrite (default local dev).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const BACKEND_DISPLAY_URL = API_BASE || "http://127.0.0.1:8000";
const START_BACKEND_CMD = "cd backend && uvicorn main:app --host 127.0.0.1 --port 8000";
const JOB_POLL_INTERVAL_MS = 2000;
export const JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

type ProbeResult = {
  reachable: boolean;
  summary: string;
};

async function probeBackendHealth(): Promise<ProbeResult> {
  const probeUrl = `${API_BASE}/api/health`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(probeUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { reachable: false, summary: `GET ${probeUrl} returned HTTP ${res.status}` };
    }
    try {
      const data = (await res.json()) as {
        status?: string;
        database?: { ok?: boolean; dialect?: string };
        llm?: { api_key_configured?: boolean };
      };
      const dbPart = data.database ? `db=${data.database.ok ? "ok" : "error"}` : "db=unknown";
      const llmPart = data.llm ? `llm=${data.llm.api_key_configured ? "configured" : "no-key"}` : "";
      return {
        reachable: true,
        summary: `GET ${probeUrl} -> HTTP ${res.status} (${[data.status ?? "ok", dbPart, llmPart].filter(Boolean).join(", ")})`,
      };
    } catch {
      return { reachable: true, summary: `GET ${probeUrl} -> HTTP ${res.status}` };
    }
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "network error";
    return { reachable: false, summary: `GET ${probeUrl} failed (${reason})` };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const targetUrl = `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Backend not reachable. Check that the API is running.", 0);
  }

  if (!response.ok) {
    let detail = `${method} ${path} failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    let parsed = false;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body) {
        const raw = (body as { detail: unknown }).detail;
        detail = typeof raw === "string" ? raw : JSON.stringify(raw);
        parsed = true;
      }
    } catch {
      // non-JSON or empty error body — usually the dev proxy, not FastAPI
    }
    if (!parsed && response.status >= 500) {
      const probe =
        path === "/api/health"
          ? { reachable: false, summary: `GET ${targetUrl} returned HTTP ${response.status}` }
          : await probeBackendHealth();
      if (!probe.reachable) {
        detail = `Backend not reachable on ${BACKEND_DISPLAY_URL} during ${method} ${path} (HTTP ${response.status}; probe: ${probe.summary}). Start it with: ${START_BACKEND_CMD}`;
      } else {
        detail = `Backend up on ${BACKEND_DISPLAY_URL} (${probe.summary}), but ${method} ${path} failed (HTTP ${response.status} with no error body); see the backend terminal.`;
      }
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob<T>(
  jobId: number,
  kind: JobKind,
  onPoll?: (status: JobStatusResponse<T>) => void,
  options?: { maxWaitMs?: number; pollIntervalMs?: number },
): Promise<T> {
  const maxWaitMs = options?.maxWaitMs ?? JOB_POLL_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? JOB_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  while (true) {
    const remaining = maxWaitMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      throw new ApiError(
        `${kind} job #${jobId} did not finish within ${Math.round(maxWaitMs / 1000)}s.`,
        504,
      );
    }
    await sleep(Math.min(pollIntervalMs, remaining));
    const current = await get<JobStatusResponse<T>>(`/api/jobs/${jobId}`);
    onPoll?.(current);
    if (current.status === "ok") {
      return (current.result ?? {}) as T;
    }
    if (current.status === "error") {
      throw new ApiError(current.error || `${kind} job #${jobId} failed`, current.status_code ?? 500);
    }
    if (current.status !== "running") {
      throw new ApiError(
        current.error || `${kind} job #${jobId} ended with status ${String(current.status)}`,
        current.status_code ?? 500,
      );
    }
  }
}

async function runJob<T>(
  companyId: number,
  kind: JobKind,
  options?: {
    limit?: number;
    onPoll?: (status: JobStatusResponse<T>) => void;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  },
): Promise<T> {
  const qs = options?.limit ? `?limit=${options.limit}` : "";
  const started = await post<JobStatusResponse<T>>(`/api/companies/${companyId}/jobs/${kind}${qs}`);
  options?.onPoll?.(started);
  return pollJob<T>(started.job_id, kind, options?.onPoll, {
    maxWaitMs: options?.maxWaitMs,
    pollIntervalMs: options?.pollIntervalMs,
  });
}

export async function startResearch(params: {
  companyName: string;
  websiteUrl: string;
  context?: string;
  onStatus?: (status: ResearchStatus) => void;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  companyId: number;
  jobId: number;
  profile: import("./types").Profile;
  pagesFetched: string[];
  unverifiedCount: number;
}> {
  params.onStatus?.("submitting");
  let started: JobStatusResponse<{
    company_id: number;
    profile: import("./types").Profile;
    pages_fetched: string[];
    unverified_count: number;
  }>;
  try {
    started = await post("/api/companies/research", {
      companyName: params.companyName,
      websiteUrl: params.websiteUrl,
      context: params.context?.trim() || "",
    });
  } catch (caught) {
    params.onStatus?.("error");
    if (caught instanceof ApiError && (caught.status === 0 || caught.message.includes("not reachable"))) {
      throw new ApiError("Backend not reachable. Check that the API is running.", caught.status);
    }
    throw caught;
  }

  const initialStage = (started.stage as ResearchStatus | undefined) ?? "reading_website";
  params.onStatus?.(initialStage);

  try {
    const result = await pollJob<{
      company_id: number;
      profile: import("./types").Profile;
      pages_fetched: string[];
      unverified_count: number;
    }>(
      started.job_id,
      "research",
      (jobState) => {
        if (jobState.status === "running") {
          const nextStage = (jobState.stage as ResearchStatus | undefined) ?? "reading_website";
          params.onStatus?.(nextStage);
        }
      },
      { maxWaitMs: params.maxWaitMs, pollIntervalMs: params.pollIntervalMs },
    );
    params.onStatus?.("completed");
    return {
      companyId: started.company_id,
      jobId: started.job_id,
      profile: result.profile,
      pagesFetched: result.pages_fetched ?? [],
      unverifiedCount: result.unverified_count ?? 0,
    };
  } catch (caught) {
    params.onStatus?.("error");
    throw caught;
  }
}

export async function getCompany(id: number): Promise<import("./types").CompanyDetailApi> {
  return get<import("./types").CompanyDetailApi>(`/api/companies/${id}`);
}

export async function updateCompany(
  id: number,
  patchPayload: import("./types").CompanyPatchPayload,
): Promise<import("./types").CompanyDetailApi> {
  return patch<import("./types").CompanyDetailApi>(`/api/companies/${id}`, patchPayload);
}

export async function rerunResearch(id: number) {
  return post<JobStatusResponse>(`/api/companies/${id}/jobs/research`);
}

export async function confirmProfile(id: number) {
  return post<{
    company_id: number;
    confirmed: boolean;
    confirmed_at: string;
    workflow_status: import("./types").WorkflowStatus;
  }>(`/api/companies/${id}/confirm`);
}

function normalizeInterview(raw: import("./types").InterviewState): import("./types").Interview {
  const turns: import("./types").Turn[] =
    raw.turns && raw.turns.length > 0
      ? raw.turns.map((t) => ({
          id: t.id,
          index: t.index,
          question: t.question,
          topic: t.topic || "Goals",
          whyAsking: t.whyAsking,
          evidenceIds: t.evidenceIds ?? [],
          suggestedAnswers: t.suggestedAnswers ?? [],
          isFollowup: t.isFollowup,
          answer: t.answer,
          updatedAfterEdit: t.updatedAfterEdit,
        }))
      : raw.questions.map((q) => ({
          id: q.id,
          index: q.idx,
          question: q.question,
          topic: "Goals",
          evidenceIds: [],
          isFollowup: q.is_followup,
          answer:
            q.skipped || q.answer !== null
              ? {
                  text: q.answer ?? undefined,
                  skipped: q.skipped,
                  answeredAt: new Date().toISOString(),
                }
              : undefined,
        }));

  const learned: import("./types").LearnedItem[] =
    raw.learned ??
    turns
      .filter((t) => t.answer)
      .map((t) => ({
        id: `learned-${t.id ?? t.index}`,
        topic: t.topic,
        text: t.answer?.skipped ? "Skipped (confidential)" : (t.answer?.text ?? ""),
        sourceTurnIndex: t.index,
        skipped: t.answer?.skipped,
      }));

  const status: import("./types").InterviewStatus =
    raw.status ??
    (raw.completed ? "completed" : raw.started ? "in_progress" : "not_started");

  return {
    id: raw.id ?? raw.company_id,
    companyId: raw.companyId ?? raw.company_id,
    status,
    totalQuestions: raw.totalQuestions ?? Math.max(turns.length, 10),
    currentIndex: raw.currentIndex ?? raw.current_idx ?? 0,
    model: raw.model ?? undefined,
    turns,
    learned,
    regeneratedFrom: raw.regeneratedFrom ?? null,
  };
}

export async function getInterview(companyId: number): Promise<import("./types").Interview> {
  const raw = await get<import("./types").InterviewState>(`/api/companies/${companyId}/interview`);
  return normalizeInterview(raw);
}

export async function startInterview(companyId: number): Promise<import("./types").Interview> {
  const raw = await post<import("./types").InterviewState>(`/api/companies/${companyId}/interview/start`);
  return normalizeInterview(raw);
}

export async function submitAnswer(
  companyId: number,
  body: { turnIndex: number; text: string; quotedText?: string },
  onThinkingStatus?: (statusText: string) => void,
): Promise<import("./types").Interview> {
  const targetUrl = `${API_BASE}/api/companies/${companyId}/interview/answer`;
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        idx: body.turnIndex,
        turnIndex: body.turnIndex,
        answer: body.text,
        text: body.text,
        quotedText: body.quotedText,
      }),
    });
  } catch {
    throw new ApiError("Backend not reachable. Check that the API is running.", 0);
  }

  if (!response.ok) {
    let detail = `POST /api/companies/${companyId}/interview/answer failed with HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { detail?: unknown };
      if (errBody.detail) {
        detail = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      /* empty */
    }
    throw new ApiError(detail, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalState: import("./types").InterviewState | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const dataLines = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        try {
          const parsed = JSON.parse(payload) as {
            status?: string;
            interview?: import("./types").InterviewState;
          };
          if (parsed.status && onThinkingStatus) onThinkingStatus(parsed.status);
          if (parsed.interview) finalState = parsed.interview;
          else if ("questions" in parsed || "turns" in parsed) {
            finalState = parsed as unknown as import("./types").InterviewState;
          }
        } catch {
          if (onThinkingStatus) onThinkingStatus(payload);
        }
      }
    }
    if (finalState) return normalizeInterview(finalState);
  }

  const raw = (await response.json()) as import("./types").InterviewState;
  return normalizeInterview(raw);
}

export async function skipQuestion(
  companyId: number,
  turnIndex: number,
): Promise<import("./types").Interview> {
  const raw = await post<import("./types").InterviewState>(
    `/api/companies/${companyId}/interview/skip`,
    { turnIndex, idx: turnIndex },
  );
  return normalizeInterview(raw);
}

export async function editAnswer(
  companyId: number,
  turnIndex: number,
  text: string,
): Promise<import("./types").Interview> {
  const raw = await patch<import("./types").InterviewState>(
    `/api/companies/${companyId}/interview/answers/${turnIndex}`,
    { text, answer: text },
  );
  return normalizeInterview(raw);
}

export async function completeInterview(companyId: number) {
  return post<{ company_id: number; intelligence: Record<string, unknown> }>(
    `/api/companies/${companyId}/interview/complete`,
  );
}

export async function resetInterview(companyId: number): Promise<import("./types").Interview> {
  const raw = await post<import("./types").InterviewState>(
    `/api/companies/${companyId}/interview/reset`,
  );
  return normalizeInterview(raw);
}

export async function getSignalStack(companyId: number): Promise<import("./types").SignalStack> {
  return get<import("./types").SignalStack>(`/api/companies/${companyId}/signal-stack`);
}

export async function runSignalStackDiscovery(companyId: number) {
  return post<JobStatusResponse>(`/api/companies/${companyId}/signal-stack/discover`);
}

export async function updateSignalStackSource(
  companyId: number,
  sourceId: number,
  patchPayload: import("./types").SignalStackSourcePatch,
): Promise<import("./types").SignalStackSource> {
  return patch<import("./types").SignalStackSource>(
    `/api/companies/${companyId}/sources/${sourceId}`,
    patchPayload,
  );
}

export async function bulkUpdateSources(
  companyId: number,
  ids: number[],
  patchPayload: import("./types").SignalStackSourcePatch,
): Promise<import("./types").SignalStack> {
  return post<import("./types").SignalStack>(`/api/companies/${companyId}/sources/bulk`, {
    ids,
    patch: patchPayload,
  });
}

export async function addSignalStackSource(
  companyId: number,
  body: {
    url: string;
    name?: string;
    category: import("./types").SourceCategory;
    reason?: string;
    forceAdd?: boolean;
  },
): Promise<{
  normalized?: import("./types").SignalStackSource;
  validation?: import("./types").AddSourceValidation;
}> {
  const targetUrl = `${API_BASE}/api/companies/${companyId}/sources`;
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Backend not reachable. Check that the API is running.", 0);
  }

  const parsed = (await response.json().catch(() => ({}))) as {
    detail?: string;
    validation?: import("./types").AddSourceValidation;
    normalized?: import("./types").SignalStackSource;
  };

  if (!response.ok) {
    throw new SourceValidationError(
      parsed.detail || `Failed to add source (HTTP ${response.status})`,
      response.status,
      parsed.validation ?? null,
    );
  }

  return parsed;
}

export async function recheckSignalStackSource(
  companyId: number,
  sourceId: number,
): Promise<import("./types").SignalStackSource> {
  return post<import("./types").SignalStackSource>(
    `/api/companies/${companyId}/sources/${sourceId}/recheck`,
  );
}

export async function deleteSignalStackSource(
  companyId: number,
  sourceId: number,
): Promise<void> {
  return del<void>(`/api/companies/${companyId}/sources/${sourceId}`);
}

export async function applyAudit(
  companyId: number,
  decisions: { proposalId: string; accepted: boolean }[],
): Promise<import("./types").SignalStack> {
  return post<import("./types").SignalStack>(
    `/api/companies/${companyId}/signal-stack/audit/apply`,
    { decisions },
  );
}

export async function confirmSignalStack(companyId: number) {
  return post<{
    company_id: number;
    confirmed: boolean;
    confirmed_at: string;
    workflow_status: import("./types").WorkflowStatus;
  }>(`/api/companies/${companyId}/signal-stack/confirm`);
}

export async function uploadInternalFile(
  companyId: number,
  file: File,
  documentType = "general",
): Promise<{ filename: string; document_type: string; characters: number; label: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("document_type", documentType);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/companies/${companyId}/internal/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new ApiError("Backend not reachable. Check that the API is running.", 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new ApiError(body.detail ?? `Upload failed (HTTP ${response.status})`, response.status);
  }
  return (await response.json()) as {
    filename: string;
    document_type: string;
    characters: number;
    label: string;
  };
}

export async function listInternalFiles(
  companyId: number,
): Promise<{ items: import("./types").UploadedFile[] }> {
  return get<{ items: import("./types").UploadedFile[] }>(
    `/api/companies/${companyId}/internal/files`,
  );
}

export async function deleteInternalFile(companyId: number, fileId: number): Promise<void> {
  return del<void>(`/api/companies/${companyId}/internal/files/${fileId}`);
}

export const api = {
  apiBase: API_BASE,
  health: () => get<{ status: string; tables: string[]; llm: { model: string; api_key_configured: boolean } }>("/api/health"),

  startJob: <T = Record<string, unknown>>(companyId: number, kind: JobKind, limit?: number) =>
    post<JobStatusResponse<T>>(`/api/companies/${companyId}/jobs/${kind}${limit ? `?limit=${limit}` : ""}`),
  getJob: <T = Record<string, unknown>>(jobId: number) => get<JobStatusResponse<T>>(`/api/jobs/${jobId}`),

  listCompanies: (q?: string) => {
    const qs = q?.trim() ? `?limit=100&q=${encodeURIComponent(q.trim())}` : "?limit=100";
    return get<{ items: import("./types").Company[]; total: number }>(`/api/companies${qs}`);
  },
  createCompany: (payload: { name: string; website: string; context: string }) =>
    post<import("./types").Company>("/api/companies", payload),
  getCompany: (id: number) => get<import("./types").CompanyDetailApi>(`/api/companies/${id}`),
  getOverview: (id: number) => get<import("./types").CompanyOverview>(`/api/companies/${id}/overview`),
  updateCompany: (id: number, payload: import("./types").CompanyPatchPayload) =>
    patch<import("./types").CompanyDetailApi>(`/api/companies/${id}`, payload),
  confirmProfile: (id: number) => confirmProfile(id),
  rerunResearch: (id: number) => rerunResearch(id),

  research: (id: number) =>
    runJob<{ company_id: number; profile: import("./types").Profile; pages_fetched: string[]; unverified_count: number }>(
      id,
      "research",
    ),
  getProfile: (id: number) => get<import("./types").Profile>(`/api/companies/${id}/profile`),
  patchProfile: (
    id: number,
    payload: {
      summary?: string;
      industry?: string;
      business_model?: string;
      value_proposition?: string;
      positioning?: string;
      unverified?: string[];
    },
  ) => patch<import("./types").Profile>(`/api/companies/${id}/profile`, payload),

  startInterview: (id: number) => post<import("./types").InterviewState>(`/api/companies/${id}/interview/start`),
  getInterview: (id: number) => get<import("./types").InterviewState>(`/api/companies/${id}/interview`),
  answer: (id: number, payload: { idx: number; answer?: string; skip?: boolean }) =>
    post<import("./types").InterviewState>(`/api/companies/${id}/interview/answer`, payload),
  editAnswer: (qaId: number, answer: string) =>
    patch<import("./types").InterviewState>(`/api/interview/answers/${qaId}`, { answer }),
  completeInterview: (id: number) =>
    post<{ company_id: number; intelligence: Record<string, unknown> }>(`/api/companies/${id}/interview/complete`),

  listSources: (id: number) =>
    get<{ items: import("./types").Source[]; total: number; counts_by_status: Record<string, number> }>(
      `/api/companies/${id}/sources`,
    ),
  discoverSources: (id: number) => runJob<import("./types").DiscoveryResult>(id, "discover"),
  addSource: (
    id: number,
    payload: {
      name: string;
      url: string;
      category: string;
      reason?: string;
      description?: string;
      expected?: string;
      update_frequency?: string;
      reliability?: number;
    },
  ) => post<import("./types").Source>(`/api/companies/${id}/sources`, payload),
  approveSource: (sourceId: number) => post<import("./types").Source>(`/api/sources/${sourceId}/approve`),
  patchSource: (sourceId: number, payload: { status?: string }) =>
    patch<import("./types").Source>(`/api/sources/${sourceId}`, payload),
  deleteSource: (sourceId: number) => del<void>(`/api/sources/${sourceId}`),

  crawl: (id: number) => runJob<import("./types").CrawlSummary>(id, "crawl"),
  analyse: (id: number, limit?: number) => runJob<import("./types").AnalysisResult>(id, "analyse", { limit }),
  crawlHistory: (id: number) =>
    get<{ items: { id: number; job: string; status: string; at: string; detail: string }[] }>(
      `/api/companies/${id}/crawl-history`,
    ),
  crawlDiagnostics: (id: number) => get<import("./types").CrawlDiagnostics>(`/api/companies/${id}/crawl-diagnostics`),
  discoverCompetitors: (id: number) =>
    runJob<{
      company_id: number;
      competitors: import("./types").CompetitorProfile[];
      fetched_count: number;
      failed: { name: string; url: string; reason: string }[];
    }>(id, "competitors"),
  listCompetitors: (id: number) =>
    get<{
      company_id: number;
      competitors: import("./types").CompetitorProfile[];
      hints: import("./types").CompetitorHint[];
      meta: { updated_at?: string; fetched_count?: number; failed?: { name: string; url: string; reason: string }[] };
      monitored_sources: { id: number; name: string; url: string; status: string; health: string }[];
    }>(`/api/companies/${id}/competitors`),
  intelligence: (
    id: number,
    filters?: {
      category?: string;
      source_id?: number;
      date_from?: string;
      date_to?: string;
      min_relevance?: number;
      min_impact?: number;
      verified_only?: boolean;
      priority_band?: string;
      classification?: string;
      q?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set("category", filters.category);
    if (filters?.source_id !== undefined) params.set("source_id", String(filters.source_id));
    if (filters?.date_from) params.set("date_from", filters.date_from);
    if (filters?.date_to) params.set("date_to", filters.date_to);
    if (filters?.min_relevance !== undefined) params.set("min_relevance", String(filters.min_relevance));
    if (filters?.min_impact !== undefined) params.set("min_impact", String(filters.min_impact));
    if (filters?.verified_only !== undefined) params.set("verified_only", String(filters.verified_only));
    if (filters?.priority_band) params.set("priority_band", filters.priority_band);
    if (filters?.classification) params.set("classification", filters.classification);
    if (filters?.q) params.set("q", filters.q);
    const qs = params.toString();
    return get<{ items: import("./types").Signal[]; total: number }>(
      `/api/companies/${id}/intelligence${qs ? `?${qs}` : ""}`,
    );
  },
  signal: (recordId: number) => get<import("./types").Signal>(`/api/signals/${recordId}`),
  signalUrl: (recordId: number) => `${API_BASE}/api/signals/${recordId}`,

  generateReport: (id: number) => post<import("./types").Report>(`/api/companies/${id}/reports/generate`),
  listReports: (id: number) =>
    get<{ items: import("./types").ReportListItem[]; total: number }>(`/api/companies/${id}/reports`),
  getReport: (reportId: number) => get<import("./types").Report>(`/api/reports/${reportId}`),
  toggleAction: (reportId: number, index: number, done: boolean) =>
    patch<{ report_id: number; actions: import("./types").BriefAction[] }>(
      `/api/reports/${reportId}/actions/${index}`,
      { done },
    ),
  exportUrl: (reportId: number) => `${API_BASE}/api/reports/${reportId}/export`,

  runAutomation: (id: number) => post<Record<string, unknown>>(`/api/companies/${id}/automation/run`),
  runAudit: (id: number) => post<Record<string, unknown>>(`/api/companies/${id}/source-audit`),
  jobLogs: (id: number) => get<{ items: import("./types").JobLog[]; total: number }>(`/api/companies/${id}/job-logs`),

  uploadDocument: async (id: number, file: File, documentType = "general") => {
    const form = new FormData();
    form.append("file", file);
    form.append("document_type", documentType);
    const response = await fetch(`${API_BASE}/api/companies/${id}/documents`, { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new ApiError(body.detail ?? "upload failed", response.status);
    }
    return (await response.json()) as {
      filename: string;
      document_type: string;
      characters: number;
      label: string;
    };
  },
  listDocuments: (id: number) => get<{ items: import("./types").DocumentItem[]; total: number }>(`/api/companies/${id}/documents`),

  reassessContext: (id: number, context: string) =>
    post<import("./types").ReassessResult>(`/api/companies/${id}/context/reassess`, { context }),
};

// ---------------------------------------------------------------------------
// Crawler Monitor (Step 4)
// ---------------------------------------------------------------------------

export async function getCrawlerOverview(
  companyId: number,
  range: import("./types").CrawlRange = "7d",
): Promise<import("./types").CrawlerOverview> {
  return get<import("./types").CrawlerOverview>(
    `/api/companies/${companyId}/crawler/overview?range=${encodeURIComponent(range)}`,
  );
}

export async function startCrawl(
  companyId: number,
  sourceIds?: number[],
): Promise<import("./types").CrawlRun> {
  return post<import("./types").CrawlRun>(
    `/api/companies/${companyId}/crawler/run`,
    sourceIds && sourceIds.length > 0 ? { sourceIds } : {},
  );
}

export async function cancelCrawl(
  companyId: number,
  runId: number,
): Promise<import("./types").CrawlRun> {
  return post<import("./types").CrawlRun>(
    `/api/companies/${companyId}/crawler/runs/${runId}/cancel`,
  );
}

export async function listRuns(
  companyId: number,
  cursor?: string | null,
  range?: import("./types").CrawlRange,
): Promise<{ items: import("./types").CrawlRun[]; nextCursor: string | null; total: number }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (range) params.set("range", range);
  const qs = params.toString();
  return get<{ items: import("./types").CrawlRun[]; nextCursor: string | null; total: number }>(
    `/api/companies/${companyId}/crawler/runs${qs ? `?${qs}` : ""}`,
  );
}

export async function getRun(
  companyId: number,
  runId: number,
): Promise<{
  run: import("./types").CrawlRun;
  results: import("./types").SourceCrawlResult[];
}> {
  return get<{
    run: import("./types").CrawlRun;
    results: import("./types").SourceCrawlResult[];
  }>(`/api/companies/${companyId}/crawler/runs/${runId}`);
}

export async function getRunLogs(
  companyId: number,
  runId: number,
  cursor?: string | null,
): Promise<{ items: import("./types").CrawlLogLine[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return get<{ items: import("./types").CrawlLogLine[]; nextCursor: string | null }>(
    `/api/companies/${companyId}/crawler/runs/${runId}/logs${qs ? `?${qs}` : ""}`,
  );
}

export function streamRunLogs(
  companyId: number,
  runId: number,
  afterId = 0,
): EventSource {
  const qs = afterId > 0 ? `?afterId=${afterId}` : "";
  return new EventSource(
    `${API_BASE}/api/companies/${companyId}/crawler/runs/${runId}/logs/stream${qs}`,
  );
}

export async function listItems(
  companyId: number,
  filters: import("./types").CollectedItemsFilters = {},
  cursor?: string | null,
): Promise<{ items: import("./types").CollectedItem[]; nextCursor: string | null; total: number }> {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.change && filters.change !== "all") params.set("change", filters.change);
  if (filters.sourceId !== undefined) params.set("sourceId", String(filters.sourceId));
  if (filters.q) params.set("q", filters.q);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return get<{
    items: import("./types").CollectedItem[];
    nextCursor: string | null;
    total: number;
  }>(`/api/companies/${companyId}/crawler/items${qs ? `?${qs}` : ""}`);
}

export async function getItem(
  companyId: number,
  itemId: number,
): Promise<import("./types").CollectedItem> {
  return get<import("./types").CollectedItem>(
    `/api/companies/${companyId}/crawler/items/${itemId}`,
  );
}

export function exportLogsCsvUrl(
  companyId: number,
  range: import("./types").CrawlRange = "7d",
): string {
  return `${API_BASE}/api/companies/${companyId}/crawler/logs/export?range=${encodeURIComponent(range)}`;
}

export async function exportLogsCsv(
  companyId: number,
  range: import("./types").CrawlRange = "7d",
): Promise<string> {
  const res = await fetch(exportLogsCsvUrl(companyId, range), { cache: "no-store" });
  if (!res.ok) {
    throw new ApiError(`Failed to export CSV (HTTP ${res.status})`, res.status);
  }
  return res.text();
}

export async function updateCrawlerSettings(
  companyId: number,
  body: { maxPagesPerRun: number },
): Promise<{ maxPagesPerRun: number }> {
  return patch<{ maxPagesPerRun: number }>(
    `/api/companies/${companyId}/crawler/settings`,
    body,
  );
}

// ---------------------------------------------------------------------------
// Intelligence Feed / Signals (Step 5)
// ---------------------------------------------------------------------------

export async function getSignalsOverview(
  companyId: number,
  range: import("./types").SignalRange = "30d",
): Promise<import("./types").SignalsOverviewResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockSignalsOverview } = await import("@/lib/signals-mocks");
    return mockSignalsOverview(range);
  }
  return get<import("./types").SignalsOverviewResponse>(
    `/api/companies/${companyId}/signals/overview?range=${encodeURIComponent(range)}`,
  );
}

export async function listSignals(
  companyId: number,
  filters: import("./types").SignalsListFilters = {},
  cursor?: string | null,
  limit = 25,
): Promise<import("./types").SignalsListResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockSignalsList } = await import("@/lib/signals-mocks");
    return mockSignalsList(filters);
  }
  const params = new URLSearchParams();
  if (filters.category && filters.category.length > 0) {
    params.set("category", filters.category.join(","));
  }
  if (filters.classification && filters.classification !== "all") {
    params.set("classification", filters.classification);
  }
  if (filters.minPriority !== undefined && filters.minPriority > 1) {
    params.set("minPriority", String(filters.minPriority));
  }
  if (filters.sourceId !== undefined) {
    params.set("sourceId", String(filters.sourceId));
  }
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  const qs = params.toString();
  return get<import("./types").SignalsListResponse>(
    `/api/companies/${companyId}/signals${qs ? `?${qs}` : ""}`,
  );
}

export async function getSignalDetail(
  companyId: number,
  signalId: number,
): Promise<import("./types").SignalDetailResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockSignalDetail } = await import("@/lib/signals-mocks");
    return mockSignalDetail(signalId);
  }
  return get<import("./types").SignalDetailResponse>(
    `/api/companies/${companyId}/signals/${signalId}`,
  );
}

export async function patchSignal(
  companyId: number,
  signalId: number,
  body: import("./types").SignalPatchPayload,
): Promise<import("./types").SignalItem> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockPatchSignal } = await import("@/lib/signals-mocks");
    return mockPatchSignal(signalId, body);
  }
  return patch<import("./types").SignalItem>(
    `/api/companies/${companyId}/signals/${signalId}`,
    body,
  );
}

export async function bulkUpdateSignals(
  companyId: number,
  ids: number[],
  body: import("./types").SignalPatchPayload,
): Promise<{ updatedCount: number }> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return { updatedCount: ids.length };
  }
  return post<{ updatedCount: number }>(
    `/api/companies/${companyId}/signals/bulk`,
    { ids, patch: body },
  );
}

export async function runAnalysis(
  companyId: number,
): Promise<{ id: number; job: string; status: string }> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return { id: 1, job: "analyse", status: "running" };
  }
  return post<{ id: number; job: string; status: string }>(
    `/api/companies/${companyId}/signals/analyse`,
  );
}

export async function askSignals(
  companyId: number,
  question: string,
  quotedText?: string | null,
): Promise<import("./types").AskSignalsResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockAskSignals } = await import("@/lib/signals-mocks");
    return mockAskSignals(question);
  }
  return post<import("./types").AskSignalsResponse>(
    `/api/companies/${companyId}/signals/ask`,
    quotedText ? { question, quotedText } : { question },
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard & Workspace Search
// ---------------------------------------------------------------------------

export async function getDashboard(
  companyId: number,
  range: import("./types").DashboardRange = "30d",
  category?: import("./types").SourceCategory | null,
): Promise<import("./types").DashboardData> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockDashboardData } = await import("@/lib/dashboard-mocks");
    return mockDashboardData(range, category);
  }
  const params = new URLSearchParams();
  params.set("range", range);
  if (category) params.set("category", category);
  return get<import("./types").DashboardData>(
    `/api/companies/${companyId}/dashboard?${params.toString()}`,
  );
}

export async function searchWorkspace(
  companyId: number,
  query: string,
): Promise<import("./types").WorkspaceSearchResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockWorkspaceSearch } = await import("@/lib/dashboard-mocks");
    return mockWorkspaceSearch(query);
  }
  const params = new URLSearchParams();
  params.set("q", query);
  return get<import("./types").WorkspaceSearchResponse>(
    `/api/companies/${companyId}/search?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Automation & Scheduler Control Plane (Step 6)
// ---------------------------------------------------------------------------

export async function getAutomation(
  companyId: number,
): Promise<import("./types").AutomationOverview> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockAutomationOverview } = await import("@/lib/automation-mocks");
    return mockAutomationOverview();
  }
  return get<import("./types").AutomationOverview>(
    `/api/companies/${companyId}/automation`,
  );
}

export async function getCalendar(
  companyId: number,
  from: string,
  to: string,
): Promise<import("./types").CalendarDay[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockCalendarDays } = await import("@/lib/automation-mocks");
    return mockCalendarDays(from, to);
  }
  const params = new URLSearchParams({ from, to });
  const res = await get<{ days: import("./types").CalendarDay[] }>(
    `/api/companies/${companyId}/automation/calendar?${params.toString()}`,
  );
  return res.days;
}

export async function previewSchedule(
  companyId: number,
  draft: import("./types").ScheduleDraft,
): Promise<import("./types").SchedulePreviewResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockPreviewSchedule } = await import("@/lib/automation-mocks");
    return mockPreviewSchedule(draft);
  }
  return post<import("./types").SchedulePreviewResponse>(
    `/api/companies/${companyId}/automation/schedules/preview`,
    draft,
  );
}

export async function createSchedule(
  companyId: number,
  draft: import("./types").ScheduleDraft,
): Promise<import("./types").Schedule> {
  return post<import("./types").Schedule>(
    `/api/companies/${companyId}/automation/schedules`,
    draft,
  );
}

export async function updateSchedule(
  companyId: number,
  scheduleId: number,
  patchBody: Partial<import("./types").ScheduleDraft> & { pausedUntil?: string | null },
): Promise<import("./types").Schedule> {
  return patch<import("./types").Schedule>(
    `/api/companies/${companyId}/automation/schedules/${scheduleId}`,
    patchBody,
  );
}

export async function deleteSchedule(
  companyId: number,
  scheduleId: number,
): Promise<void> {
  return del<void>(`/api/companies/${companyId}/automation/schedules/${scheduleId}`);
}

export async function runScheduleNow(
  companyId: number,
  scheduleId: number,
): Promise<import("./types").AutomationRun> {
  return post<import("./types").AutomationRun>(
    `/api/companies/${companyId}/automation/schedules/${scheduleId}/run`,
  );
}

export async function listAutomationRuns(
  companyId: number,
  filters: import("./types").AutomationRunsFilters = {},
  cursor?: string | null,
): Promise<import("./types").AutomationRunsResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockAutomationRuns } = await import("@/lib/automation-mocks");
    return mockAutomationRuns(filters);
  }
  const params = new URLSearchParams();
  if (filters.job && filters.job !== "all") params.set("job", filters.job);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.trigger && filters.trigger !== "all") params.set("trigger", filters.trigger);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.q) params.set("q", filters.q);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return get<import("./types").AutomationRunsResponse>(
    `/api/companies/${companyId}/automation/runs${qs ? `?${qs}` : ""}`,
  );
}

export async function getAutomationRun(
  companyId: number,
  runId: number,
): Promise<import("./types").AutomationRunDetailResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockAutomationRunDetail } = await import("@/lib/automation-mocks");
    return mockAutomationRunDetail(runId);
  }
  return get<import("./types").AutomationRunDetailResponse>(
    `/api/companies/${companyId}/automation/runs/${runId}`,
  );
}

export async function retryRun(
  companyId: number,
  runId: number,
): Promise<import("./types").AutomationRun> {
  return post<import("./types").AutomationRun>(
    `/api/companies/${companyId}/automation/runs/${runId}/retry`,
  );
}

export async function getAutomationRunLogs(
  companyId: number,
  runId: number,
  cursor?: string | null,
): Promise<{ items: import("./types").CrawlLogLine[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return get<{ items: import("./types").CrawlLogLine[]; nextCursor: string | null }>(
    `/api/companies/${companyId}/automation/runs/${runId}/logs${qs ? `?${qs}` : ""}`,
  );
}

export function streamAutomationRunLogs(
  companyId: number,
  runId: number,
  afterId = 0,
): EventSource {
  const qs = afterId > 0 ? `?afterId=${afterId}` : "";
  return new EventSource(
    `${API_BASE}/api/companies/${companyId}/automation/runs/${runId}/logs/stream${qs}`,
  );
}

export async function listOverrides(
  companyId: number,
): Promise<{ items: import("./types").Override[] }> {
  return get<{ items: import("./types").Override[] }>(
    `/api/companies/${companyId}/automation/overrides`,
  );
}

export async function createOverride(
  companyId: number,
  draft: import("./types").OverrideDraft,
): Promise<import("./types").Override> {
  return post<import("./types").Override>(
    `/api/companies/${companyId}/automation/overrides`,
    draft,
  );
}

export async function deleteOverride(
  companyId: number,
  overrideId: number,
): Promise<void> {
  return del<void>(`/api/companies/${companyId}/automation/overrides/${overrideId}`);
}

export async function previewOverride(
  companyId: number,
  draft: import("./types").OverrideDraft,
): Promise<import("./types").OverridePreviewResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockPreviewOverride } = await import("@/lib/automation-mocks");
    return mockPreviewOverride(draft);
  }
  return post<import("./types").OverridePreviewResponse>(
    `/api/companies/${companyId}/automation/overrides/preview`,
    draft,
  );
}

export function exportRunsCsvUrl(
  companyId: number,
  filters: import("./types").AutomationRunsFilters = {},
): string {
  const params = new URLSearchParams();
  if (filters.job && filters.job !== "all") params.set("job", filters.job);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.trigger && filters.trigger !== "all") params.set("trigger", filters.trigger);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return `${API_BASE}/api/companies/${companyId}/automation/runs/export${qs ? `?${qs}` : ""}`;
}

export async function exportRunsCsv(
  companyId: number,
  filters: import("./types").AutomationRunsFilters = {},
): Promise<string> {
  const res = await fetch(exportRunsCsvUrl(companyId, filters), { cache: "no-store" });
  if (!res.ok) {
    throw new ApiError(`Failed to export CSV (HTTP ${res.status})`, res.status);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Monday Morning Brief v2 (Showpiece)
// ---------------------------------------------------------------------------

export async function getLatestBrief(
  companyId: number,
): Promise<import("./types").BriefLatestResponse> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockLatestBrief } = await import("@/lib/brief-mocks");
    return mockLatestBrief(companyId);
  }
  return get<import("./types").BriefLatestResponse>(
    `/api/companies/${companyId}/briefs/latest`,
  );
}

export async function getBrief(
  companyId: number,
  briefId: string,
): Promise<import("./types").Brief> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockBriefById } = await import("@/lib/brief-mocks");
    return mockBriefById(companyId, briefId);
  }
  return get<import("./types").Brief>(
    `/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}`,
  );
}

export async function listBriefs(
  companyId: number,
  cursor?: string | null,
): Promise<{
  items: import("./types").BriefSummary[];
  nextCursor: string | null;
  total: number;
}> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockBriefList } = await import("@/lib/brief-mocks");
    return mockBriefList();
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return get<{
    items: import("./types").BriefSummary[];
    nextCursor: string | null;
    total: number;
  }>(`/api/companies/${companyId}/briefs${qs}`);
}

export async function generateBrief(
  companyId: number,
): Promise<import("./types").BriefGenerationState> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockBriefGeneration } = await import("@/lib/brief-mocks");
    return mockBriefGeneration();
  }
  return post<import("./types").BriefGenerationState>(
    `/api/companies/${companyId}/briefs/generate`,
  );
}

export async function getBriefGeneration(
  companyId: number,
): Promise<import("./types").BriefGenerationState> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockBriefGeneration } = await import("@/lib/brief-mocks");
    return mockBriefGeneration();
  }
  return get<import("./types").BriefGenerationState>(
    `/api/companies/${companyId}/briefs/generation`,
  );
}

export async function patchBrief(
  companyId: number,
  briefId: string,
  payload: {
    status?: import("./types").BriefStatus;
    removeItemIds?: string[];
    notes?: import("./types").BriefNote[];
  },
): Promise<import("./types").Brief> {
  return patch<import("./types").Brief>(
    `/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}`,
    payload,
  );
}

export async function patchBriefAction(
  companyId: number,
  briefId: string,
  actionId: string,
  payload: {
    done?: boolean;
    owner?: string;
    dueDate?: string | null;
    order?: number;
  },
): Promise<import("./types").BriefActionItem> {
  return patch<import("./types").BriefActionItem>(
    `/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}/actions/${encodeURIComponent(actionId)}`,
    payload,
  );
}

export async function createBriefAction(
  companyId: number,
  briefId: string,
  payload: {
    text: string;
    owner: string;
    dueDate?: string | null;
    effort: "low" | "medium" | "high";
  },
): Promise<import("./types").BriefActionItem> {
  return post<import("./types").BriefActionItem>(
    `/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}/actions`,
    payload,
  );
}

export async function getBriefPdfBlob(
  companyId: number,
  briefId: string,
): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}/pdf`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new ApiError(`PDF export returned HTTP ${res.status}`, res.status);
  }
  return res.blob();
}

export async function getCompanySettings(
  companyId: number,
): Promise<import("./types").CompanySettings> {
  return get<import("./types").CompanySettings>(`/api/companies/${companyId}/settings`);
}

export async function updateCompanySettings(
  companyId: number,
  payload: import("./types").CompanySettingsPatch,
): Promise<import("./types").CompanySettings> {
  return patch<import("./types").CompanySettings>(
    `/api/companies/${companyId}/settings`,
    payload,
  );
}

export async function compareBriefs(
  companyId: number,
  a: string,
  b: string,
): Promise<import("./types").BriefCompareResult> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    const { mockBriefCompare } = await import("@/lib/brief-mocks");
    return mockBriefCompare(a, b);
  }
  return get<import("./types").BriefCompareResult>(
    `/api/companies/${companyId}/briefs/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
  );
}

export async function submitBriefFeedback(
  companyId: number,
  briefId: string,
  payload: { useful: boolean; comment?: string },
): Promise<import("./types").BriefFeedback> {
  return post<import("./types").BriefFeedback>(
    `/api/companies/${companyId}/briefs/${encodeURIComponent(briefId)}/feedback`,
    payload,
  );
}

export async function toggleWatchlistItem(
  companyId: number,
  watchId: string,
): Promise<{ watchId: string; inWatchlist: boolean }> {
  return post<{ watchId: string; inWatchlist: boolean }>(
    `/api/companies/${companyId}/watchlist/${encodeURIComponent(watchId)}/toggle`,
  );
}

// Named aliases matching specification Section 9
export const updateBrief = patchBrief;
export const updateAction = patchBriefAction;
export const addAction = createBriefAction;
export const downloadBriefPdf = getBriefPdfBlob;
export const sendBriefFeedback = submitBriefFeedback;
export const toggleWatch = toggleWatchlistItem;




