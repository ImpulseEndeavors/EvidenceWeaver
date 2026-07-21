import type { AppConfig, CaseWorkspace, CrossCaseMatch, CustodyManifest, CustodyOverview, EventType, EntityType, ReviewStatus } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  listCases: () => request<CaseWorkspace[]>("/api/cases"),
  config: () => request<AppConfig>("/api/config"),
  createCase: (input: { title: string; description?: string; synthetic?: boolean }) => request<CaseWorkspace>("/api/cases", { method: "POST", body: JSON.stringify(input) }),
  deleteCase: (caseId: string) => request<{ ok: boolean }>(`/api/cases/${caseId}`, { method: "DELETE" }),
  addEvidence: (caseId: string, input: { title: string; rawText: string; sourceType: "pasted_text" | "text_file"; filename?: string }) => request<CaseWorkspace>(`/api/cases/${caseId}/evidence`, { method: "POST", body: JSON.stringify(input) }),
  extract: (caseId: string, mode?: "mock" | "openai") => request<CaseWorkspace>(`/api/cases/${caseId}/extract`, { method: "POST", body: JSON.stringify({ mode }) }),
  updateFinding: (caseId: string, kind: "entities" | "events" | "indicators" | "coercionSignals", id: string, patch: { reviewStatus?: ReviewStatus; displayedValue?: string; normalizedValue?: string; description?: string; type?: EntityType; eventType?: EventType }) => request<CaseWorkspace>(`/api/cases/${caseId}/findings/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getLinks: (caseId: string) => request<CrossCaseMatch[]>(`/api/cases/${caseId}/links`),
  reviewLink: (caseId: string, matchId: string, reviewStatus: "unreviewed" | "confirmed" | "rejected") => request<CrossCaseMatch[]>(`/api/cases/${caseId}/links/${matchId}`, { method: "PATCH", body: JSON.stringify({ reviewStatus }) }),
  generateQuestions: (caseId: string) => request<CaseWorkspace>(`/api/cases/${caseId}/questions`, { method: "POST", body: "{}" }),
  updateQuestion: (caseId: string, questionId: string, status: "proposed" | "answered" | "dismissed") => request<CaseWorkspace>(`/api/cases/${caseId}/questions/${questionId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  generateBrief: (caseId: string) => request<CaseWorkspace>(`/api/cases/${caseId}/brief`, { method: "POST", body: "{}" }),
  getCustody: (caseId: string) => request<CustodyOverview>(`/api/cases/${caseId}/custody`),
  recordCustodyEvent: (caseId: string, input: { purpose: string; action?: "custody.note" | "custody.transferred"; recipient?: string; location?: string }) => request<CustodyOverview>(`/api/cases/${caseId}/custody/events`, { method: "POST", body: JSON.stringify(input) }),
  getManifest: (caseId: string) => request<CustodyManifest>(`/api/cases/${caseId}/manifest`),
};
