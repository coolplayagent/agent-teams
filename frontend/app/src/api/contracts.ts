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

export interface WorkspaceRecord {
  workspace_id: string;
  root_path: string;
  default_mount_name?: string;
  name?: string;
  display_name?: string;
  mounts?: WorkspaceMountRecord[];
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

export interface OrchestrationPreset {
  preset_id: string;
  name?: string;
  description?: string;
  role_ids?: string[];
}

export interface OrchestrationConfig {
  default_orchestration_preset_id?: string;
  presets?: OrchestrationPreset[];
}

export interface ModelProfileRecord {
  provider?: string;
  model?: string;
  is_default?: boolean;
  input_modalities?: string[];
  capabilities?: ModelCapabilities;
  resolved_capabilities?: ModelCapabilities;
  speech_realtime?: {
    model?: string | null;
  } | null;
}

export type ModelProfilesPayload = Record<string, ModelProfileRecord>;

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
  verification_status?: string | null;
}

export interface SessionRoundsPage {
  has_more?: boolean;
  items: SessionRound[];
  next_cursor?: string | null;
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
