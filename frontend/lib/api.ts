// Thin typed client around the real FastAPI backend.
// Every call goes to a relative /api path, proxied by Next (see next.config.ts).

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "detail" in body) {
        const raw = (body as { detail: unknown }).detail;
        detail = typeof raw === "string" ? raw : JSON.stringify(raw);
      }
    } catch {
      // non-JSON error body: keep the status message
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

export const api = {
  health: () => get<{ status: string; tables: string[]; llm: { model: string; api_key_configured: boolean } }>("/api/health"),

  listCompanies: () => get<{ items: import("./types").Company[]; total: number }>("/api/companies?limit=100"),
  createCompany: (payload: { name: string; website: string; context: string }) =>
    post<import("./types").Company>("/api/companies", payload),
  getCompany: (id: number) =>
    get<import("./types").Company & { profile: import("./types").Profile | null }>(`/api/companies/${id}`),
  updateCompany: (id: number, payload: { name?: string; website?: string; context?: string }) =>
    patch<import("./types").Company>(`/api/companies/${id}`, payload),

  research: (id: number) =>
    post<{ company_id: number; profile: import("./types").Profile; pages_fetched: string[]; unverified_count: number }>(
      `/api/companies/${id}/research`,
    ),
  getProfile: (id: number) => get<import("./types").Profile>(`/api/companies/${id}/profile`),

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
  discoverSources: (id: number) => post<import("./types").DiscoveryResult>(`/api/companies/${id}/sources/discover`),
  addSource: (
    id: number,
    payload: { name: string; url: string; category: string; reason?: string; reliability?: number },
  ) =>
    post<import("./types").Source>(`/api/companies/${id}/sources`, payload),
  approveSource: (sourceId: number) => post<import("./types").Source>(`/api/sources/${sourceId}/approve`),
  patchSource: (sourceId: number, payload: { status?: string }) =>
    patch<import("./types").Source>(`/api/sources/${sourceId}`, payload),
  deleteSource: (sourceId: number) => del<void>(`/api/sources/${sourceId}`),

  crawl: (id: number) => post<import("./types").CrawlSummary>(`/api/companies/${id}/crawl`),
  analyse: (id: number, limit?: number) =>
    post<import("./types").AnalysisResult>(`/api/companies/${id}/analyse${limit ? `?limit=${limit}` : ""}`),
  crawlHistory: (id: number) =>
    get<{ items: { id: number; job: string; status: string; at: string; detail: string }[] }>(
      `/api/companies/${id}/crawl-history`,
    ),
  intelligence: (id: number, category?: string) =>
    get<{ items: import("./types").Signal[]; total: number }>(
      `/api/companies/${id}/intelligence${category ? `?category=${category}` : ""}`,
    ),
  signal: (recordId: number) => get<import("./types").Signal>(`/api/signals/${recordId}`),

  generateReport: (id: number) => post<import("./types").Report>(`/api/companies/${id}/reports/generate`),
  listReports: (id: number) =>
    get<{ items: import("./types").ReportListItem[]; total: number }>(`/api/companies/${id}/reports`),
  getReport: (reportId: number) => get<import("./types").Report>(`/api/reports/${reportId}`),
  toggleAction: (reportId: number, index: number, done: boolean) =>
    patch<{ report_id: number; actions: import("./types").BriefAction[] }>(
      `/api/reports/${reportId}/actions/${index}`,
      { done },
    ),
  exportUrl: (reportId: number) => `/api/reports/${reportId}/export`,

  runAutomation: (id: number) => post<Record<string, unknown>>(`/api/companies/${id}/automation/run`),
  runAudit: (id: number) => post<Record<string, unknown>>(`/api/companies/${id}/source-audit`),
  jobLogs: (id: number) => get<{ items: import("./types").JobLog[]; total: number }>(`/api/companies/${id}/job-logs`),

  uploadDocument: async (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/companies/${id}/documents`, { method: "POST", body: form });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new ApiError(body.detail ?? "upload failed", response.status);
    }
    return (await response.json()) as { filename: string; characters: number; label: string };
  },
  listDocuments: (id: number) => get<{ items: import("./types").DocumentItem[]; total: number }>(`/api/companies/${id}/documents`),

  reassessContext: (id: number, context: string) =>
    post<import("./types").ReassessResult>(`/api/companies/${id}/context/reassess`, { context }),
};
