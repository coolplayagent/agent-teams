import type {
  GeneralConfig,
  AgUiActionResponse,
  RunInjectionRequest,
  JsonValue,
  ModelProfilesPayload,
  NotificationConfig,
  OrchestrationConfig,
  ProxyConfig,
  ObservabilityBreakdowns,
  ObservabilityOverview,
  RecoverySnapshot,
  RoleConfigOptions,
  RunCreateRequest,
  RunCreateResponse,
  DeleteSessionRequest,
  SessionRound,
  SessionRoundsPage,
  SessionMetadataPatch,
  SessionTokenUsage,
  ServerHealthPayload,
  SessionCreateRequest,
  SessionMode,
  SessionRecord,
  SessionSidebarRecord,
  TimelineMessage,
  StopBackgroundTaskResponse,
  ToolApprovalAction,
  UserQuestionAnswerSubmission,
  WorkspacePage,
  WorkspaceRecord,
  WorkspaceDiffListing,
  WorkspaceSnapshot,
  WebConfig,
  WebConnectivityProbeRequest,
  WebConnectivityProbeResult,
} from "./contracts";
import { requestJson } from "./http";

export function getHealth(): Promise<ServerHealthPayload> {
  return requestJson<ServerHealthPayload>("/system/health");
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const payload = await requestJson<WorkspaceRecord[] | WorkspacePage>(
    "/workspaces?limit=200",
  );
  return Array.isArray(payload) ? payload : payload.items;
}

export function getWorkspaceSnapshot(
  workspaceId: string,
): Promise<WorkspaceSnapshot> {
  return requestJson<WorkspaceSnapshot>(
    `/workspaces/${encodeURIComponent(workspaceId)}/snapshot`,
  );
}

export function getWorkspaceDiffs(
  workspaceId: string,
): Promise<WorkspaceDiffListing> {
  return requestJson<WorkspaceDiffListing>(
    `/workspaces/${encodeURIComponent(workspaceId)}/diffs`,
  );
}

export function openWorkspaceRoot(
  workspaceId: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/workspaces/${encodeURIComponent(workspaceId)}:open-root`,
    {
      method: "POST",
    },
  );
}

export function getRoleConfigOptions(): Promise<RoleConfigOptions> {
  return requestJson<RoleConfigOptions>("/roles:options");
}

export function getModelProfiles(): Promise<ModelProfilesPayload> {
  return requestJson<ModelProfilesPayload>("/system/configs/model/profiles");
}

export function getOrchestrationConfig(): Promise<OrchestrationConfig> {
  return requestJson<OrchestrationConfig>("/system/configs/orchestration");
}

export function getWebConfig(): Promise<WebConfig> {
  return requestJson<WebConfig>("/system/configs/web");
}

export function saveWebConfig(config: WebConfig): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/web", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function getProxyConfig(): Promise<ProxyConfig> {
  return requestJson<ProxyConfig>("/system/configs/proxy");
}

export function saveProxyConfig(config: ProxyConfig): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/proxy", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function reloadProxyConfig(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/proxy:reload", {
    method: "POST",
  });
}

export function probeWebConnectivity(
  request: WebConnectivityProbeRequest,
): Promise<WebConnectivityProbeResult> {
  return requestJson<WebConnectivityProbeResult>("/system/configs/web:probe", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getNotificationConfig(): Promise<NotificationConfig> {
  return requestJson<NotificationConfig>("/system/configs/notifications");
}

export function saveNotificationConfig(
  config: NotificationConfig,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/notifications", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export function listSidebarSessions(forceRefresh = false): Promise<SessionSidebarRecord[]> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set("force_refresh", "true");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<SessionSidebarRecord[]>(`/sessions/sidebar${suffix}`);
}

export function getSession(sessionId: string): Promise<SessionRecord> {
  return requestJson<SessionRecord>(`/sessions/${encodeURIComponent(sessionId)}`);
}

export function createSession(request: SessionCreateRequest): Promise<SessionRecord> {
  return requestJson<SessionRecord>("/sessions", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateSession(
  sessionId: string,
  request: SessionMetadataPatch,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function deleteSession(
  sessionId: string,
  request: DeleteSessionRequest = { cascade: true, force: true },
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      body: JSON.stringify(request),
    },
  );
}

export function updateSessionNormalModelProfile(
  sessionId: string,
  normalModelProfile: string | null,
): Promise<SessionRecord> {
  return requestJson<SessionRecord>(
    `/sessions/${encodeURIComponent(sessionId)}/normal-model-profile`,
    {
      method: "PATCH",
      body: JSON.stringify({ normal_model_profile: normalModelProfile }),
    },
  );
}

export function updateSessionTopology(
  sessionId: string,
  request: {
    session_mode: SessionMode;
    normal_root_role_id?: string | null;
    orchestration_preset_id?: string | null;
  },
): Promise<SessionRecord> {
  return requestJson<SessionRecord>(
    `/sessions/${encodeURIComponent(sessionId)}/topology`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function listSessionMessages(sessionId: string): Promise<TimelineMessage[]> {
  return requestJson<TimelineMessage[]>(
    `/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export async function listSessionRounds(
  sessionId: string,
  options: {
    cursorRunId?: string | null;
    forceRefresh?: boolean;
    limit?: number;
  } = {},
): Promise<SessionRoundsPage> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  if (options.cursorRunId) {
    params.set("cursor_run_id", options.cursorRunId);
  }
  if (options.forceRefresh === true) {
    params.set("force_refresh", "true");
  }
  const payload = await requestJson<SessionRound[] | SessionRoundsPage>(
    `/sessions/${encodeURIComponent(sessionId)}/rounds?${params.toString()}`,
  );
  if (Array.isArray(payload)) {
    return {
      has_more: false,
      items: payload,
      next_cursor: null,
    };
  }
  return payload;
}

