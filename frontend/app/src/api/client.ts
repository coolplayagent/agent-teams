import type {
  GeneralConfig,
  AgUiActionResponse,
  AutomationProjectRecord,
  AutomationProjectSessionRecord,
  AutomationRunNowResult,
  BoardTodoArchiveRequest,
  BoardTodoBoardResponse,
  BoardTodoItem,
  BoardTodoMarkDoneRequest,
  BoardTodoPreviewRequestChangesRequest,
  BoardTodoPreviewRequestChangesResponse,
  BoardTodoPreviewStartRequest,
  BoardTodoPreviewStartResponse,
  BoardTodoSource,
  BoardTodoSourceCreateRequest,
  BoardTodoSourceDeleteResponse,
  BoardTodoSourceSettingsResponse,
  BoardTodoSourceUpdateRequest,
  BoardTodoStartRequest,
  BoardTodoStatusUpdateRequest,
  BinaryToolDownloadJob,
  BinaryToolListResponse,
  BinaryToolSystemPathResult,
  ClawHubConfig,
  ClawHubConfigSaveResponse,
  ClawHubConnectivityProbeRequest,
  ClawHubConnectivityProbeResult,
  CommandCatalogResponse,
  CommandCreateRequest,
  CommandMutationResponse,
  CommandResolveRequest,
  CommandResolveResponse,
  CommandUpdateRequest,
  AcpRegistryCatalogResponse,
  AcpRegistryInstallRequest,
  AcpRegistryInstallResult,
  AgentRuntimeConfig,
  AgentRuntimeSummary,
  AgentRuntimeTestJob,
  ClawHubSkillMarketDetail,
  ClawHubSkillMarketInstallRequest,
  ClawHubSkillMarketInstallResponse,
  ClawHubSkillMarketSearchResponse,
  ClawHubSkillMarketUninstallResponse,
  ConnectorListResponse,
  ConnectorTestResult,
  EnvironmentVariableCatalog,
  EnvironmentVariableSaveRequest,
  EnvironmentVariableScope,
  EnvironmentVariableRecord,
  FeishuGatewayAccountCreateInput,
  FeishuGatewayAccountRecord,
  FeishuGatewayAccountUpdateInput,
  GlobalMemorySearchRequest,
  GitHubConfigUpdate,
  GitHubConfigView,
  GitHubConnectivityProbeRequest,
  GitHubConnectivityProbeResult,
  GitHubTokenRevealView,
  GitHubWebhookConnectivityProbeRequest,
  GitHubWebhookConnectivityProbeResult,
  LocalhostRunTunnelStartRequest,
  LocalhostRunTunnelStatus,
  LocalhostRunTunnelStopRequest,
  RunInjectionRequest,
  JsonValue,
  MemoryEntry,
  MemoryEntryKind,
  MemoryEntryStatus,
  MemoryIndexRebuildResult,
  MemoryQueryResult,
  MemoryScope,
  MemorySearchResult,
  MemoryTier,
  McpServerAddRequest,
  McpServerAddResult,
  McpServerConfigResult,
  McpServerConnectionTestResult,
  McpServerSummary,
  McpServerToolsSummary,
  McpServerUpdateRequest,
  ModelConnectivityProbeRequest,
  ModelConnectivityProbeResult,
  ModelCatalogResult,
  ModelProfileSaveRequest,
  ModelProfilesPayload,
  NotificationConfig,
  OrchestrationConfig,
  PickWorkspaceResponse,
  ProxyConfig,
  ObservabilityBreakdowns,
  ObservabilityOverview,
  RecoverySnapshot,
  RoleConfigDocument,
  RoleConfigOptions,
  RoleConfigSummary,
  RuntimeSkillDetail,
  HooksConfigPayload,
  HookRuntimeViewPayload,
  RunCreateRequest,
  RunCreateResponse,
  DeleteSessionRequest,
  SessionRound,
  SessionRoundsPage,
  SessionMetadataPatch,
  SessionSubagentRecord,
  SessionTokenUsage,
  ServerHealthPayload,
  SessionCreateRequest,
  SessionMode,
  SessionRecord,
  SessionSidebarRecord,
  SshProfileConfig,
  SshProfileConnectivityProbeRequest,
  SshProfileConnectivityProbeResult,
  SshProfilePasswordRevealView,
  SshProfileRecord,
  SkillUninstallResponse,
  TimelineMessage,
  StopBackgroundTaskResponse,
  RunTasksResponse,
  SpecCheckpointEvaluationsResponse,
  SystemConfigStatus,
  TaskSpecArtifactDiffResponse,
  TaskSpecArtifactsResponse,
  PluginsRuntimePayload,
  ToolApprovalAction,
  UserQuestionAnswerSubmission,
  WorkspacePage,
  WorkspaceRecord,
  WorkspaceDiffFile,
  WorkspaceDiffListing,
  WorkspaceFileContent,
  WorkspaceSearchResponse,
  WorkspaceSnapshot,
  WorkspaceTreeListing,
  WorkspaceUpdateRequest,
  WebConfig,
  WebConnectivityProbeRequest,
  WebConnectivityProbeResult,
  WeChatGatewayAccountRecord,
  WeChatGatewayAccountUpdateInput,
  WeChatLoginStartRequest,
  WeChatLoginStartResponse,
  WeChatLoginWaitRequest,
  WeChatLoginWaitResponse,
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

export function pickWorkspace(rootPath?: string | null): Promise<PickWorkspaceResponse> {
  const trimmedRootPath = rootPath?.trim() ?? "";
  return requestJson<PickWorkspaceResponse>("/workspaces/pick", {
    method: "POST",
    body: trimmedRootPath
      ? JSON.stringify({ root_path: trimmedRootPath })
      : undefined,
  });
}

export function getWorkspaceSnapshot(
  workspaceId: string,
): Promise<WorkspaceSnapshot> {
  return requestJson<WorkspaceSnapshot>(
    `/workspaces/${encodeURIComponent(workspaceId)}/snapshot`,
  );
}

export function updateWorkspace(
  workspaceId: string,
  request: WorkspaceUpdateRequest,
): Promise<WorkspaceRecord> {
  return requestJson<WorkspaceRecord>(
    `/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: "PUT",
      body: JSON.stringify(request),
    },
  );
}

export function getWorkspaceTree(
  workspaceId: string,
  path = ".",
  mountName?: string | null,
): Promise<WorkspaceTreeListing> {
  const params = new URLSearchParams({ path });
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  return requestJson<WorkspaceTreeListing>(
    `/workspaces/${encodeURIComponent(workspaceId)}/tree?${params.toString()}`,
  );
}

export function searchWorkspacePaths(
  workspaceId: string,
  query: string,
  limit = 80,
  mountName?: string | null,
): Promise<WorkspaceSearchResponse> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  });
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  return requestJson<WorkspaceSearchResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/search?${params.toString()}`,
  );
}

export function getWorkspaceDiffs(
  workspaceId: string,
  mountName?: string | null,
): Promise<WorkspaceDiffListing> {
  const params = new URLSearchParams();
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<WorkspaceDiffListing>(
    `/workspaces/${encodeURIComponent(workspaceId)}/diffs${query}`,
  );
}

export function getWorkspaceDiffFile(
  workspaceId: string,
  path: string,
  mountName?: string | null,
): Promise<WorkspaceDiffFile> {
  const params = new URLSearchParams({ path });
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  return requestJson<WorkspaceDiffFile>(
    `/workspaces/${encodeURIComponent(workspaceId)}/diff?${params.toString()}`,
  );
}

export function getWorkspaceFileContent(
  workspaceId: string,
  path: string,
  mountName?: string | null,
): Promise<WorkspaceFileContent> {
  const params = new URLSearchParams({ path });
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  return requestJson<WorkspaceFileContent>(
    `/workspaces/${encodeURIComponent(workspaceId)}/file?${params.toString()}`,
  );
}

export function openWorkspaceRoot(
  workspaceId: string,
  mountName?: string | null,
): Promise<{ status: string }> {
  const params = new URLSearchParams();
  if (mountName !== undefined && mountName !== null && mountName.trim()) {
    params.set("mount", mountName);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<{ status: string }>(
    `/workspaces/${encodeURIComponent(workspaceId)}:open-root${query}`,
    {
      method: "POST",
    },
  );
}

export interface ListBoardTodosOptions {
  includeArchived?: boolean;
  workspaceId: string;
}

export function listBoardTodos(
  options: ListBoardTodosOptions,
): Promise<BoardTodoBoardResponse> {
  const params = new URLSearchParams();
  params.set("workspace_id", options.workspaceId);
  if (options.includeArchived === true) {
    params.set("include_archived", "true");
  }
  return requestJson<BoardTodoBoardResponse>(
    `/boards/todos?${params.toString()}`,
  );
}

export function syncBoardTodos(
  options: ListBoardTodosOptions,
): Promise<BoardTodoBoardResponse> {
  return requestJson<BoardTodoBoardResponse>("/boards/todos:sync", {
    method: "POST",
    body: JSON.stringify({
      include_archived: options.includeArchived === true,
      workspace_id: options.workspaceId,
    }),
  });
}

export function listBoardTodoSources(
  workspaceId: string,
): Promise<BoardTodoSourceSettingsResponse> {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  return requestJson<BoardTodoSourceSettingsResponse>(
    `/boards/todo-sources?${params.toString()}`,
  );
}

export function createBoardTodoSource(
  request: BoardTodoSourceCreateRequest,
): Promise<BoardTodoSource> {
  return requestJson<BoardTodoSource>("/boards/todo-sources", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateBoardTodoSource(
  sourceId: string,
  request: BoardTodoSourceUpdateRequest,
): Promise<BoardTodoSource> {
  return requestJson<BoardTodoSource>(
    `/boards/todo-sources/${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function deleteBoardTodoSource(
  sourceId: string,
): Promise<BoardTodoSourceDeleteResponse> {
  return requestJson<BoardTodoSourceDeleteResponse>(
    `/boards/todo-sources/${encodeURIComponent(sourceId)}`,
    {
      method: "DELETE",
    },
  );
}

export function previewStartBoardTodo(
  todoId: string,
  request: BoardTodoPreviewStartRequest,
): Promise<BoardTodoPreviewStartResponse> {
  return requestJson<BoardTodoPreviewStartResponse>(
    `/boards/todos/${encodeURIComponent(todoId)}:preview-start`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function startBoardTodo(
  todoId: string,
  request: BoardTodoStartRequest,
): Promise<BoardTodoItem> {
  return requestJson<BoardTodoItem>(
    `/boards/todos/${encodeURIComponent(todoId)}:start`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function previewRequestChangesBoardTodo(
  todoId: string,
  request: BoardTodoPreviewRequestChangesRequest,
): Promise<BoardTodoPreviewRequestChangesResponse> {
  return requestJson<BoardTodoPreviewRequestChangesResponse>(
    `/boards/todos/${encodeURIComponent(todoId)}:preview-request-changes`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function requestChangesBoardTodo(
  todoId: string,
  request: BoardTodoStatusUpdateRequest,
): Promise<BoardTodoItem> {
  return requestJson<BoardTodoItem>(
    `/boards/todos/${encodeURIComponent(todoId)}:request-changes`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function markBoardTodoDone(
  todoId: string,
  request: BoardTodoMarkDoneRequest = {},
): Promise<BoardTodoItem> {
  return requestJson<BoardTodoItem>(
    `/boards/todos/${encodeURIComponent(todoId)}:mark-done`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function archiveBoardTodo(
  todoId: string,
  request: BoardTodoArchiveRequest = {},
): Promise<BoardTodoItem> {
  return requestJson<BoardTodoItem>(
    `/boards/todos/${encodeURIComponent(todoId)}:archive`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function restoreBoardTodo(todoId: string): Promise<BoardTodoItem> {
  return requestJson<BoardTodoItem>(
    `/boards/todos/${encodeURIComponent(todoId)}:restore`,
    {
      method: "POST",
    },
  );
}

export function listAutomationProjects(): Promise<AutomationProjectRecord[]> {
  return requestJson<AutomationProjectRecord[]>("/automation/projects");
}

export function getAutomationProject(
  automationProjectId: string,
): Promise<AutomationProjectRecord> {
  return requestJson<AutomationProjectRecord>(
    `/automation/projects/${encodeURIComponent(automationProjectId)}`,
  );
}

export function listAutomationProjectSessions(
  automationProjectId: string,
): Promise<AutomationProjectSessionRecord[]> {
  return requestJson<AutomationProjectSessionRecord[]>(
    `/automation/projects/${encodeURIComponent(automationProjectId)}/sessions`,
  );
}

export function runAutomationProject(
  automationProjectId: string,
): Promise<AutomationRunNowResult> {
  return requestJson<AutomationRunNowResult>(
    `/automation/projects/${encodeURIComponent(automationProjectId)}:run`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function enableAutomationProject(
  automationProjectId: string,
): Promise<AutomationProjectRecord> {
  return requestJson<AutomationProjectRecord>(
    `/automation/projects/${encodeURIComponent(automationProjectId)}:enable`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function disableAutomationProject(
  automationProjectId: string,
): Promise<AutomationProjectRecord> {
  return requestJson<AutomationProjectRecord>(
    `/automation/projects/${encodeURIComponent(automationProjectId)}:disable`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function getConfigStatus(): Promise<SystemConfigStatus> {
  return requestJson<SystemConfigStatus>("/system/configs");
}

export function getCommandCatalog(): Promise<CommandCatalogResponse> {
  return requestJson<CommandCatalogResponse>("/system/commands:catalog");
}

export function createCommand(
  request: CommandCreateRequest,
): Promise<CommandMutationResponse> {
  return requestJson<CommandMutationResponse>("/system/commands", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateCommand(
  request: CommandUpdateRequest,
): Promise<CommandMutationResponse> {
  return requestJson<CommandMutationResponse>("/system/commands", {
    method: "PUT",
    body: JSON.stringify(request),
  });
}

export function resolveCommandPrompt(
  request: CommandResolveRequest,
): Promise<CommandResolveResponse> {
  return requestJson<CommandResolveResponse>("/system/commands:resolve", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listMcpServers(): Promise<McpServerSummary[]> {
  return requestJson<McpServerSummary[]>("/mcp/servers");
}

export function addMcpServer(
  request: McpServerAddRequest,
): Promise<McpServerAddResult> {
  return requestJson<McpServerAddResult>("/mcp/servers", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getMcpServer(serverName: string): Promise<McpServerConfigResult> {
  return requestJson<McpServerConfigResult>(
    `/mcp/servers/${encodeURIComponent(serverName)}`,
  );
}

export function updateMcpServer(
  serverName: string,
  request: McpServerUpdateRequest,
): Promise<McpServerConfigResult> {
  return requestJson<McpServerConfigResult>(
    `/mcp/servers/${encodeURIComponent(serverName)}`,
    {
      method: "PUT",
      body: JSON.stringify(request),
    },
  );
}

export function deleteMcpServer(serverName: string): Promise<McpServerSummary> {
  return requestJson<McpServerSummary>(
    `/mcp/servers/${encodeURIComponent(serverName)}`,
    {
      method: "DELETE",
    },
  );
}

export function setMcpServerEnabled(
  serverName: string,
  enabled: boolean,
): Promise<McpServerSummary> {
  return requestJson<McpServerSummary>(
    `/mcp/servers/${encodeURIComponent(serverName)}/enabled`,
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function testMcpServerConnection(
  serverName: string,
): Promise<McpServerConnectionTestResult> {
  return requestJson<McpServerConnectionTestResult>(
    `/mcp/servers/${encodeURIComponent(serverName)}/test`,
    {
      method: "POST",
    },
  );
}

export function getMcpServerTools(
  serverName: string,
): Promise<McpServerToolsSummary> {
  return requestJson<McpServerToolsSummary>(
    `/mcp/servers/${encodeURIComponent(serverName)}/tools`,
  );
}

export function refreshMcpServerTools(
  serverName: string,
): Promise<McpServerToolsSummary> {
  return requestJson<McpServerToolsSummary>(
    `/mcp/servers/${encodeURIComponent(serverName)}/tools:refresh`,
    {
      method: "POST",
    },
  );
}

export function reloadMcpConfig(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/mcp:reload", {
    method: "POST",
  });
}

export function getClawHubConfig(): Promise<ClawHubConfig> {
  return requestJson<ClawHubConfig>("/system/configs/clawhub");
}

export function saveClawHubConfig(
  config: ClawHubConfig,
): Promise<ClawHubConfigSaveResponse> {
  return requestJson<ClawHubConfigSaveResponse>("/system/configs/clawhub", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function probeClawHubConnectivity(
  request: ClawHubConnectivityProbeRequest,
): Promise<ClawHubConnectivityProbeResult> {
  return requestJson<ClawHubConnectivityProbeResult>(
    "/system/configs/clawhub:probe",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export interface BrowseClawHubSkillMarketOptions {
  cursor?: string | null;
  limit?: number;
  sort?: string;
}

export function browseClawHubSkillMarket(
  options: BrowseClawHubSkillMarketOptions = {},
): Promise<ClawHubSkillMarketSearchResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 24));
  const cursor = options.cursor?.trim() ?? "";
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("sort", options.sort?.trim() || "popular");
  return requestJson<ClawHubSkillMarketSearchResponse>(
    `/system/skills/market/clawhub?${params.toString()}`,
  );
}

export function searchClawHubSkillMarket(
  query: string,
  limit = 24,
): Promise<ClawHubSkillMarketSearchResponse> {
  const params = new URLSearchParams();
  params.set("query", query.trim());
  params.set("limit", String(limit));
  return requestJson<ClawHubSkillMarketSearchResponse>(
    `/system/skills/market/clawhub/search?${params.toString()}`,
  );
}

export function getClawHubSkillMarketDetail(
  slug: string,
  version?: string | null,
): Promise<ClawHubSkillMarketDetail> {
  const params = new URLSearchParams();
  const trimmedVersion = version?.trim() ?? "";
  if (trimmedVersion) {
    params.set("version", trimmedVersion);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<ClawHubSkillMarketDetail>(
    `/system/skills/market/clawhub/${encodeURIComponent(slug.trim())}${query}`,
  );
}

export function installClawHubMarketSkill(
  request: ClawHubSkillMarketInstallRequest,
): Promise<ClawHubSkillMarketInstallResponse> {
  return requestJson<ClawHubSkillMarketInstallResponse>(
    "/system/skills/market/clawhub/install",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function uninstallClawHubMarketSkill(
  slug: string,
): Promise<ClawHubSkillMarketUninstallResponse> {
  return requestJson<ClawHubSkillMarketUninstallResponse>(
    `/system/skills/market/clawhub/${encodeURIComponent(slug.trim())}`,
    {
      method: "DELETE",
    },
  );
}

export function getRuntimeSkillDetail(
  skillRef: string,
): Promise<RuntimeSkillDetail> {
  return requestJson<RuntimeSkillDetail>(
    `/system/skills/${encodeURIComponent(skillRef.trim())}`,
  );
}

export function uninstallRuntimeSkill(
  skillRef: string,
): Promise<SkillUninstallResponse> {
  return requestJson<SkillUninstallResponse>(
    `/system/skills/${encodeURIComponent(skillRef.trim())}`,
    {
      method: "DELETE",
    },
  );
}

export function reloadSkillsConfig(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/skills:reload", {
    method: "POST",
  });
}

export function getRoleConfigOptions(): Promise<RoleConfigOptions> {
  return requestJson<RoleConfigOptions>("/roles:options");
}

export function listRoleConfigs(): Promise<RoleConfigSummary[]> {
  return requestJson<RoleConfigSummary[]>("/roles/configs");
}

export function getRoleConfig(roleId: string): Promise<RoleConfigDocument> {
  return requestJson<RoleConfigDocument>(
    `/roles/configs/${encodeURIComponent(roleId.trim())}`,
  );
}

export function saveRoleConfig(
  roleId: string,
  config: RoleConfigDocument,
): Promise<RoleConfigDocument> {
  return requestJson<RoleConfigDocument>(
    `/roles/configs/${encodeURIComponent(roleId.trim())}`,
    {
      method: "PUT",
      body: JSON.stringify(config),
    },
  );
}

export function getModelProfiles(): Promise<ModelProfilesPayload> {
  return requestJson<ModelProfilesPayload>("/system/configs/model/profiles");
}

export function getModelCatalog(refresh = false): Promise<ModelCatalogResult> {
  const suffix = refresh ? "?refresh=true" : "";
  return requestJson<ModelCatalogResult>(`/system/configs/model/catalog${suffix}`);
}

export function refreshModelCatalog(): Promise<ModelCatalogResult> {
  return requestJson<ModelCatalogResult>("/system/configs/model/catalog:refresh", {
    method: "POST",
  });
}

export function saveModelProfile(
  profileId: string,
  profile: ModelProfileSaveRequest,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/system/configs/model/profiles/${encodeURIComponent(profileId.trim())}`,
    {
      method: "PUT",
      body: JSON.stringify(profile),
    },
  );
}

export function deleteModelProfile(profileId: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/system/configs/model/profiles/${encodeURIComponent(profileId.trim())}`,
    {
      method: "DELETE",
    },
  );
}

export function reloadModelConfig(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/model:reload", {
    method: "POST",
  });
}

export function probeModelConnection(
  payload: ModelConnectivityProbeRequest,
): Promise<ModelConnectivityProbeResult> {
  return requestJson<ModelConnectivityProbeResult>("/system/configs/model:probe", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getOrchestrationConfig(): Promise<OrchestrationConfig> {
  return requestJson<OrchestrationConfig>("/system/configs/orchestration");
}

export function saveOrchestrationConfig(
  config: OrchestrationConfig,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/orchestration", {
    method: "PUT",
    body: JSON.stringify(config),
  });
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

export function getGitHubConfig(): Promise<GitHubConfigView> {
  return requestJson<GitHubConfigView>("/system/configs/github");
}

export function revealGitHubToken(): Promise<GitHubTokenRevealView> {
  return requestJson<GitHubTokenRevealView>("/system/configs/github:reveal", {
    method: "POST",
  });
}

export function saveGitHubConfig(
  config: GitHubConfigUpdate,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/system/configs/github", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function probeGitHubConnectivity(
  request: GitHubConnectivityProbeRequest,
): Promise<GitHubConnectivityProbeResult> {
  return requestJson<GitHubConnectivityProbeResult>(
    "/system/configs/github:probe",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function probeGitHubWebhookConnectivity(
  request: GitHubWebhookConnectivityProbeRequest,
): Promise<GitHubWebhookConnectivityProbeResult> {
  return requestJson<GitHubWebhookConnectivityProbeResult>(
    "/system/configs/github/webhook:probe",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function getGitHubWebhookTunnelStatus(): Promise<LocalhostRunTunnelStatus> {
  return requestJson<LocalhostRunTunnelStatus>(
    "/system/configs/github/webhook/tunnel",
  );
}

export function startGitHubWebhookTunnel(
  request: LocalhostRunTunnelStartRequest = {},
): Promise<LocalhostRunTunnelStatus> {
  return requestJson<LocalhostRunTunnelStatus>(
    "/system/configs/github/webhook/tunnel:start",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function stopGitHubWebhookTunnel(
  request: LocalhostRunTunnelStopRequest = {},
): Promise<LocalhostRunTunnelStatus> {
  return requestJson<LocalhostRunTunnelStatus>(
    "/system/configs/github/webhook/tunnel:stop",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function listFeishuGatewayAccounts(): Promise<FeishuGatewayAccountRecord[]> {
  return requestJson<FeishuGatewayAccountRecord[]>("/gateway/feishu/accounts");
}

export function createFeishuGatewayAccount(
  request: FeishuGatewayAccountCreateInput,
): Promise<FeishuGatewayAccountRecord> {
  return requestJson<FeishuGatewayAccountRecord>("/gateway/feishu/accounts", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateFeishuGatewayAccount(
  accountId: string,
  request: FeishuGatewayAccountUpdateInput,
): Promise<FeishuGatewayAccountRecord> {
  return requestJson<FeishuGatewayAccountRecord>(
    `/gateway/feishu/accounts/${encodeURIComponent(accountId.trim())}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function deleteFeishuGatewayAccount(
  accountId: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/gateway/feishu/accounts/${encodeURIComponent(accountId.trim())}`,
    {
      method: "DELETE",
      body: JSON.stringify({ force: true }),
    },
  );
}

export function enableFeishuGatewayAccount(
  accountId: string,
): Promise<FeishuGatewayAccountRecord> {
  return requestJson<FeishuGatewayAccountRecord>(
    `/gateway/feishu/accounts/${encodeURIComponent(accountId.trim())}:enable`,
    { method: "POST" },
  );
}

export function disableFeishuGatewayAccount(
  accountId: string,
): Promise<FeishuGatewayAccountRecord> {
  return requestJson<FeishuGatewayAccountRecord>(
    `/gateway/feishu/accounts/${encodeURIComponent(accountId.trim())}:disable`,
    { method: "POST" },
  );
}

export function reloadFeishuGateway(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/gateway/feishu/reload", {
    method: "POST",
  });
}

export function listWeChatGatewayAccounts(): Promise<WeChatGatewayAccountRecord[]> {
  return requestJson<WeChatGatewayAccountRecord[]>("/gateway/wechat/accounts");
}

export function startWeChatGatewayLogin(
  request: WeChatLoginStartRequest = {},
): Promise<WeChatLoginStartResponse> {
  return requestJson<WeChatLoginStartResponse>("/gateway/wechat/login/start", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function waitWeChatGatewayLogin(
  request: WeChatLoginWaitRequest,
): Promise<WeChatLoginWaitResponse> {
  return requestJson<WeChatLoginWaitResponse>("/gateway/wechat/login/wait", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function updateWeChatGatewayAccount(
  accountId: string,
  request: WeChatGatewayAccountUpdateInput,
): Promise<WeChatGatewayAccountRecord> {
  return requestJson<WeChatGatewayAccountRecord>(
    `/gateway/wechat/accounts/${encodeURIComponent(accountId.trim())}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function deleteWeChatGatewayAccount(
  accountId: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/gateway/wechat/accounts/${encodeURIComponent(accountId.trim())}`,
    {
      method: "DELETE",
      body: JSON.stringify({ force: true }),
    },
  );
}

export function enableWeChatGatewayAccount(
  accountId: string,
): Promise<WeChatGatewayAccountRecord> {
  return requestJson<WeChatGatewayAccountRecord>(
    `/gateway/wechat/accounts/${encodeURIComponent(accountId.trim())}:enable`,
    { method: "POST" },
  );
}

export function disableWeChatGatewayAccount(
  accountId: string,
): Promise<WeChatGatewayAccountRecord> {
  return requestJson<WeChatGatewayAccountRecord>(
    `/gateway/wechat/accounts/${encodeURIComponent(accountId.trim())}:disable`,
    { method: "POST" },
  );
}

export function reloadWeChatGateway(): Promise<{ status: string }> {
  return requestJson<{ status: string }>("/gateway/wechat/reload", {
    method: "POST",
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

export function listConnectors(): Promise<ConnectorListResponse> {
  return requestJson<ConnectorListResponse>("/connectors");
}

export function testConnector(connectorId: string): Promise<ConnectorTestResult> {
  return requestJson<ConnectorTestResult>(
    `/connectors/${encodeURIComponent(connectorId)}:test`,
    {
      method: "POST",
    },
  );
}

export function listRuntimeTools(): Promise<BinaryToolListResponse> {
  return requestJson<BinaryToolListResponse>("/connectors/runtime-tools");
}

export function startRuntimeToolDownload(
  toolId: string,
): Promise<BinaryToolDownloadJob> {
  return requestJson<BinaryToolDownloadJob>(
    `/connectors/runtime-tools/${encodeURIComponent(toolId)}:download`,
    {
      method: "POST",
    },
  );
}

export function getRuntimeToolDownload(
  jobId: string,
): Promise<BinaryToolDownloadJob> {
  return requestJson<BinaryToolDownloadJob>(
    `/connectors/runtime-tools/downloads/${encodeURIComponent(jobId)}`,
  );
}

export function addRuntimeToolsSystemPath(): Promise<BinaryToolSystemPathResult> {
  return requestJson<BinaryToolSystemPathResult>(
    "/connectors/runtime-tools/system-path:add",
    {
      method: "POST",
    },
  );
}

export interface ListMemoriesOptions {
  kind?: MemoryEntryKind | "all";
  limit?: number;
  offset?: number;
  scope?: MemoryScope | "all";
  status?: MemoryEntryStatus | "all";
  tier?: MemoryTier | "all";
  workspaceId?: string | null;
}

export function listMemories(
  options: ListMemoriesOptions = {},
): Promise<MemoryQueryResult> {
  const params = new URLSearchParams();
  appendQueryParam(params, "workspace_id", options.workspaceId);
  if (options.tier !== undefined && options.tier !== "all") {
    appendQueryParam(params, "tier", options.tier);
  }
  if (options.scope !== undefined && options.scope !== "all") {
    appendQueryParam(params, "scope", options.scope);
  }
  if (options.status !== undefined && options.status !== "all") {
    appendQueryParam(params, "status", options.status);
  }
  if (options.kind !== undefined && options.kind !== "all") {
    appendQueryParam(params, "kind", options.kind);
  }
  params.set("limit", String(options.limit ?? 40));
  params.set("offset", String(options.offset ?? 0));
  return requestJson<MemoryQueryResult>(`/memories?${params.toString()}`);
}

export function getMemory(
  workspaceId: string,
  memoryId: string,
): Promise<MemoryEntry> {
  return requestJson<MemoryEntry>(
    `/workspaces/${encodeURIComponent(workspaceId)}/memories/${encodeURIComponent(memoryId)}`,
  );
}

export function searchMemories(
  request: GlobalMemorySearchRequest,
): Promise<MemorySearchResult> {
  return requestJson<MemorySearchResult>("/memories/search", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function rebuildMemoryIndex(
  workspaceId?: string | null,
): Promise<MemoryIndexRebuildResult> {
  const trimmedWorkspaceId = workspaceId?.trim() ?? "";
  const body = trimmedWorkspaceId
    ? JSON.stringify({ workspace_id: trimmedWorkspaceId })
    : JSON.stringify({});
  return requestJson<MemoryIndexRebuildResult>("/memories/rebuild-index", {
    method: "POST",
    body,
  });
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

export function listSessionSubagents(
  sessionId: string,
  forceRefresh = false,
): Promise<SessionSubagentRecord[]> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set("force_refresh", "true");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return requestJson<SessionSubagentRecord[]>(
    `/sessions/${encodeURIComponent(sessionId)}/subagents${suffix}`,
  );
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

export function listAgentMessages(
  sessionId: string,
  instanceId: string,
): Promise<TimelineMessage[]> {
  return requestJson<TimelineMessage[]>(
    `/sessions/${encodeURIComponent(sessionId)}/agents/${encodeURIComponent(instanceId)}/messages`,
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

export function listRunTasks(
  runId: string,
  includeRoot = false,
): Promise<RunTasksResponse> {
  const params = new URLSearchParams();
  if (includeRoot) {
    params.set("include_root", "true");
  }
  const query = params.toString();
  return requestJson<RunTasksResponse>(
    `/tasks/runs/${encodeURIComponent(runId)}${query ? `?${query}` : ""}`,
  );
}

export function listTaskSpecArtifacts(
  taskId: string,
): Promise<TaskSpecArtifactsResponse> {
  return requestJson<TaskSpecArtifactsResponse>(
    `/tasks/${encodeURIComponent(taskId)}/spec-artifacts`,
  );
}

export function getTaskSpecArtifactDiff(
  taskId: string,
  version: number,
  fromVersion?: number | null,
): Promise<TaskSpecArtifactDiffResponse> {
  const params = new URLSearchParams();
  if (fromVersion !== undefined && fromVersion !== null) {
    params.set("from_version", String(fromVersion));
  }
  const query = params.toString();
  return requestJson<TaskSpecArtifactDiffResponse>(
    `/tasks/${encodeURIComponent(taskId)}/spec-artifacts/${version}/diff${
      query ? `?${query}` : ""
    }`,
  );
}

export function listSpecCheckpointEvaluations(
  taskId: string,
): Promise<SpecCheckpointEvaluationsResponse> {
  return requestJson<SpecCheckpointEvaluationsResponse>(
    `/tasks/${encodeURIComponent(taskId)}/spec-checkpoint-evaluations`,
  );
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
  feedback = "",
): Promise<{ status: string }> {
  const payload: {
    action: ToolApprovalAction;
    feedback?: string;
    option_id?: string;
  } = { action };
  if (optionId.trim()) {
    payload.option_id = optionId.trim();
  }
  if (feedback.trim()) {
    payload.feedback = feedback.trim();
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

export function getPluginsRuntime(): Promise<PluginsRuntimePayload> {
  return requestJson<PluginsRuntimePayload>("/system/configs/plugins/runtime");
}

export function getHooksConfig(): Promise<HooksConfigPayload> {
  return requestJson<HooksConfigPayload>("/system/configs/hooks");
}

export function getHookRuntimeView(): Promise<HookRuntimeViewPayload> {
  return requestJson<HookRuntimeViewPayload>("/system/configs/hooks/runtime");
}

export function getAgentRuntimes(): Promise<AgentRuntimeSummary[]> {
  return requestJson<AgentRuntimeSummary[]>("/system/configs/agent-runtimes");
}

export function getAgentRuntime(agentId: string): Promise<AgentRuntimeConfig> {
  return requestJson<AgentRuntimeConfig>(
    `/system/configs/agent-runtimes/${encodeURIComponent(agentId)}`,
  );
}

export function saveAgentRuntime(
  agentId: string,
  payload: AgentRuntimeConfig,
): Promise<AgentRuntimeConfig> {
  return requestJson<AgentRuntimeConfig>(
    `/system/configs/agent-runtimes/${encodeURIComponent(agentId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteAgentRuntime(agentId: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/system/configs/agent-runtimes/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  );
}

export function getAgentRuntimeRegistry(
  refresh = false,
): Promise<AcpRegistryCatalogResponse> {
  const suffix = refresh ? "?refresh=true" : "";
  return requestJson<AcpRegistryCatalogResponse>(
    `/system/configs/agent-runtime-registry${suffix}`,
  );
}

export function refreshAgentRuntimeRegistry(): Promise<AcpRegistryCatalogResponse> {
  return requestJson<AcpRegistryCatalogResponse>(
    "/system/configs/agent-runtime-registry:refresh",
    { method: "POST" },
  );
}

export function installAgentRuntimeFromRegistry(
  registryId: string,
  payload: AcpRegistryInstallRequest,
): Promise<AcpRegistryInstallResult> {
  return requestJson<AcpRegistryInstallResult>(
    `/system/configs/agent-runtime-registry/${encodeURIComponent(registryId)}:install`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function startAgentRuntimeTestJob(
  agentId: string,
): Promise<AgentRuntimeTestJob> {
  return requestJson<AgentRuntimeTestJob>(
    `/system/configs/agent-runtimes/${encodeURIComponent(agentId)}:test-job`,
    { method: "POST" },
  );
}

export function getAgentRuntimeTestJob(jobId: string): Promise<AgentRuntimeTestJob> {
  return requestJson<AgentRuntimeTestJob>(
    `/system/configs/agent-runtime-test-jobs/${encodeURIComponent(jobId)}`,
  );
}

export function getEnvironmentVariables(): Promise<EnvironmentVariableCatalog> {
  return requestJson<EnvironmentVariableCatalog>(
    "/system/configs/environment-variables",
  );
}

export function saveEnvironmentVariable(
  scope: EnvironmentVariableScope,
  key: string,
  request: EnvironmentVariableSaveRequest,
): Promise<EnvironmentVariableRecord> {
  return requestJson<EnvironmentVariableRecord>(
    `/system/configs/environment-variables/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify(request),
    },
  );
}

export function deleteEnvironmentVariable(
  scope: EnvironmentVariableScope,
  key: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/system/configs/environment-variables/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`,
    {
      method: "DELETE",
    },
  );
}

export function listSshProfiles(): Promise<SshProfileRecord[]> {
  return requestJson<SshProfileRecord[]>("/system/configs/workspace/ssh-profiles");
}

export function saveSshProfile(
  sshProfileId: string,
  config: SshProfileConfig,
): Promise<SshProfileRecord> {
  return requestJson<SshProfileRecord>(
    `/system/configs/workspace/ssh-profiles/${encodeURIComponent(sshProfileId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ config }),
    },
  );
}

export function revealSshProfilePassword(
  sshProfileId: string,
): Promise<SshProfilePasswordRevealView> {
  return requestJson<SshProfilePasswordRevealView>(
    `/system/configs/workspace/ssh-profiles/${encodeURIComponent(sshProfileId)}:reveal-password`,
    {
      method: "POST",
    },
  );
}

export function probeSshProfileConnection(
  request: SshProfileConnectivityProbeRequest,
): Promise<SshProfileConnectivityProbeResult> {
  return requestJson<SshProfileConnectivityProbeResult>(
    "/system/configs/workspace/ssh-profiles:probe",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function deleteSshProfile(sshProfileId: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/system/configs/workspace/ssh-profiles/${encodeURIComponent(sshProfileId)}`,
    {
      method: "DELETE",
    },
  );
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

function appendQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  const text = String(value ?? "").trim();
  if (text) {
    params.set(key, text);
  }
}

export function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return {};
}
