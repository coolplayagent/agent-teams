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

export interface WorkspaceRecord {
  workspace_id: string;
  root_path: string;
  name?: string;
  display_name?: string;
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