export function getSessionTokenUsage(
  sessionId: string,
  forceRefresh = false,
): Promise<SessionTokenUsage> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set("force_refresh", "true");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<SessionTokenUsage>(
    `/sessions/${encodeURIComponent(sessionId)}/token-usage${suffix}`,
  );
}

export function getRecoverySnapshot(
  sessionId: string,
  forceRefresh = false,
): Promise<RecoverySnapshot> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set("force_refresh", "true");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<RecoverySnapshot>(
    `/sessions/${encodeURIComponent(sessionId)}/recovery${suffix}`,
  );
}

export function createRun(request: RunCreateRequest): Promise<RunCreateResponse> {
  return requestJson<RunCreateResponse>("/ag-ui/runs", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function stopRun(runId: string): Promise<{ status: string; scope: string }> {
  return requestJson<{ status: string; scope: string }>(
    `/ag-ui/runs/${encodeURIComponent(runId)}:stop`,
    {
      method: "POST",
      body: JSON.stringify({ scope: "main" }),
    },
  );
}

export function stopBackgroundTask(
  runId: string,
  backgroundTaskId: string,
): Promise<StopBackgroundTaskResponse> {
  return requestJson<StopBackgroundTaskResponse>(
    `/runs/${encodeURIComponent(runId)}/background-tasks/${encodeURIComponent(backgroundTaskId)}:stop`,
    {
      method: "POST",
    },
  );
}

export function resumeRun(runId: string): Promise<{ status: string; run_id: string; session_id: string }> {
  return requestJson<{ status: string; run_id: string; session_id: string }>(
    `/ag-ui/runs/${encodeURIComponent(runId)}:resume`,
    {
      method: "POST",
    },
  );
}

export function injectRunMessage(
  runId: string,
  request: RunInjectionRequest,
): Promise<AgUiActionResponse> {
  return requestJson<AgUiActionResponse>(
    `/ag-ui/runs/${encodeURIComponent(runId)}/inject`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function resolveToolApproval(
  runId: string,
  toolCallId: string,
  action: ToolApprovalAction,
  optionId = "",
): Promise<{ status: string }> {
  const payload: { action: ToolApprovalAction; option_id?: string } = { action };
  if (optionId.trim()) {
    payload.option_id = optionId.trim();
  }
  return requestJson<{ status: string }>(
    `/ag-ui/runs/${encodeURIComponent(runId)}/tool-approvals/${encodeURIComponent(toolCallId)}:resolve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function answerUserQuestion(
  runId: string,
  questionId: string,
  answers: UserQuestionAnswerSubmission,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/ag-ui/runs/${encodeURIComponent(runId)}/questions/${encodeURIComponent(questionId)}:answer`,
    {
      method: "POST",
      body: JSON.stringify(answers),
    },
  );
}

export function getGeneralConfig(): Promise<GeneralConfig> {
  return requestJson<GeneralConfig>("/system/configs/general");
}

export function saveGeneralConfig(config: GeneralConfig): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/general", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export function getObservabilityOverview(
  scope: "global" | "session",
  scopeId: string,
): Promise<ObservabilityOverview> {
  const params = new URLSearchParams();
  params.set("scope", scope);
  if (scopeId.trim()) {
    params.set("scope_id", scopeId);
  }
  params.set("time_window_minutes", "1440");
  return requestJson<ObservabilityOverview>(
    `/observability/overview?${params.toString()}`,
  );
}

export function getObservabilityBreakdowns(
  scope: "global" | "session",
  scopeId: string,
): Promise<ObservabilityBreakdowns> {
  const params = new URLSearchParams();
  params.set("scope", scope);
  if (scopeId.trim()) {
    params.set("scope_id", scopeId);
  }
  params.set("time_window_minutes", "1440");
  return requestJson<ObservabilityBreakdowns>(
    `/observability/breakdowns?${params.toString()}`,
  );
}

export function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}
