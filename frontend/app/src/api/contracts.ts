export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SessionMode = "normal" | "orchestration";
export type RunStatus =
  | "queued"
  | "running"
  | "stopping"
  | "paused"
  | "stopped"
  | "completed"
  | "failed";

export interface ServerHealthPayload {
  status?: string;
  version?: string;
  components?: Record<string, JsonValue>;
}

export type CommandScope = "app" | "project";
export type CommandDiscoverySource =
  | "app"
  | "plugin"
  | "project_codex"
  | "project_claude"
  | "project_opencode"
  | "project_relay_teams";
export type CommandCreateScope = "global" | "project";
export type CommandCreateSource =
  | "claude"
  | "codex"
  | "opencode"
  | "relay_teams";

export interface CommandDetail {
  name: string;
  aliases?: string[];
  description?: string;
  argument_hint?: string;
  allowed_modes?: string[];
  scope: CommandScope;
  discovery_source: CommandDiscoverySource;
  source_path: string;
  template: string;
}

export interface CommandSummary {
  name: string;
  aliases?: string[];
  description?: string;
  argument_hint?: string;
  allowed_modes?: string[];
  scope: CommandScope;
  discovery_source: CommandDiscoverySource;
  source_path: string;
}

export interface CommandCatalogWorkspace {
  workspace_id: string;
  root_path?: string | null;
  can_create_commands?: boolean;
  commands?: CommandDetail[];
}

export interface CommandCatalogResponse {
  app_commands?: CommandDetail[];
  workspaces?: CommandCatalogWorkspace[];
}

export interface CommandCreateRequest {
  scope: CommandCreateScope;
  workspace_id: string | null;
  source: CommandCreateSource | null;
  relative_path: string;
  name: string;
  aliases: string[];
  description: string;
  argument_hint: string;
  allowed_modes: string[];
  template: string;
}

export interface CommandUpdateRequest {
  source_path: string;
  name: string;
  aliases: string[];
  description: string;
  argument_hint: string;
  allowed_modes: string[];
  template: string;
}

export interface CommandMutationResponse {
  command: CommandDetail;
  workspace_id?: string | null;
}

export interface CommandResolveRequest {
  workspace_id: string;
  raw_text: string;
  mode?: string;
  cwd?: string | null;
}

export interface CommandResolveResponse {
  matched: boolean;
  raw_text: string;
  parsed_name?: string | null;
  resolved_name?: string | null;
  args?: string;
  command?: CommandSummary | null;
  expanded_prompt?: string | null;
  expanded_prompt_length?: number;
}

export type McpConfigScope = "app" | "plugin" | "session";
export type McpDiscoveryStatus =
  | "disabled"
  | "pending"
  | "loading"
  | "ready"
  | "failed";

export interface McpToolInfo {
  description: string;
  name: string;
}

export interface McpServerSummary {
  discovery_status?: McpDiscoveryStatus;
  enabled?: boolean;
  error?: string | null;
  last_checked_at?: string | null;
  name: string;
  source: McpConfigScope;
  tool_count?: number;
  transport: string;
}

export interface McpServerToolsSummary {
  enabled?: boolean;
  error?: string | null;
  last_checked_at?: string | null;
  server: string;
  source: McpConfigScope;
  status?: McpDiscoveryStatus;
  tools?: McpToolInfo[];
  transport: string;
}

export interface McpServerAddRequest {
  config: Record<string, JsonValue>;
  name: string;
  overwrite?: boolean;
}

export interface McpServerAddResult {
  config_path: string;
  server: McpServerSummary;
}

export interface McpServerConfigResult {
  config: Record<string, JsonValue>;
  server: McpServerSummary;
}

export interface McpServerUpdateRequest {
  config: Record<string, JsonValue>;
}

export interface McpServerConnectionTestResult {
  enabled?: boolean;
  error?: string | null;
  ok: boolean;
  server: string;
  source: McpConfigScope;
  tool_count?: number;
  tools?: McpToolInfo[];
  transport: string;
}

export interface PluginRuntimeRecord {
  command_sources?: JsonValue[];
  description?: string | null;
  diagnostics?: JsonValue;
  enabled?: boolean | null;
  hook_sources?: JsonValue[];
  manifest_path?: string | null;
  mcp_sources?: JsonValue[];
  name?: string | null;
  plugin_id?: string | null;
  role_sources?: JsonValue[];
  settings_sources?: JsonValue[];
  skill_sources?: JsonValue[];
  scope?: "local" | "project" | "user" | null;
  source?: JsonValue;
  user_config?: Record<string, JsonValue>;
  valid?: boolean | null;
  version?: string | null;
}

export interface PluginRuntimeDiagnostics {
  code?: string | null;
  level?: string | null;
  message?: string | null;
  plugin?: string | null;
}

export interface PluginsRuntimePayload {
  diagnostics?: PluginRuntimeDiagnostics[];
  plugins?: PluginRuntimeRecord[];
}

export interface PluginScopeRequest {
  scope: "local" | "project" | "user";
}

export interface PluginUpdateRequest extends PluginScopeRequest {
  allow_community_plugins?: boolean;
  allow_executes_code?: boolean;
  allow_missing_digest?: boolean;
  allow_unclean_scan?: boolean;
  version?: string | null;
}

export interface HooksConfigPayload {
  hooks?: Record<string, JsonValue>;
}

export interface HooksValidationResult {
  status: string;
}

export interface HookRuntimeSource {
  path?: string | null;
  source?: string | null;
}

export interface LoadedHookRecord {
  event?: string | null;
  handler?: string | null;
  matcher?: string | null;
  name?: string | null;
  source?: string | null;
}

export interface HookRuntimeViewPayload {
  loaded_hooks?: LoadedHookRecord[];
  sources?: HookRuntimeSource[];
}

export interface AgentRuntimeSummary {
  agent_id: string;
  description?: string | null;
  name?: string | null;
  protocol?: string | null;
  transport?: string | null;
}

export type AgentRuntimeProtocol = "acp" | "a2a" | "cli";

export type AgentRuntimeTransportType =
  | "stdio"
  | "streamable_http"
  | "custom"
  | "registry";

export interface AgentRuntimeSecretBinding {
  configured?: boolean;
  name: string;
  secret?: boolean;
  value?: string | null;
}

export interface AgentRuntimeStdioTransport {
  args?: string[];
  command: string;
  env?: AgentRuntimeSecretBinding[];
  transport: "stdio";
}

export interface AgentRuntimeHttpTransport {
  headers?: AgentRuntimeSecretBinding[];
  ssl_verify?: boolean | null;
  transport: "streamable_http";
  url: string;
}

export interface AgentRuntimeCustomTransport {
  adapter_id: string;
  config?: Record<string, JsonValue>;
  transport: "custom";
}

export type AcpRegistryDistribution = "auto" | "binary" | "npx" | "uvx";

export interface RegistryBinaryTargetSnapshot {
  archive: string;
  args?: string[];
  cmd: string;
  env?: Record<string, string>;
  sha256?: string | null;
}

export interface RegistryPackageDistributionSnapshot {
  args?: string[];
  env?: Record<string, string>;
  package: string;
}

export interface RegistryDistributionSetSnapshot {
  binary?: Record<string, RegistryBinaryTargetSnapshot>;
  npx?: RegistryPackageDistributionSnapshot | null;
  uvx?: RegistryPackageDistributionSnapshot | null;
}

export interface RegistryEntrySnapshot {
  authors?: string[];
  description?: string;
  distribution: RegistryDistributionSetSnapshot;
  icon?: string | null;
  id: string;
  license?: string | null;
  name: string;
  repository?: string | null;
  version: string;
  website?: string | null;
}

export interface AgentRuntimeRegistryTransport {
  distribution?: AcpRegistryDistribution;
  env?: AgentRuntimeSecretBinding[];
  registry_entry?: RegistryEntrySnapshot | null;
  registry_id: string;
  registry_version?: string;
  transport: "registry";
}

export type AgentRuntimeTransportConfig =
  | AgentRuntimeStdioTransport
  | AgentRuntimeHttpTransport
  | AgentRuntimeCustomTransport
  | AgentRuntimeRegistryTransport;

export interface AgentRuntimeConfig {
  agent_id: string;
  description?: string;
  name: string;
  native_config_enabled?: boolean;
  native_config_provider?: string;
  protocol?: AgentRuntimeProtocol;
  skill_bridge_enabled?: boolean;
  skill_bridge_mode?: "inline" | "directory";
  skill_bridge_skills?: string[];
  transport: AgentRuntimeTransportConfig;
}

