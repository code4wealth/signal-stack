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
    if (!parsed && (response.status === 502 || response.status === 503 || response.status === 504)) {
      const probe =
        path === "/api/health"
          ? { reachable: false, summary: `GET ${targetUrl} returned HTTP ${response.status}` }
          : await probeBackendHealth();
      if (!probe.reachable) {
        detail = `Backend not reachable on ${BACKEND_DISPLAY_URL} during ${method} ${path} (HTTP ${response.status}; probe: ${probe.summary}). Start it with: ${START_BACKEND_CMD}`;
      } else {
        detail = `Backend up on ${BACKEND_DISPLAY_URL} (${probe.summary}), but ${method} ${path} failed (HTTP ${response.status} with no error body); see the backend terminal.`;
      }
    } else if (!parsed && response.status >= 500) {
      detail += " — the API returned no error body; see the backend terminal.";
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
): Promise<T> {
  while (true) {
    await sleep(JOB_POLL_INTERVAL_MS);
    const current = await get<JobStatusResponse<T>>(`/api/jobs/${jobId}`);
    onPoll?.(current);
    if (current.status === "ok") {
      return (current.result ?? {}) as T;
    }
    if (current.status === "error") {
      throw new ApiError(current.error || `${kind} job #${jobId} failed`, current.status_code ?? 500);
    }
  }
}

async function runJob<T>(
  companyId: number,
  kind: JobKind,
  options?: { limit?: number; onPoll?: (status: JobStatusResponse<T>) => void },
): Promise<T> {
  const qs = options?.limit ? `?limit=${options.limit}` : "";
  const started = await post<JobStatusResponse<T>>(`/api/companies/${companyId}/jobs/${kind}${qs}`);
  options?.onPoll?.(started);
  return pollJob<T>(started.job_id, kind, options?.onPoll);
}

export async function startResearch(params: {
  companyName: string;
  websiteUrl: string;
  onStatus?: (status: ResearchStatus) => void;
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
    }>(started.job_id, "research", (jobState) => {
      if (jobState.status === "running") {
        const nextStage = (jobState.stage as ResearchStatus | undefined) ?? "reading_website";
        params.onStatus?.(nextStage);
      }
    });
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

export const api = {
  apiBase: API_BASE,
  health: () => get<{ status: string; tables: string[]; llm: { model: string; api_key_configured: boolean } }>("/api/health"),

  startJob: <T = Record<string, unknown>>(companyId: number, kind: JobKind, limit?: number) =>
    post<JobStatusResponse<T>>(`/api/companies/${companyId}/jobs/${kind}${limit ? `?limit=${limit}` : ""}`),
  getJob: <T = Record<string, unknown>>(jobId: number) => get<JobStatusResponse<T>>(`/api/jobs/${jobId}`),

  listCompanies: () => get<{ items: import("./types").Company[]; total: number }>("/api/companies?limit=100"),
  createCompany: (payload: { name: string; website: string; context: string }) =>
    post<import("./types").Company>("/api/companies", payload),
  getCompany: (id: number) =>
    get<import("./types").Company & { profile: import("./types").Profile | null }>(`/api/companies/${id}`),
  getOverview: (id: number) => get<import("./types").CompanyOverview>(`/api/companies/${id}/overview`),
  updateCompany: (id: number, payload: { name?: string; website?: string; context?: string }) =>
    patch<import("./types").Company>(`/api/companies/${id}`, payload),

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
