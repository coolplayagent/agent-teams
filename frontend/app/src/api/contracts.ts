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
  display_name?: string;
}

export interface SessionSidebarRecord {
  session_id: string;
  workspace_id?: string;
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
  orchestration_preset_id?: string | null;
}

export interface ContentTextPart {
  part_kind: "text";
  content: string;
}

export interface ContentMediaRefPart {
  part_kind: "media_ref";
  url?: string;
  media_type?: string;
  name?: string;
  [key: string]: JsonValue | undefined;
}

export type ContentPart = ContentTextPart | ContentMediaRefPart;

export interface RunCreateRequest {
  session_id: string;
  input: ContentPart[];
  display_input?: ContentPart[];
  yolo?: boolean;
  target_role_id?: string | null;
}

export interface RunCreateResponse {
  run_id: string;
  session_id: string;
  target_role_id?: string | null;
}

export interface TimelineMessage {
  message_id?: string;
  role?: string;
  role_id?: string;
  instance_id?: string;
  content?: string;
  parts?: ContentPart[];
  created_at?: string;
  run_id?: string;
  entry_type?: string;
}

export interface RecoverySnapshot {
  active_run: RecoveryRun | null;
  background_tasks: JsonValue[];
  pending_tool_approvals: JsonValue[];
  pending_user_questions: JsonValue[];
  paused_subagent: JsonValue | null;
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

export interface GeneralConfig {
  shell_safety_policy_enabled: boolean;
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