export interface AcpRegistryAgentView {
  authors?: string[];
  description?: string;
  distributions?: AcpRegistryDistribution[];
  icon?: string | null;
  installed?: boolean;
  installed_agent_id?: string | null;
  installed_version?: string | null;
  license?: string | null;
  name: string;
  registry_id: string;
  repository?: string | null;
  selected_distribution?: AcpRegistryDistribution | null;
  supports_current_platform?: boolean;
  update_available?: boolean;
  version: string;
  website?: string | null;
}

export interface AcpRegistryCatalogResponse {
  agents?: AcpRegistryAgentView[];
  cache_path: string;
  error_message?: string | null;
  fetched_at?: string | null;
  registry_version?: string;
  source_url?: string;
  stale?: boolean;
}

export interface AcpRegistryInstallRequest {
  agent_id?: string | null;
  distribution?: AcpRegistryDistribution | null;
  env?: Record<string, string> | null;
}

export interface AcpRegistryInstallResult {
  agent: AgentRuntimeConfig;
  installed_at?: string;
  message: string;
  registry_agent: AcpRegistryAgentView;
  status: string;
}

export interface AgentRuntimeTestResult {
  agent_name?: string | null;
  agent_version?: string | null;
  message?: string;
  ok: boolean;
  protocol?: AgentRuntimeProtocol;
  protocol_version?: number | null;
  protocol_version_text?: string | null;
}

export interface AgentRuntimeTestJob {
  agent_id: string;
  created_at?: string;
  distribution?: string;
  downloaded_bytes?: number;
  error_message?: string | null;
  job_id: string;
  message?: string;
  phase?: string;
  progress_percent?: number | null;
  registry_id?: string;
  result?: AgentRuntimeTestResult | null;
  status?: "queued" | "running" | "succeeded" | "failed";
  total_bytes?: number | null;
  updated_at?: string;
}

export interface WorkspaceRecord {
  workspace_id: string;
  root_path: string;
  default_mount_name?: string;
  name?: string;
  display_name?: string;
  mounts?: WorkspaceMountRecord[];
  created_at?: string;
  updated_at?: string;
}

export type WorkspaceMountProvider = "local" | "ssh";

export interface WorkspaceMountCapabilities {
  can_read?: boolean;
  can_write?: boolean;
  can_search?: boolean;
  can_shell?: boolean;
  can_diff?: boolean;
  can_preview?: boolean;
}

export interface WorkspaceLocalMountConfig {
  root_path: string;
}

export interface WorkspaceSshMountConfig {
  ssh_profile_id: string;
  remote_root: string;
}

export interface WorkspaceMountRecord {
  mount_name: string;
  provider: WorkspaceMountProvider;
  provider_config: WorkspaceLocalMountConfig | WorkspaceSshMountConfig;
  working_directory?: string;
  readable_paths?: string[];
  writable_paths?: string[];
  capabilities?: WorkspaceMountCapabilities | null;
  branch_name?: string | null;
  source_root_path?: string | null;
  forked_from_workspace_id?: string | null;
}

export interface WorkspacePage {
  items: WorkspaceRecord[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface PickWorkspaceResponse {
  workspace: WorkspaceRecord | null;
}

export type WorkspaceTreeNodeKind = "directory" | "file";

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  kind: WorkspaceTreeNodeKind;
  has_children?: boolean;
  children?: WorkspaceTreeNode[];
}

export interface WorkspaceSnapshot {
  workspace_id: string;
  default_mount_name?: string;
  default_mount_root?: string | null;
  root_path?: string | null;
  tree: WorkspaceTreeNode;
}

export interface WorkspaceTreeListing {
  workspace_id: string;
  mount_name?: string;
  directory_path: string;
  children: WorkspaceTreeNode[];
}

export interface WorkspaceSearchResult {
  name: string;
  path: string;
  kind: WorkspaceTreeNodeKind;
  mount_name?: string;
}

export interface WorkspaceSearchResponse {
  workspace_id: string;
  query: string;
  results: WorkspaceSearchResult[];
}

export type WorkspaceDiffChangeType =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "type_changed";

export interface WorkspaceDiffFileSummary {
  path: string;
  change_type: WorkspaceDiffChangeType;
  previous_path?: string | null;
}

export interface WorkspaceDiffFile {
  mount_name?: string;
  path: string;
  change_type: WorkspaceDiffChangeType;
  previous_path?: string | null;
  diff: string;
  is_binary?: boolean;
}

export interface WorkspaceFileContent {
  workspace_id: string;
  mount_name?: string;
  path: string;
  content: string;
  encoding?: string;
  is_binary?: boolean;
  truncated?: boolean;
  size_bytes: number;
}

export interface WorkspaceUpdateRequest {
  default_mount_name: string;
  mounts: WorkspaceMountRecord[];
}

export type BoardTodoStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "archived";
export type BoardTodoSourceProvider = "local" | "github";
export type BoardTodoSourceType =
  | "manual"
  | "github_issue"
  | "github_pull_request";
export type BoardTodoSourceKind = "manual" | "github_issues";
export type BoardTodoSyncStatus = "idle" | "running" | "succeeded" | "failed";

export interface BoardTodoStatusCounts {
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  archived: number;
}

export interface BoardTodoSourceGroup {
  display_name: string;
  enabled: boolean;
  group_id: string;
  kind: string;
  repository_full_name?: string | null;
  source_id?: string | null;
}

export interface BoardTodoSource {
  created_at: string;
  display_name: string;
  enabled: boolean;
  kind: BoardTodoSourceKind;
  provider: BoardTodoSourceProvider;
  repository_full_name?: string | null;
  source_id: string;
  system_managed: boolean;
  updated_at: string;
  workspace_id: string;
}

export interface BoardTodoSourceState {
  last_diagnostics: string[];
  last_sync_finished_at?: string | null;
  last_sync_started_at?: string | null;
  last_sync_status: BoardTodoSyncStatus;
  source_id: string;
  sync_cursor?: string | null;
  workspace_id: string;
}

export interface BoardTodoSourceView {
  source: BoardTodoSource;
  state?: BoardTodoSourceState | null;
}

export interface BoardTodoSourceSettingsResponse {
  board_workspace_id: string;
  diagnostics: string[];
  forked_from_workspace_id?: string | null;
  is_fork_view: boolean;
  sources: BoardTodoSourceView[];
  view_workspace_id: string;
  workspace_id: string;
}

export interface BoardTodoSourceCreateRequest {
  display_name: string;
  enabled?: boolean;
  kind: BoardTodoSourceKind;
  repository_full_name?: string | null;
  workspace_id: string;
}

export interface BoardTodoSourceUpdateRequest {
  display_name?: string | null;
  enabled?: boolean | null;
  repository_full_name?: string | null;
  workspace_id?: string | null;
}

export interface BoardTodoSourceDeleteResponse {
  deleted: boolean;
  source_id: string;
}

export interface BoardTodoItem {
  active_attempt_id?: string | null;
  archived_at?: string | null;
  body: string;
  created_at: string;
  current_attempt_id?: string | null;
  execution_policy?: string | null;
  execution_workspace_id?: string | null;
  html_url?: string | null;
  issue_number?: number | null;
  item_revision: number;
  last_status_reason?: string | null;
  last_synced_at?: string | null;
  linked_pr_number?: number | null;
  linked_pr_url?: string | null;
  pull_request_number?: number | null;
  queue_ticket_id?: string | null;
  repository_full_name?: string | null;
  run_id?: string | null;
  run_last_error?: string | null;
  run_phase?: string | null;
  run_recoverable: boolean;
  run_status?: string | null;
  runtime_target_id?: string | null;
  runtime_target_kind?: string | null;
  session_id?: string | null;
  source_id?: string | null;
  source_key: string;
  source_provider: BoardTodoSourceProvider;
  source_type: BoardTodoSourceType;
  source_updated_at?: string | null;
  status: BoardTodoStatus;
  title: string;
  todo_id: string;
  updated_at: string;
  workspace_id: string;
}

export interface BoardTodoBoardResponse {
  board_workspace_id?: string | null;
  diagnostics: string[];
  forked_from_workspace_id?: string | null;
  is_fork_view: boolean;
  items: BoardTodoItem[];
  repository_full_name?: string | null;
  revision: number;
  source_groups: BoardTodoSourceGroup[];
  status_counts: BoardTodoStatusCounts;
  synced_at?: string | null;
  view_workspace_id?: string | null;
  workspace_id: string;
}

export type BoardTodoExecutionPolicy = "current_workspace" | "fork_git_worktree";
export type BoardTodoRuntimeTargetKind = "local_role" | "orchestration_preset";

export interface BoardTodoStartRequest {
  view_workspace_id?: string | null;
  execution_policy?: BoardTodoExecutionPolicy | null;
  runtime_target_id?: string | null;
  queue_if_full?: boolean;
  final_prompt?: string | null;
  prompt?: string | null;
  session_mode?: SessionMode | null;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  yolo?: boolean;
  thinking?: RunThinkingConfig;
}

export interface BoardTodoPreviewStartRequest {
  view_workspace_id?: string | null;
  execution_policy?: BoardTodoExecutionPolicy | null;
  runtime_target_id?: string | null;
  queue_if_full?: boolean;
}

export interface BoardTodoStartRoleOption {
  role_id: string;
  name: string;
  description?: string;
}

export interface BoardTodoStartPresetOption {
  preset_id: string;
  name: string;
  description?: string;
}

export interface BoardTodoRuntimeTargetOption {
  target_id: string;
  kind: BoardTodoRuntimeTargetKind;
  label: string;
  description?: string;
}

export interface BoardTodoExecutionWorkspacePreview {
  policy: BoardTodoExecutionPolicy;
  workspace_id?: string | null;
  source_workspace_id: string;
  display_name: string;
}

export interface BoardTodoConcurrencySnapshot {
  source_workspace_active: number;
  source_workspace_limit: number;
  runtime_target_active: number;
  runtime_target_limit: number;
}

export interface BoardTodoQueuePreview {
  queue_if_full: boolean;
  slot_available: boolean;
  will_queue: boolean;
  reason?: string | null;
}

export interface BoardTodoPreviewStartResponse {
  todo_id: string;
  board_workspace_id: string;
  view_workspace_id: string;
  is_fork_view?: boolean;
  forked_from_workspace_id?: string | null;
  template_kind: string;
  template_source: string;
  prompt: string;
  execution_policy: BoardTodoExecutionPolicy;
  execution_workspace_preview?: BoardTodoExecutionWorkspacePreview | null;
  runtime_target_id?: string | null;
  runtime_target_options?: BoardTodoRuntimeTargetOption[];
  concurrency: BoardTodoConcurrencySnapshot;
  queue_preview: BoardTodoQueuePreview;
  session_mode?: SessionMode | null;
  normal_root_role_id?: string | null;
  normal_mode_roles?: BoardTodoStartRoleOption[];
  orchestration_preset_id?: string | null;
  orchestration_presets?: BoardTodoStartPresetOption[];
  yolo: boolean;
  thinking: RunThinkingConfig;
  diagnostics: string[];
}

export interface BoardTodoPreviewRequestChangesRequest {
  view_workspace_id?: string | null;
  execution_policy?: BoardTodoExecutionPolicy | null;
  runtime_target_id?: string | null;
  queue_if_full?: boolean;
  feedback: string;
}

export interface BoardTodoPreviewRequestChangesResponse {
  todo_id: string;
  board_workspace_id: string;
  view_workspace_id: string;
  is_fork_view?: boolean;
  forked_from_workspace_id?: string | null;
  template_kind: string;
  template_source: string;
  prompt: string;
  execution_policy?: BoardTodoExecutionPolicy | null;
  execution_workspace_preview?: BoardTodoExecutionWorkspacePreview | null;
  runtime_target_id?: string | null;
  runtime_target_options?: BoardTodoRuntimeTargetOption[];
  concurrency: BoardTodoConcurrencySnapshot;
  queue_preview: BoardTodoQueuePreview;
  session_id?: string | null;
  run_id?: string | null;
  yolo: boolean;
  thinking: RunThinkingConfig;
  diagnostics: string[];
}

export interface BoardTodoStatusUpdateRequest {
  view_workspace_id?: string | null;
  execution_policy?: BoardTodoExecutionPolicy | null;
  runtime_target_id?: string | null;
  queue_if_full?: boolean;
  feedback: string;
  final_prompt?: string | null;
  prompt?: string | null;
  yolo?: boolean;
  thinking?: RunThinkingConfig;
}

export interface BoardTodoMarkDoneRequest {
  reason?: string | null;
}

export interface BoardTodoArchiveRequest {
  reason?: string | null;
}

export type AutomationProjectStatus = "enabled" | "disabled";
export type AutomationScheduleMode = "cron" | "interval" | "one_shot";
export type AutomationIntervalUnit = "minutes" | "hours" | "days";
export type AutomationDeliveryEvent = "started" | "completed" | "failed";

export interface AutomationRunConfig {
  session_mode?: SessionMode;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  execution_mode?: string;
  yolo?: boolean;
  thinking?: {
    enabled?: boolean;
    effort?: string | null;
  };
}

export interface AutomationFeishuBinding {
  provider: "feishu";
  trigger_id: string;
  tenant_key: string;
  chat_id: string;
  session_id?: string | null;
  chat_type: string;
  source_label: string;
}

export interface AutomationXiaolubanBinding {
  provider: "xiaoluban";
  account_id: string;
  display_name: string;
  derived_uid: string;
  source_label: string;
}

export type AutomationDeliveryBinding =
  | AutomationFeishuBinding
  | AutomationXiaolubanBinding;

export interface AutomationProjectRecord {
  active_run_status?: string | null;
  automation_project_id: string;
  created_at: string;
  cron_expression?: string | null;
  delivery_binding?: AutomationDeliveryBinding | null;
  delivery_events: AutomationDeliveryEvent[];
  display_name: string;
  interval_every?: number | null;
  interval_unit?: AutomationIntervalUnit | null;
  last_error?: string | null;
  last_run_started_at?: string | null;
  last_session_id?: string | null;
  latest_terminal_run_status?: string | null;
  latest_terminal_run_verification_status?: string | null;
  name: string;
  next_run_at?: string | null;
  prompt: string;
  run_at?: string | null;
  run_config: AutomationRunConfig;
  schedule_mode: AutomationScheduleMode;
  status: AutomationProjectStatus;
  timezone: string;
  trigger_id: string;
  updated_at: string;
  workspace_id: string;
}

export interface AutomationProjectCreateRequest {
  name: string;
  display_name?: string | null;
  workspace_id: string;
  prompt: string;
  schedule_mode: AutomationScheduleMode;
  cron_expression?: string | null;
  interval_every?: number | null;
  interval_unit?: AutomationIntervalUnit | null;
  run_at?: string | null;
  timezone: string;
  run_config?: AutomationRunConfig;
  delivery_binding?: AutomationDeliveryBinding | null;
  delivery_events?: AutomationDeliveryEvent[];
  enabled?: boolean;
}

export type AutomationProjectUpdateRequest = Partial<AutomationProjectCreateRequest>;

export interface AutomationRunNowResult {
  automation_project_id: string;
  queued: boolean;
  reused_bound_session: boolean;
  run_id: string;
  session_id: string;
}

export interface AutomationProjectSessionRecord {
  active_run_status?: string | null;
  latest_terminal_run_status?: string | null;
  latest_terminal_run_updated_at?: string | null;
  latest_terminal_run_verification_status?: string | null;
  metadata?: Record<string, string | null | undefined>;
  session_id: string;
  title?: string;
  updated_at?: string;
  workspace_id?: string;
}

export type SkillSource =
  | "builtin"
  | "plugin"
  | "project_agents"
  | "project_claude"
  | "project_codex"
  | "project_opencode"
  | "project_relay_teams"
  | "user_agents"
  | "user_claude"
  | "user_codex"
  | "user_opencode"
  | "user_relay_teams";

export interface RuntimeSkillSummary {
  description: string;
  name: string;
  ref: string;
  source: SkillSource;
}

export interface RuntimeSkillDetail extends RuntimeSkillSummary {
  directory: string;
  instructions: string;
  manifest_content?: string | null;
  manifest_path: string;
}

export interface SkillConfigStatus {
  loaded?: boolean;
  skills?: RuntimeSkillSummary[];
}

export interface SystemConfigStatus {
  skills?: SkillConfigStatus;
}

export interface ClawHubConfig {
  token?: string | null;
}

export interface ClawHubConfigSaveResponse {
  status: string;
}

export interface ClawHubConnectivityProbeRequest {
  timeout_ms?: number | null;
  token?: string | null;
}

export interface ClawHubConnectivityProbeDiagnostics {
  binary_available: boolean;
  endpoint_fallback_used: boolean;
  installation_attempted: boolean;
  installed_during_probe: boolean;
  registry?: string | null;
  token_configured: boolean;
}

export interface ClawHubConnectivityProbeResult {
  checked_at: string;
  clawhub_path?: string | null;
  clawhub_version?: string | null;
  diagnostics: ClawHubConnectivityProbeDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  exit_code?: number | null;
  latency_ms: number;
  ok: boolean;
  retryable: boolean;
}

export interface SkillUninstallResponse {
  error_code?: string | null;
  error_message?: string | null;
  ok: boolean;
  ref: string;
  skills_reloaded: boolean;
}

export interface ClawHubSkillMarketStats {
  comments?: number | null;
  downloads?: number | null;
  installs_all_time?: number | null;
  installs_current?: number | null;
  stars?: number | null;
  versions?: number | null;
}

export interface ClawHubSkillMarketSearchItem {
  created_at_ms?: number | null;
  installed: boolean;
  owner_display_name?: string | null;
  owner_handle?: string | null;
  owner_image?: string | null;
  score?: number | null;
  slug: string;
  stats?: ClawHubSkillMarketStats | null;
  summary: string;
  title: string;
  updated_at_ms?: number | null;
  version?: string | null;
}

export interface ClawHubSkillMarketSearchResponse {
  error_message?: string | null;
  items: ClawHubSkillMarketSearchItem[];
  next_cursor?: string | null;
  ok: boolean;
  query: string;
  sort?: string | null;
}

export interface ClawHubSkillMarketFile {
  content_type?: string | null;
  path: string;
  sha256?: string | null;
  size?: number | null;
}

export interface ClawHubSkillMarketDetail {
  changelog?: string | null;
  created_at_ms?: number | null;
  error_message?: string | null;
  files: ClawHubSkillMarketFile[];
  license?: string | null;
  manifest_content?: string | null;
  ok: boolean;
  owner_display_name?: string | null;
  owner_handle?: string | null;
  owner_image?: string | null;
  slug: string;
  stats?: ClawHubSkillMarketStats | null;
  summary: string;
  title: string;
  updated_at_ms?: number | null;
  version?: string | null;
}

export interface ClawHubSkillMarketInstallRequest {
  force?: boolean;
  slug: string;
  version?: string | null;
}

export interface ClawHubSkillMarketInstalledSkill {
  description: string;
  directory: string;
  error?: string | null;
  manifest_path: string;
  ref?: string | null;
  runtime_name?: string | null;
  skill_id: string;
  source: SkillSource;
  valid: boolean;
}

export interface ClawHubSkillMarketInstallDiagnostics {
  binary_available: boolean;
  checked_at?: string | null;
  endpoint_fallback_used: boolean;
  installation_attempted: boolean;
  installed_during_install: boolean;
  registry?: string | null;
  skills_reloaded: boolean;
  token_configured: boolean;
  workdir?: string | null;
}

export interface ClawHubSkillMarketInstallResponse {
  checked_at?: string | null;
  clawhub_path?: string | null;
  diagnostics: ClawHubSkillMarketInstallDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  installed_skill?: ClawHubSkillMarketInstalledSkill | null;
  latency_ms: number;
  ok: boolean;
  requested_version?: string | null;
  retryable: boolean;
  slug: string;
}

export interface ClawHubSkillMarketUninstallResponse {
  error_code?: string | null;
  error_message?: string | null;
  ok: boolean;
  skills_reloaded: boolean;
  slug: string;
}

export interface SshProfileRecord {
  ssh_profile_id: string;
  host: string;
  username?: string | null;
  port?: number | null;
  remote_shell?: string | null;
  connect_timeout_seconds?: number | null;
  private_key_name?: string | null;
  has_password?: boolean;
  has_private_key?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SshProfileConfig {
  host: string;
  username: string;
  password?: string | null;
  port?: number | null;
  remote_shell?: string | null;
  connect_timeout_seconds?: number | null;
  private_key?: string | null;
  private_key_name?: string | null;
}

export interface SshProfilePasswordRevealView {
  password: string | null;
}

export interface SshProfileConnectivityDiagnostics {
  binary_available: boolean;
  host_reachable: boolean;
  used_password: boolean;
  used_private_key: boolean;
  used_system_config: boolean;
  exit_code?: number | null;
}

export interface SshProfileConnectivityProbeRequest {
  ssh_profile_id?: string | null;
  override?: SshProfileConfig | null;
  timeout_ms?: number | null;
}

export interface SshProfileConnectivityProbeResult {
  ok: boolean;
  ssh_profile_id?: string | null;
  host: string;
  port?: number | null;
  username: string;
  latency_ms: number;
  checked_at: string;
  diagnostics: SshProfileConnectivityDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
}

export interface WorkspaceDiffListing {
  workspace_id: string;
  mount_name?: string;
  root_path?: string | null;
  diff_files: WorkspaceDiffFileSummary[];
  is_git_repository?: boolean;
  git_root_path?: string | null;
  diff_message?: string | null;
}

export interface SessionCreateRequest {
  workspace_id: string;
  normal_model_profile?: string | null;
  metadata?: {
    title?: string;
  } | null;
}

export interface SessionMetadataPatch {
  title?: string | null;
  title_source?: string | null;
  source_label?: string | null;
  source_icon?: string | null;
  custom_metadata?: Record<string, string> | null;
}

export interface DeleteSessionRequest {
  cascade?: boolean;
  force?: boolean;
}

export interface RoleOption {
  role_id: string;
  name: string;
  description?: string;
  capabilities?: ModelCapabilities;
  model_profile?: string;
  model_name?: string;
  input_modalities?: string[];
}

export interface RoleConfigOptions {
  coordinator_role_id?: string;
  main_agent_role_id?: string;
  coordinator_role?: RoleOption | null;
  main_agent_role?: RoleOption | null;
  normal_mode_roles: RoleOption[];
  subagent_roles?: RoleOption[];
}

export type RoleConfigMode = "primary" | "subagent" | "all" | (string & {});

export interface RoleMemoryProfile {
  enabled?: boolean | null;
}

export interface RoleConfigSummary {
  role_id: string;
  name?: string;
  description?: string;
  version?: string;
  model_profile?: string | null;
  bound_agent_id?: string | null;
  mode?: RoleConfigMode | null;
  source?: string | null;
  deletable?: boolean;
  execution_surface?: string | null;
}

export interface RoleConfigDocument extends RoleConfigSummary {
  source_role_id?: string | null;
  tools?: string[];
  mcp_servers?: string[];
  skills?: string[];
  memory_profile?: RoleMemoryProfile | null;
  contract?: JsonValue | null;
  system_prompt?: string;
  file_name?: string | null;
  content?: string | null;
}

export interface RoleConfigSaveRequest {
  bound_agent_id?: string | null;
  contract?: JsonValue | null;
  description: string;
  execution_surface?: string | null;
  mcp_servers?: string[];
  memory_profile?: RoleMemoryProfile | null;
  mode?: RoleConfigMode | null;
  model_profile?: string | null;
  name: string;
  role_id: string;
  skills?: string[];
  source_role_id?: string | null;
  system_prompt: string;
  tools?: string[];
  version: string;
}

export interface RoleValidationResult {
  valid: boolean;
  role: RoleConfigDocument;
  diet_warnings?: JsonValue[];
}

export interface OrchestrationPreset {
  preset_id: string;
  name?: string;
  description?: string;
  role_ids?: string[];
  orchestration_prompt?: string;
  policy?: OrchestrationPolicy;
  graph?: JsonValue | null;
}

export interface OrchestrationPolicy {
  auto_plan_long_tasks?: boolean | null;
  coordinator_inline_budget_steps?: number | null;
  max_orchestration_cycles?: number | null;
  max_parallel_delegated_tasks?: number | null;
  max_temporary_roles_per_run?: number | null;
  planner_role_id?: string | null;
  prefer_temporary_roles_for_long_tasks?: boolean | null;
}

export interface OrchestrationConfig {
  default_orchestration_preset_id?: string;
  presets?: OrchestrationPreset[];
}

export interface ModelProfileRecord {
  provider?: string;
  model?: string;
  base_url?: string;
  is_default?: boolean;
  temperature?: number | null;
  top_p?: number | null;
  context_window?: number | null;
  connect_timeout_seconds?: number | null;
  max_tokens?: number | null;
  fallback_policy_id?: string | null;
  fallback_priority?: number | null;
  catalog_provider_id?: string | null;
  catalog_provider_name?: string | null;
  catalog_model_name?: string | null;
  ssl_verify?: boolean | null;
  api_key?: string | null;
  headers?: JsonValue[] | null;
  maas_auth?: JsonValue | null;
  codeagent_auth?: JsonValue | null;
  input_modalities?: string[];
  capabilities?: ModelCapabilities;
  resolved_capabilities?: ModelCapabilities;
  speech_realtime?: {
    model?: string | null;
  } | null;
}

export type ModelProfilesPayload = Record<string, ModelProfileRecord>;

export interface ModelCatalogModel {
  id: string;
  name: string;
  family?: string | null;
  release_date?: string | null;
  last_updated?: string | null;
  context_window?: number | null;
  output_limit?: number | null;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  status?: string | null;
  capabilities?: ModelCapabilities;
  input_modalities?: string[];
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  runtime_provider?: string;
  api?: string | null;
  doc?: string | null;
  env?: string[];
  models?: ModelCatalogModel[];
}

export interface ModelCatalogResult {
  ok: boolean;
  source_url: string;
  fetched_at?: string | null;
  cache_age_seconds?: number | null;
  stale?: boolean;
  providers?: ModelCatalogProvider[];
  error_code?: string | null;
  error_message?: string | null;
}

export interface ModelProfileSaveRequest {
  provider: string;
  model: string;
  base_url: string;
  is_default?: boolean;
  temperature: number;
  top_p: number;
  context_window: number | null;
  connect_timeout_seconds: number;
  max_tokens?: number | null;
  fallback_policy_id?: string | null;
  fallback_priority?: number | null;
  catalog_provider_id?: string | null;
  catalog_provider_name?: string | null;
  catalog_model_name?: string | null;
  ssl_verify?: boolean | null;
  api_key?: string | null;
  headers?: JsonValue[] | null;
  maas_auth?: JsonValue | null;
  codeagent_auth?: JsonValue | null;
  capabilities?: ModelCapabilities;
  speech_realtime?: {
    model?: string | null;
  } | null;
  source_name?: string | null;
}

export interface ModelConnectivityProbeRequest {
  profile_name?: string | null;
  override?: ModelConnectivityProbeOverride | null;
  timeout_ms?: number | null;
}

export interface ModelConnectivityProbeOverride {
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  api_key?: string | null;
  headers?: JsonValue[] | null;
  maas_auth?: JsonValue | null;
  codeagent_auth?: JsonValue | null;
  ssl_verify?: boolean | null;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
}

export interface ModelConnectivityProbeResult {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  checked_at: string;
  diagnostics: {
    endpoint_reachable: boolean;
    auth_valid: boolean;
    rate_limited: boolean;
  };
  token_usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
}

export interface ModalityCapabilities {
  audio?: boolean | null;
  image?: boolean | null;
  text?: boolean | null;
  video?: boolean | null;
}

export interface ModelCapabilities {
  input?: ModalityCapabilities;
  output?: ModalityCapabilities;
}

export interface SessionSidebarRecord {
  session_id: string;
  workspace_id?: string;
  metadata?: Record<string, string | null | undefined>;
  title?: string;
  session_mode?: SessionMode;
  updated_at?: string;
  active_run_id?: string | null;
  active_run_status?: RunStatus | "";
  active_run_phase?: string;
  pending_tool_approval_count?: number;
  pending_user_question_count?: number;
  background_task_count?: number;
  subagent_count?: number;
  last_viewed_terminal_run_id?: string | null;
  latest_terminal_run_id?: string | null;
  latest_terminal_run_status?: string | null;
  latest_terminal_run_updated_at?: string | null;
  latest_terminal_run_verification_status?: string | null;
  has_unread_terminal_run?: boolean;
}

export interface SessionSubagentRecord {
  checkpoint_event_id?: number;
  conversation_id?: string;
  created_at?: string;
  deletable?: boolean;
  instance_id?: string;
  interactive?: boolean;
  last_event_id?: number;
  role_id?: string;
  run_id?: string;
  run_phase?: string;
  run_status?: string;
  session_id?: string;
  status?: string;
  stream_connected?: boolean;
  subagent_instance_id?: string;
  subagent_kind?: string;
  subagent_role_id?: string;
  subagent_run_id?: string;
  title?: string;
  updated_at?: string;
  workspace_id?: string;
}

export interface SessionRecord {
  session_id: string;
  workspace_id: string;
  title?: string;
  session_mode?: SessionMode;
  normal_root_role_id?: string | null;
  normal_model_profile?: string | null;
  orchestration_preset_id?: string | null;
  can_switch_mode?: boolean;
}

export interface ContentTextPart {
  kind: "text";
  text: string;
}

export interface ContentMediaRefPart {
  kind: "media_ref";
  asset_id: string;
  session_id?: string;
  modality?: "image" | "audio" | "video";
  mime_type?: string;
  name?: string;
  url?: string;
}

export interface LegacyContentTextPart {
  part_kind: "text";
  content: string;
}

export interface LegacyUserPromptContentPart {
  part_kind: "user-prompt";
  content?: string;
}

export interface LegacyContentMediaRefPart {
  part_kind: "media_ref";
  url?: string;
  media_type?: string;
  name?: string;
}

export interface ThinkingContentPart {
  content?: string;
  finished?: boolean;
  kind: "thinking";
  part_index?: number | string;
  streaming?: boolean;
  text?: string;
}

export interface LegacyThinkingContentPart {
  content?: string;
  finished?: boolean;
  part_index?: number | string;
  part_kind: "thinking";
  streaming?: boolean;
  text?: string;
}

export interface InlineMediaPart {
  base64_data?: string;
  height?: number | null;
  kind: "inline_media";
  mime_type?: string;
  modality?: string;
  name?: string;
  size_bytes?: number | null;
  thumbnail_asset_id?: string | null;
  width?: number | null;
}

export interface BinaryMediaPart {
  data?: string;
  kind: "binary";
  media_type?: string;
  name?: string;
}

export interface UrlMediaPart {
  kind: "image-url" | "audio-url" | "video-url";
  media_type?: string;
  name?: string;
  url?: string;
}

export type ToolReturnOutcome =
  | "completed"
  | "denied"
  | "failed"
  | "success"
  | "succeeded"
  | (string & {});

export interface ToolCallContentPart {
  args?: JsonValue;
  kind: "tool-call";
  tool_call_id?: string;
  tool_name?: string;
}

export interface LegacyToolCallContentPart {
  args?: JsonValue;
  part_kind: "tool-call";
  tool_call_id?: string;
  tool_name?: string;
}

export interface ToolReturnContentPart {
  content?: JsonValue;
  is_error?: boolean;
  kind: "tool-return";
  outcome?: ToolReturnOutcome;
  tool_call_id?: string;
  tool_name?: string;
}

export interface LegacyToolReturnContentPart {
  content?: JsonValue;
  is_error?: boolean;
  outcome?: ToolReturnOutcome;
  part_kind: "tool-return";
  tool_call_id?: string;
  tool_name?: string;
}

export interface ToolValidationContentPart {
  content?: JsonValue;
  kind: "retry-prompt";
  tool_call_id?: string;
  tool_name?: string;
}

export interface LegacyToolValidationContentPart {
  content?: JsonValue;
  part_kind: "retry-prompt";
  tool_call_id?: string;
  tool_name?: string;
}

export type RunInputPart = ContentTextPart | ContentMediaRefPart | InlineMediaPart;
export type ContentPart =
  | RunInputPart
  | BinaryMediaPart
  | InlineMediaPart
  | LegacyContentTextPart
  | LegacyContentMediaRefPart
  | LegacyUserPromptContentPart
  | LegacyThinkingContentPart
  | LegacyToolCallContentPart
  | LegacyToolReturnContentPart
  | LegacyToolValidationContentPart
  | ThinkingContentPart
  | ToolCallContentPart
  | ToolReturnContentPart
  | ToolValidationContentPart
  | UrlMediaPart;

export function contentPartText(part: ContentPart): string | null {
  if (isContentTextPart(part)) {
    return part.text;
  }
  if (isLegacyContentTextPart(part)) {
    return part.content;
  }
  return null;
}

function isContentTextPart(part: ContentPart): part is ContentTextPart {
  return "kind" in part && part.kind === "text";
}

function isLegacyContentTextPart(
  part: ContentPart,
): part is LegacyContentTextPart {
  return "part_kind" in part && part.part_kind === "text";
}

export interface RunCreateRequest {
  session_id: string;
  input: RunInputPart[];
  display_input?: RunInputPart[];
  yolo?: boolean;
  shell_safety_policy_enabled?: boolean;
  thinking?: RunThinkingConfig;
  target_role_id?: string | null;
}

export type ThinkingEffort = "minimal" | "low" | "medium" | "high";

export interface RunThinkingConfig {
  enabled: boolean;
  effort: ThinkingEffort | null;
}

export interface RunCreateResponse {
  run_id: string;
  session_id: string;
  target_role_id?: string | null;
}

export type InjectionDeliveryMode = "queued" | "interrupt";

export interface RunInjectionRequest {
  content: string;
  mode: InjectionDeliveryMode;
}

export interface AgUiActionResponse {
  status: "ok" | "deferred";
  run_id?: string | null;
  session_id?: string | null;
  scope?: "main" | "subagent" | null;
  instance_id?: string | null;
  action?: string | null;
  option_id?: string | null;
  payload?: JsonValue;
}

export interface TimelineMessage {
  message_id?: string;
  role?: string;
  role_id?: string;
  instance_id?: string;
  content?: string;
  message?: {
    content?: string;
    parts?: ContentPart[];
  };
  parts?: ContentPart[];
  created_at?: string;
  run_id?: string;
  trace_id?: string;
  entry_type?: string;
}

export interface SessionRoundMessagePart {
  args?: JsonValue;
  content?: JsonValue;
  is_error?: boolean;
  kind?: string;
  modality?: string;
  mime_type?: string;
  name?: string;
  outcome?: ToolReturnOutcome;
  part_kind?: string;
  text?: string;
  tool_call_id?: string;
  tool_name?: string;
  url?: string;
}

export interface SessionRoundMessageBody {
  content?: JsonValue;
  parts?: SessionRoundMessagePart[];
  usage?: SessionRoundMessageUsage;
}

export interface SessionRoundMessageUsage {
  cache_audio_read_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  details?: SessionRoundMessageUsageDetails;
  input_audio_tokens?: number;
  input_tokens?: number;
  output_audio_tokens?: number;
  output_tokens?: number;
}

export interface SessionRoundMessageUsageDetails {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  reasoning_tokens?: number;
}

export interface SessionRoundMessage {
  content?: string;
  content_parts?: ContentPart[];
  created_at?: string;
  entry_type?: string;
  injection_id?: string;
  injection_status?: string;
  instance_id?: string;
  label?: string;
  message?: SessionRoundMessageBody;
  message_id?: string;
  role?: string;
  role_id?: string;
  source?: string;
  status?: string;
}

export type SessionRoundTodoStatus = "completed" | "in_progress" | "pending" | string;

export interface SessionRoundTodoItem {
  content: string;
  status: SessionRoundTodoStatus;
}

export interface SessionRoundTodoSnapshot {
  items?: SessionRoundTodoItem[];
  run_id: string;
  session_id: string;
  updated_at?: string | null;
  updated_by_instance_id?: string | null;
  updated_by_role_id?: string | null;
  version?: number;
}

export interface SessionRound {
  clear_marker_before?: JsonValue;
  compaction_marker_before?: JsonValue;
  coordinator_messages?: SessionRoundMessage[];
  created_at?: string;
  has_final_output?: boolean;
  has_user_messages?: boolean;
  injection_messages?: SessionRoundMessage[];
  intent?: string;
  intent_parts?: ContentPart[];
  pending_tool_approval_count?: number;
  pending_tool_approvals?: JsonValue[];
  pending_user_question_count?: number;
  primary_role_id?: string | null;
  retry_events?: JsonValue[];
  run_diagnostic_message?: string | null;
  run_error_code?: string | null;
  run_id: string;
  run_phase?: string | null;
  run_started_at?: string | null;
  run_status?: string | null;
  run_updated_at?: string | null;
  run_user_message?: string | null;
  todo?: SessionRoundTodoSnapshot;
  verification_status?: string | null;
}

export interface SessionRoundsPage {
  has_more?: boolean;
  items: SessionRound[];
  next_cursor?: string | null;
}

export interface TaskProjection {
  assigned_instance_id?: string | null;
  assigned_role_id?: string | null;
  depends_on_task_ids?: string[];
  error?: string;
  evidence_bundle?: JsonValue;
  handoff?: JsonValue;
  instance_id?: string | null;
  lifecycle?: JsonValue;
  objective?: string;
  orchestration_node_id?: string;
  parent_task_id?: string | null;
  result?: string;
  role_id?: string | null;
  spec?: JsonValue;
  spec_artifact_id?: string;
  spec_source_task_id?: string;
  status?: string;
  task_id: string;
  title?: string;
  verification?: JsonValue;
}

export interface RunTasksResponse {
  tasks: TaskProjection[];
}

export interface TaskSpecArtifactVersionSummary {
  artifact_id: string;
  created_at: string;
  session_id: string;
  source_task_id?: string | null;
  task_id: string;
  trace_id: string;
  updated_at: string;
  version: number;
}

export interface TaskSpecArtifactsResponse {
  task_id: string;
  versions: TaskSpecArtifactVersionSummary[];
}

export interface TaskSpecArtifactDiffFieldChange {
  added_items?: string[];
  change_type: "added" | "removed" | "modified" | "unchanged" | string;
  field_label: string;
  field_name: string;
  new_items?: string[];
  new_value?: string | null;
  old_items?: string[];
  old_value?: string | null;
  removed_items?: string[];
}

export interface TaskSpecArtifactDiffResponse {
  field_changes: TaskSpecArtifactDiffFieldChange[];
  from_artifact_id: string;
  from_version: number;
  has_changes: boolean;
  summary?: string;
  task_id: string;
  to_artifact_id: string;
  to_version: number;
}

export interface SpecCheckpointEvaluation {
  artifact_id: string;
  checkpoint_seq: number;
  created_at: string;
  drift_detected: boolean;
  drift_detail?: string;
  evaluation_id: string;
  evaluator: string;
  fallback?: boolean;
  overall_score: number;
  scores_json?: string;
  session_id: string;
  summary?: string;
  task_id: string;
  trace_id: string;
}

export interface SpecCheckpointEvaluationsResponse {
  evaluations: SpecCheckpointEvaluation[];
  task_id: string;
}

export interface TokenUsageRoleSummary {
  role_id: string;
  input_tokens: number;
  latest_input_tokens: number;
  cached_input_tokens: number;
  max_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
  requests: number;
  tool_calls: number;
  context_window: number;
  model_profile: string;
}

export interface SessionTokenUsage {
  session_id: string;
  total_input_tokens: number;
  total_cached_input_tokens: number;
  total_output_tokens: number;
  total_reasoning_output_tokens: number;
  total_tokens: number;
  total_requests: number;
  total_tool_calls: number;
  by_role: Record<string, TokenUsageRoleSummary>;
}

export interface RecoverySnapshot {
  active_run: RecoveryRun | null;
  background_tasks: RecoveryBackgroundTask[];
  pending_tool_approvals: PendingToolApproval[];
  pending_user_questions: PendingUserQuestion[];
  paused_subagent: RecoveryPausedSubagent | null;
  round_snapshot: JsonValue | null;
}

export interface RecoveryRun {
  run_id: string;
  session_id: string;
  status: RunStatus | string;
  phase?: string;
  last_event_id?: number;
  stream_connected?: boolean;
  should_show_recover?: boolean;
  pending_tool_approval_count?: number;
  pending_user_question_count?: number;
}

export interface RecoveryPausedSubagent {
  instance_id?: string;
  role_id?: string;
  task_id?: string | null;
  reason?: string | null;
}

export type RecoveryBackgroundTaskStatus =
  | "running"
  | "blocked"
  | "stopped"
  | "failed"
  | "completed";

export interface RecoveryBackgroundTask {
  background_task_id: string;
  run_id: string;
  session_id?: string;
  kind?: "command" | "subagent" | string;
  instance_id?: string | null;
  role_id?: string | null;
  tool_call_id?: string | null;
  title?: string;
  input_text?: string;
  command: string;
  cwd: string;
  execution_mode?: "foreground" | "background" | string;
  status: RecoveryBackgroundTaskStatus | string;
  tty?: boolean;
  timeout_ms?: number | null;
  pid?: number | null;
  exit_code?: number | null;
  recent_output?: string[];
  output_excerpt?: string;
  log_path?: string;
  subagent_role_id?: string | null;
  subagent_run_id?: string | null;
  subagent_task_id?: string | null;
  subagent_instance_id?: string | null;
  subagent_suppress_hooks?: boolean;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  completion_notified_at?: string | null;
}

export interface StopBackgroundTaskResponse {
  background_task: RecoveryBackgroundTask;
}

export type ToolApprovalAction =
  | "approve"
  | "approve_once"
  | "approve_exact"
  | "approve_prefix"
  | "deny";

export interface ToolApprovalOption {
  id?: string;
  option_id?: string;
  optionId?: string;
  label?: string;
  name?: string;
  kind?: string;
}

export interface PendingToolApproval {
  tool_call_id: string;
  tool_name?: string;
  args_preview?: string;
  role_id?: string;
  instance_id?: string;
  requested_at?: string;
  status?: string;
  feedback?: string;
  acp_options?: ToolApprovalOption[];
}

export interface UserQuestionOption {
  label: string;
  description?: string;
}

export interface UserQuestionPrompt {
  header?: string;
  question: string;
  options: UserQuestionOption[];
  multiple?: boolean;
  placeholder?: string;
}

export interface PendingUserQuestion {
  question_id: string;
  run_id: string;
  role_id?: string;
  instance_id?: string;
  requested_at?: string;
  status?: string;
  questions: UserQuestionPrompt[];
}

export interface UserQuestionSelection {
  label: string;
  supplement?: string;
}

export interface UserQuestionAnswer {
  selections: UserQuestionSelection[];
}

export interface UserQuestionAnswerSubmission {
  answers: UserQuestionAnswer[];
}

export interface GeneralConfig {
  shell_safety_policy_enabled: boolean;
}

export type UiLanguage = "en-US" | "zh-CN";

export interface UiLanguageSettings {
  language: UiLanguage;
}

export type EnvironmentVariableScope = "app" | "system";
export type EnvironmentVariableValueKind = "expandable" | "string";

export interface EnvironmentVariableRecord {
  key: string;
  scope: EnvironmentVariableScope;
  value: string;
  value_kind: EnvironmentVariableValueKind;
}

export interface EnvironmentVariableCatalog {
  app: EnvironmentVariableRecord[];
  system: EnvironmentVariableRecord[];
}

export interface EnvironmentVariableSaveRequest {
  source_key?: string | null;
  value: string;
}

export type WebProvider = "exa";
export type WebFallbackProvider = "disabled" | "searxng";

export interface WebConfig {
  exa_api_key?: string | null;
  fallback_provider?: WebFallbackProvider | null;
  provider: WebProvider;
  searxng_instance_seeds?: string[];
  searxng_instance_url?: string | null;
}

export interface GitHubConfigView {
  token_configured: boolean;
  webhook_base_url?: string | null;
}

export interface GitHubConfigUpdate {
  token?: string | null;
  webhook_base_url?: string | null;
}

export interface GitHubTokenRevealView {
  token?: string | null;
}

export interface GitHubConnectivityProbeRequest {
  timeout_ms?: number | null;
  token?: string | null;
}

export interface GitHubConnectivityProbeDiagnostics {
  auth_valid: boolean;
  binary_available: boolean;
  bundled_binary: boolean;
  used_proxy: boolean;
}

export interface GitHubConnectivityProbeResult {
  checked_at: string;
  diagnostics: GitHubConnectivityProbeDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  exit_code?: number | null;
  gh_path?: string | null;
  gh_version?: string | null;
  host: string;
  latency_ms: number;
  ok: boolean;
  retryable: boolean;
  status_code?: number | null;
  username?: string | null;
}

export interface GitHubWebhookConnectivityProbeRequest {
  timeout_ms?: number | null;
  webhook_base_url?: string | null;
}

export interface GitHubWebhookConnectivityProbeDiagnostics {
  endpoint_reachable: boolean;
  redirected: boolean;
  used_proxy: boolean;
}

export interface GitHubWebhookConnectivityProbeResult {
  callback_url?: string | null;
  checked_at: string;
  diagnostics: GitHubWebhookConnectivityProbeDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  final_url?: string | null;
  health_url?: string | null;
  latency_ms: number;
  ok: boolean;
  retryable: boolean;
  status_code?: number | null;
  webhook_base_url?: string | null;
}

export type FeishuGatewayAccountStatus = "disabled" | "enabled";
export type FeishuTriggerRule = "all_messages" | "mention_only";

export interface FeishuTriggerSourceConfig {
  app_id: string;
  app_name: string;
  provider: "feishu";
  trigger_rule: FeishuTriggerRule;
}

export interface FeishuTriggerTargetConfig {
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  session_mode: SessionMode;
  shell_safety_policy_enabled: boolean;
  thinking: RunThinkingConfig;
  workspace_id: string;
  yolo: boolean;
}

export interface FeishuTriggerSecretConfig {
  app_secret?: string | null;
  encrypt_key?: string | null;
  verification_token?: string | null;
}

export interface FeishuTriggerSecretStatus {
  app_secret_configured?: boolean;
  encrypt_key_configured?: boolean;
  verification_token_configured?: boolean;
}

export interface FeishuGatewayAccountRecord {
  account_id: string;
  created_at: string;
  display_name: string;
  last_error?: string | null;
  name: string;
  secret_config?: FeishuTriggerSecretConfig | null;
  secret_status?: FeishuTriggerSecretStatus | null;
  source_config: FeishuTriggerSourceConfig;
  status: FeishuGatewayAccountStatus;
  target_config?: FeishuTriggerTargetConfig | null;
  updated_at: string;
}

export interface FeishuGatewayAccountCreateInput {
  display_name?: string | null;
  enabled?: boolean;
  name: string;
  secret_config?: FeishuTriggerSecretConfig | null;
  source_config: FeishuTriggerSourceConfig;
  target_config: FeishuTriggerTargetConfig;
}

export interface FeishuGatewayAccountUpdateInput {
  display_name?: string | null;
  name?: string | null;
  secret_config?: FeishuTriggerSecretConfig | null;
  source_config?: FeishuTriggerSourceConfig | null;
  target_config?: FeishuTriggerTargetConfig | null;
}

export type WeChatGatewayAccountStatus = "disabled" | "enabled";

export interface WeChatGatewayAccountRecord {
  account_id: string;
  base_url: string;
  cdn_base_url: string;
  created_at: string;
  display_name: string;
  last_error?: string | null;
  last_event_at?: string | null;
  last_inbound_at?: string | null;
  last_login_at?: string | null;
  last_outbound_at?: string | null;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  remote_user_id?: string | null;
  route_tag?: string | null;
  running: boolean;
  session_mode: SessionMode;
  status: WeChatGatewayAccountStatus;
  sync_cursor: string;
  thinking: RunThinkingConfig;
  updated_at: string;
  workspace_id: string;
  yolo: boolean;
}

export interface WeChatGatewayAccountUpdateInput {
  base_url?: string | null;
  cdn_base_url?: string | null;
  display_name?: string | null;
  enabled?: boolean | null;
  normal_root_role_id?: string | null;
  orchestration_preset_id?: string | null;
  route_tag?: string | null;
  session_mode?: SessionMode | null;
  thinking?: RunThinkingConfig | null;
  workspace_id?: string | null;
  yolo?: boolean | null;
}

export interface WeChatLoginStartRequest {
  base_url?: string | null;
  bot_type?: string;
  route_tag?: string | null;
}

export interface WeChatLoginStartResponse {
  message: string;
  qr_code_url?: string | null;
  session_key: string;
}

export interface WeChatLoginWaitRequest {
  session_key: string;
  timeout_ms?: number;
}

export interface WeChatLoginWaitResponse {
  account_id?: string | null;
  connected: boolean;
  message: string;
}

export type LocalhostRunTunnelStatusValue =
  | "active"
  | "failed"
  | "idle"
  | "starting"
  | "stopped";

export interface LocalhostRunTunnelStartRequest {
  auto_save_webhook_base_url?: boolean;
  local_host?: string | null;
  local_port?: number | null;
  wait_timeout_ms?: number;
}

export interface LocalhostRunTunnelStopRequest {
  clear_webhook_base_url_if_matching?: boolean;
}

export interface LocalhostRunTunnelStatus {
  address?: string | null;
  connection_id?: string | null;
  error_message?: string | null;
  last_event?: string | null;
  last_message?: string | null;
  local_host?: string | null;
  local_port?: number | null;
  pid?: number | null;
  provider: string;
  public_url?: string | null;
  started_at?: string | null;
  status: LocalhostRunTunnelStatusValue;
  stopped_at?: string | null;
}

export interface ProxyConfig {
  all_proxy?: string | null;
  http_proxy?: string | null;
  https_proxy?: string | null;
  no_proxy?: string | null;
  proxy_password?: string | null;
  proxy_username?: string | null;
  ssl_verify?: boolean | null;
}

export type WebProbeMethod = "GET" | "HEAD";

export interface WebConnectivityProbeDiagnostics {
  endpoint_reachable: boolean;
  redirected: boolean;
  used_proxy: boolean;
}

export interface WebConnectivityProbeRequest {
  proxy_override?: ProxyConfig | null;
  timeout_ms?: number | null;
  url: string;
}

export interface WebConnectivityProbeResult {
  checked_at?: string;
  diagnostics: WebConnectivityProbeDiagnostics;
  error_code?: string | null;
  error_message?: string | null;
  final_url?: string;
  latency_ms: number;
  ok: boolean;
  retryable?: boolean;
  status_code?: number | null;
  url?: string;
  used_method: WebProbeMethod;
}

export type NotificationChannel = "browser" | "feishu" | "toast";
export type NotificationTypeId =
  | "monitor_triggered"
  | "run_completed"
  | "run_failed"
  | "run_stopped"
  | "tool_approval_requested";

export interface NotificationRule {
  channels: NotificationChannel[];
  enabled: boolean;
  feishu_format?: string;
}

export type NotificationConfig = Record<NotificationTypeId, NotificationRule>;

export type ConnectorProvider =
  | "discord"
  | "feishu"
  | "github"
  | "relay-knowledge"
  | "w3"
  | "wechat"
  | "xiaoluban";

export type ConnectorCategory = "auth" | "development" | "im" | "models";

export type ConnectorStatus =
  | "connected"
  | "disabled"
  | "error"
  | "needs_config";

export type ConnectorAuthType =
  | "api_key"
  | "api_token"
  | "cli"
  | "oauth"
  | "qr_login"
  | "username_password"
  | "webhook";

export interface ConnectorSummary {
  connected: number;
  disabled: number;
  error: number;
  needs_config: number;
  total: number;
}

export interface ConnectorItem {
  account_count: number;
  auth_type: ConnectorAuthType;
  capabilities: string[];
  category: ConnectorCategory;
  connector_id: string;
  description: string;
  display_name: string;
  enabled_count: number;
  last_activity_at?: string | null;
  last_error?: string | null;
  provider: ConnectorProvider;
  status: ConnectorStatus;
}

export interface ConnectorListResponse {
  items: ConnectorItem[];
  summary: ConnectorSummary;
}

export interface ConnectorHealthCheck {
  message: string;
  name: string;
  ok: boolean;
}

export interface ConnectorTestResult {
  account_count: number;
  capabilities: string[];
  checked_at: string;
  checks: ConnectorHealthCheck[];
  connector_id: string;
  enabled_count: number;
  last_error?: string | null;
  login_active?: boolean | null;
  message: string;
  ok: boolean;
  provider: ConnectorProvider;
  runtime_running?: boolean | null;
  status: ConnectorStatus;
}

export type BinaryToolId = "clawhub" | "gh" | "relay-knowledge" | "rg";

export type BinaryToolSourceKind = "github_release" | "npm_global";

export type BinaryToolPathSource = "managed" | "npm_global" | "system";

export type BinaryToolStatus = "downloading" | "error" | "missing" | "ready";

export type BinaryToolDownloadStatus =
  | "failed"
  | "queued"
  | "running"
  | "succeeded";

export type BinaryToolSystemPathStatus = "already_added" | "updated";

export interface BinaryToolItem {
  display_name: string;
  download_job_id?: string | null;
  error_message?: string | null;
  executable_name: string;
  path?: string | null;
  path_source?: BinaryToolPathSource | null;
  source_kind: BinaryToolSourceKind;
  status: BinaryToolStatus;
  target_version?: string | null;
  tool_id: BinaryToolId;
  update_available: boolean;
  version?: string | null;
}

export interface BinaryToolSystemPathState {
  added: boolean;
  bin_dir: string;
  supported: boolean;
}

export interface BinaryToolListResponse {
  items: BinaryToolItem[];
  system_path?: BinaryToolSystemPathState | null;
}

export interface BinaryToolDownloadJob {
  downloaded_bytes: number;
  error_message?: string | null;
  job_id: string;
  message: string;
  path?: string | null;
  progress_percent?: number | null;
  started_at: string;
  status: BinaryToolDownloadStatus;
  target_version?: string | null;
  tool_id: BinaryToolId;
  total_bytes?: number | null;
  updated_at: string;
}

export interface BinaryToolSystemPathResult {
  bin_dir: string;
  message: string;
  requires_terminal_restart: boolean;
  status: BinaryToolSystemPathStatus;
}

export type MemoryTier = "working" | "medium_term" | "persistent";
export type MemoryScope = "workspace" | "session" | "role";
export type MemoryEntryKind =
  | "constraint"
  | "decision"
  | "fact"
  | "failure_mode"
  | "insight"
  | "preference"
  | "summary";
export type MemoryEntryStatus = "active" | "expired" | "superseded";
export type MemorySourceKind =
  | "condensation"
  | "consolidation"
  | "manual"
  | "task_result";

export interface MemoryContent {
  body: string;
  context: string;
  outcome: string;
  title: string;
}

export interface MemoryEntry {
  access_count: number;
  confidence_score: number;
  content: MemoryContent;
  created_at: string;
  expires_at?: string | null;
  id: string;
  kind: MemoryEntryKind;
  last_accessed_at?: string | null;
  metadata: Record<string, string>;
  parent_entry_id?: string | null;
  role_id?: string | null;
  run_id?: string | null;
  scope: MemoryScope;
  session_id?: string | null;
  source: MemorySourceKind;
  source_ref: string;
  status: MemoryEntryStatus;
  superseded_by_id?: string | null;
  tags: string[];
  tier: MemoryTier;
  updated_at: string;
  version: number;
  workspace_id: string;
}

export interface MemoryEntrySummary {
  confidence_score: number;
  content_body_preview: string;
  content_title: string;
  created_at: string;
  expires_at?: string | null;
  id: string;
  kind: MemoryEntryKind;
  role_id?: string | null;
  scope: MemoryScope;
  session_id?: string | null;
  source: MemorySourceKind;
  status: MemoryEntryStatus;
  tags: string[];
  tier: MemoryTier;
  updated_at: string;
  version: number;
  workspace_id: string;
}

export interface MemoryQueryResult {
  items: MemoryEntrySummary[];
  limit: number;
  offset: number;
  total_count: number;
}

export interface GlobalMemorySearchRequest {
  kind?: MemoryEntryKind | null;
  limit?: number;
  min_confidence?: number;
  role_id?: string | null;
  role_id_is_null?: boolean;
  scope?: MemoryScope | null;
  session_id?: string | null;
  status?: MemoryEntryStatus | null;
  tags?: string[];
  text_query: string;
  tier?: MemoryTier | null;
  workspace_id?: string | null;
}

export interface MemorySearchHit {
  entry: MemoryEntrySummary;
  rank: number;
  score: number;
  snippet: string;
}

export interface MemorySearchResult {
  items: MemorySearchHit[];
  total_count: number;
}

export interface MemoryIndexRebuildResult {
  failed_count: number;
  rebuilt_count: number;
  scanned_count: number;
  skipped_count: number;
}

export interface ObservabilityOverview {
  updated_at?: string;
  scope?: string;
  scope_id?: string;
  kpis?: Record<string, JsonValue>;
  trends?: JsonValue[];
  [key: string]: JsonValue | undefined;
}

export interface ObservabilityBreakdowns {
  updated_at?: string;
  rows?: JsonValue[];
  role_rows?: JsonValue[];
  gateway_rows?: JsonValue[];
  [key: string]: JsonValue | undefined;
}
