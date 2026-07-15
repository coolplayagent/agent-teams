import type { JsonValue } from "../../api/contracts";
import type { Translate, TranslationKey } from "../../i18n";
import type { TimelineEntry } from "../../runtime/reducers";

const EVENT_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  awaiting_manual_action: "timelineEventAwaitingManualAction",
  background_task_completed: "timelineEventBackgroundTaskCompleted",
  background_task_started: "timelineEventBackgroundTaskStarted",
  background_task_stopped: "timelineEventBackgroundTaskStopped",
  background_task_updated: "timelineEventBackgroundTaskUpdated",
  injection_applied: "timelineEventInjectionApplied",
  injection_enqueued: "timelineEventInjectionQueued",
  model_step_finished: "timelineEventModelStepFinished",
  model_step_started: "timelineEventModelStepStarted",
  notification_requested: "timelineEventNotification",
  run_completed: "timelineEventRunCompleted",
  run_failed: "timelineEventRunFailed",
  run_paused: "timelineEventRunPaused",
  run_resumed: "timelineEventRunResumed",
  run_started: "timelineEventRunStarted",
  run_stopped: "timelineEventRunStopped",
  state_delta: "timelineEventStateDelta",
  state_snapshot: "timelineEventStateSnapshot",
  subagent_resumed: "timelineEventSubagentResumed",
  subagent_session_status_changed: "timelineEventSubagentStatus",
  subagent_stopped: "timelineEventSubagentStopped",
  todo_updated: "timelineEventTodoUpdated",
  token_usage: "timelineEventTokenUsage",
  user_question_answered: "timelineEventUserQuestionAnswered",
  user_question_requested: "timelineEventUserQuestion",
};

const PROTOCOL_VALUE_KEYS: Readonly<Record<string, TranslationKey>> = {
  applied: "timelineEventValueApplied",
  awaiting_approval: "timelineRoundStatusAwaitingApproval",
  awaiting_input: "timelineRoundStatusAwaitingInput",
  awaiting_manual_action: "timelineEventValueAwaitingManualAction",
  awaiting_subagent: "timelineRoundStatusAwaitingSubagent",
  awaiting_subagent_followup: "timelineEventValueAwaitingSubagentFollowup",
  cancelled: "timelineRoundStatusCancelled",
  completed: "timelineRoundStatusCompleted",
  failed: "timelineRoundStatusFailed",
  finished: "timelineRoundStatusFinished",
  idle: "timelineRoundStatusIdle",
  in_progress: "timelineTodoInProgress",
  paused: "timelineRoundStatusPaused",
  pending: "timelineTodoPending",
  queued: "timelineRoundStatusQueued",
  recovering: "timelineRoundStatusRecovering",
  running: "timelineRoundStatusRunning",
  scheduled: "timelineEventValueScheduled",
  stopped: "timelineRoundStatusStopped",
  stopping: "timelineRoundStatusStopping",
  subagent_running: "timelineEventValueSubagentRunning",
};

export function runtimeStructuredEventText(
  entry: TimelineEntry,
  t: Translate,
): string | null {
  const labelKey = EVENT_LABEL_KEYS[entry.kind];
  if (labelKey === undefined) {
    return null;
  }
  const payload = jsonObject(entry.payload);
  if (payload === null || payloadHasParseError(payload)) {
    return null;
  }
  const summary = structuredEventSummary(entry.kind, payload, t);
  return summary.length > 0 ? `${t(labelKey)}: ${summary}` : null;
}

export function runtimeBackgroundTaskPrimaryText(
  kind: string,
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  if (kind === "background_task_updated") {
    return objectString(payload, "delta")
      || objectString(payload, "output_excerpt")
      || objectString(payload, "title")
      || objectString(payload, "command")
      || runtimePayloadSummary(payload, t);
  }
  return objectString(payload, "title")
    || objectString(payload, "input_text")
    || objectString(payload, "command")
    || objectString(payload, "output_excerpt")
    || runtimePayloadSummary(payload, t);
}

export function runtimeInjectionSummary(
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  const content = runtimeContentValueText(payload.content);
  const redactedLength = objectNumber(payload, "content_length");
  const source = objectString(payload, "source");
  const deliveryMode = objectString(payload, "delivery_mode")
    || objectString(payload, "internal_delivery_mode");
  const recipient = objectString(payload, "recipient_instance_id");
  return [
    content.length > 0 ? truncatePreview(content) : "",
    content.length === 0 && redactedLength > 0
      ? t("timelineEventRedactedCharacters", { count: formatCount(redactedLength) })
      : "",
    source.length > 0 ? t("timelineEventSource", { value: protocolValue(source, t) }) : "",
    deliveryMode.length > 0
      ? t("timelineEventMode", { value: protocolValue(deliveryMode, t) })
      : "",
    recipient.length > 0 ? t("timelineEventRecipient", { value: recipient }) : "",
  ].filter(Boolean).join(" · ");
}

export function injectionStatusLabel(
  status: "applied" | "failed" | "queued",
  t: Translate,
): string {
  if (status === "failed") {
    return t("timelineEventInjectionFailed");
  }
  return status === "applied"
    ? t("timelineEventInjectionApplied")
    : t("timelineEventInjectionQueued");
}

function structuredEventSummary(
  kind: string,
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  if (kind === "token_usage") {
    return tokenUsageSummary(payload, t);
  }
  if (kind === "todo_updated") {
    return todoSummary(payload, t);
  }
  if (kind === "model_step_started" || kind === "model_step_finished") {
    return modelStepSummary(payload, t);
  }
  if (kind === "notification_requested") {
    return notificationSummary(payload, t);
  }
  if (kind.startsWith("background_task_")) {
    return backgroundTaskSummary(kind, payload, t);
  }
  if (kind === "user_question_requested") {
    return userQuestionSummary(payload, t);
  }
  if (kind === "user_question_answered") {
    return userQuestionAnsweredSummary(payload, t);
  }
  if (kind === "injection_enqueued" || kind === "injection_applied") {
    return runtimeInjectionSummary(payload, t);
  }
  if (kind === "subagent_session_status_changed") {
    return subagentStatusSummary(payload, t);
  }
  if (kind === "subagent_stopped" || kind === "subagent_resumed") {
    return subagentLifecycleSummary(payload, t);
  }
  if (kind === "awaiting_manual_action") {
    return rootTaskSummary(payload, t);
  }
  if (kind === "run_failed") {
    return runFailureSummary(payload, t);
  }
  if (kind.startsWith("run_")) {
    return runLifecycleSummary(payload, t);
  }
  return runtimePayloadSummary(payload, t);
}

function tokenUsageSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const values: Array<[string, TranslationKey]> = [
    ["total_tokens", "timelineEventTokenTotal"],
    ["input_tokens", "timelineEventTokenInput"],
    ["cached_input_tokens", "timelineEventTokenCached"],
    ["output_tokens", "timelineEventTokenOutput"],
    ["reasoning_output_tokens", "timelineEventTokenReasoning"],
  ];
  return values.flatMap(([field, key]) => {
    const value = objectNumber(payload, field);
    return value > 0 ? [t(key, { value: formatCount(value) })] : [];
  }).join(" · ");
}

function todoSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const items = jsonObjectArray(payload.items);
  const counts = new Map<string, number>();
  for (const item of items) {
    const status = objectString(item, "status");
    if (status.length > 0) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }
  const active = items.find((item) => objectString(item, "status") === "in_progress")
    ?? items.find((item) => objectString(item, "status") === "pending")
    ?? items.at(0);
  const activeText = active === undefined ? "" : objectString(active, "content");
  const version = objectNumber(payload, "version");
  const updatedBy = objectString(payload, "updated_by_instance_id")
    || objectString(payload, "updated_by_role_id");
  return [
    items.length > 0 ? t("timelineEventItemCount", { count: formatCount(items.length) }) : "",
    Array.from(counts.entries()).map(([status, count]) =>
      t("timelineEventStatusCount", {
        count: formatCount(count),
        status: protocolValue(status, t),
      })).join(", "),
    activeText.length > 0 ? t("timelineEventCurrent", { value: activeText }) : "",
    version > 0 ? `v${formatCount(version)}` : "",
    updatedBy.length > 0 ? t("timelineEventUpdatedBy", { value: updatedBy }) : "",
    items.length === 0 ? payloadSummaryText(payload) : "",
  ].filter(Boolean).join(" · ");
}

function modelStepSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const role = objectString(payload, "role_id");
  const instance = objectString(payload, "instance_id");
  return [
    role.length > 0 ? t("timelineEventRole", { value: role }) : "",
    instance.length > 0 ? t("timelineEventInstance", { value: instance }) : "",
  ].filter(Boolean).join(" · ") || runtimePayloadSummary(payload, t);
}

function notificationSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const title = objectString(payload, "title")
    || objectString(payload, "body")
    || runtimePayloadSummary(payload, t);
  const type = objectString(payload, "notification_type") || objectString(payload, "type");
  const channels = jsonStringArray(payload.channels).join(", ");
  return [
    title,
    type.length > 0 ? t("timelineEventType", { value: protocolValue(type, t) }) : "",
    channels.length > 0 ? t("timelineEventChannels", { value: channels }) : "",
  ].filter(Boolean).join(" · ");
}

function backgroundTaskSummary(
  kind: string,
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  const primary = runtimeBackgroundTaskPrimaryText(kind, payload, t);
  const status = objectString(payload, "status");
  const exitCode = scalarText(payload.exit_code);
  const taskKind = objectString(payload, "kind");
  const taskId = objectString(payload, "background_task_id");
  return [
    primary.length > 0 ? truncatePreview(primary) : "",
    status.length > 0 ? t("timelineEventStatus", { value: protocolValue(status, t) }) : "",
    exitCode.length > 0 ? t("timelineEventExitCode", { value: exitCode }) : "",
    taskKind.length > 0 ? t("timelineEventKind", { value: taskKind }) : "",
    taskId.length > 0 ? `#${taskId}` : "",
  ].filter(Boolean).join(" · ");
}

function userQuestionSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const questions = jsonObjectArray(payload.questions);
  const firstQuestion = questions.at(0);
  const text = firstQuestion === undefined
    ? runtimePayloadSummary(payload, t)
    : objectString(firstQuestion, "question")
      || objectString(firstQuestion, "header")
      || runtimePayloadSummary(firstQuestion, t);
  const id = objectString(payload, "question_id");
  return [
    text.length > 0 ? truncatePreview(text) : "",
    questions.length > 1
      ? t("timelineEventQuestionCount", { count: formatCount(questions.length) })
      : "",
    id.length > 0 ? `#${id}` : "",
  ].filter(Boolean).join(" · ");
}

function userQuestionAnsweredSummary(
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  const status = objectString(payload, "status");
  const answerCount = Array.isArray(payload.answers) ? payload.answers.length : 0;
  const id = objectString(payload, "question_id");
  return [
    status.length > 0 ? t("timelineEventStatus", { value: protocolValue(status, t) }) : "",
    answerCount > 0
      ? t("timelineEventAnswerCount", { count: formatCount(answerCount) })
      : "",
    id.length > 0 ? `#${id}` : "",
    status.length === 0 && answerCount === 0 ? runtimePayloadSummary(payload, t) : "",
  ].filter(Boolean).join(" · ");
}

function subagentStatusSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const title = objectString(payload, "title");
  const status = objectString(payload, "status") || objectString(payload, "run_status");
  const phase = objectString(payload, "run_phase");
  const role = objectString(payload, "subagent_role_id") || objectString(payload, "role_id");
  const instance = objectString(payload, "subagent_instance_id")
    || objectString(payload, "instance_id");
  return [
    title.length > 0 ? truncatePreview(title) : "",
    status.length > 0 ? t("timelineEventStatus", { value: protocolValue(status, t) }) : "",
    phase.length > 0 ? t("timelineEventPhase", { value: protocolValue(phase, t) }) : "",
    role.length > 0 ? t("timelineEventRole", { value: role }) : "",
    instance.length > 0 ? t("timelineEventInstance", { value: instance }) : "",
  ].filter(Boolean).join(" · ");
}

function subagentLifecycleSummary(
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  return [
    field(payload, "reason", "timelineEventReason", t, true),
    field(payload, "role_id", "timelineEventRole", t),
    field(payload, "instance_id", "timelineEventInstance", t),
    field(payload, "task_id", "timelineEventTask", t),
  ].filter(Boolean).join(" · ");
}

function rootTaskSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const rootTask = objectString(payload, "root_task_id") || objectString(payload, "root_task");
  return rootTask.length > 0
    ? t("timelineEventRootTask", { value: rootTask })
    : runtimePayloadSummary(payload, t);
}

function runLifecycleSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const status = objectString(payload, "status");
  const output = objectString(payload, "output")
    || objectString(payload, "message")
    || objectString(payload, "error")
    || objectString(payload, "reason");
  const rootTask = objectString(payload, "root_task_id") || objectString(payload, "root_task");
  return [
    status.length > 0 ? t("timelineEventStatus", { value: protocolValue(status, t) }) : "",
    output.length > 0 ? truncatePreview(output) : "",
    rootTask.length > 0 ? t("timelineEventRootTask", { value: rootTask }) : "",
  ].filter(Boolean).join(" · ") || runtimePayloadSummary(payload, t);
}

function runFailureSummary(payload: Record<string, JsonValue>, t: Translate): string {
  const status = objectString(payload, "status");
  const code = objectString(payload, "error_code") || objectString(payload, "code");
  const statusCode = objectNumber(payload, "status_code");
  const model = objectString(payload, "model_name");
  const error = jsonObject(payload.error);
  const detail = objectString(payload, "error")
    || objectString(payload, "message")
    || objectString(error, "message")
    || objectString(jsonObject(payload.detail), "message")
    || objectString(jsonObject(payload.detail), "error");
  const errorType = objectString(error, "type");
  const rootTask = objectString(payload, "root_task_id") || objectString(payload, "root_task");
  return [
    status.length > 0 ? t("timelineEventStatus", { value: protocolValue(status, t) }) : "",
    code.length > 0 ? t("timelineEventCode", { value: code }) : "",
    statusCode > 0 ? `HTTP ${formatCount(statusCode)}` : "",
    model.length > 0 ? t("timelineEventModel", { value: model }) : "",
    detail.length > 0 ? truncatePreview(detail) : "",
    errorType.length > 0 ? t("timelineEventType", { value: errorType }) : "",
    rootTask.length > 0 ? t("timelineEventRootTask", { value: rootTask }) : "",
  ].filter(Boolean).join(" · ");
}

function runtimePayloadSummary(
  payload: Record<string, JsonValue>,
  t: Translate,
): string {
  return payloadSummaryText(payload) || scalarFieldSummary(payload, t);
}

function payloadSummaryText(payload: Record<string, JsonValue>): string {
  return objectString(payload, "summary")
    || objectString(payload, "title")
    || objectString(payload, "message")
    || objectString(payload, "status");
}

function scalarFieldSummary(payload: Record<string, JsonValue>, t: Translate): string {
  return Object.entries(payload).flatMap(([key, value]) => {
    const text = scalarText(value);
    if (text.length === 0) {
      return [];
    }
    const labelKey = structuredFieldKey(key);
    return labelKey === null
      ? [`${key}: ${text}`]
      : [t(labelKey, { value: protocolValue(text, t) })];
  }).slice(0, 3).join(" · ");
}

function structuredFieldKey(key: string): TranslationKey | null {
  const keys: Readonly<Record<string, TranslationKey>> = {
    code: "timelineEventCode",
    error_code: "timelineEventCode",
    exit_code: "timelineEventExitCode",
    instance_id: "timelineEventInstance",
    kind: "timelineEventKind",
    model_name: "timelineEventModel",
    phase: "timelineEventPhase",
    reason: "timelineEventReason",
    role_id: "timelineEventRole",
    root_task: "timelineEventRootTask",
    root_task_id: "timelineEventRootTask",
    source: "timelineEventSource",
    status: "timelineEventStatus",
    task_id: "timelineEventTask",
    type: "timelineEventType",
  };
  return keys[key] ?? null;
}

function protocolValue(value: string, t: Translate): string {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  const key = PROTOCOL_VALUE_KEYS[normalized];
  return key === undefined ? value : t(key);
}

function field(
  payload: Record<string, JsonValue>,
  payloadKey: string,
  translationKey: TranslationKey,
  t: Translate,
  translateValue = false,
): string {
  const value = objectString(payload, payloadKey);
  return value.length === 0
    ? ""
    : t(translationKey, { value: translateValue ? protocolValue(value, t) : value });
}

function runtimeContentValueText(value: JsonValue | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value.flatMap((part) => {
    const object = jsonObject(part);
    if (object === null) {
      return [];
    }
    const text = objectString(object, "text") || objectString(object, "content");
    return text.length > 0 ? [text] : [];
  }).join("\n").trim();
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function jsonObjectArray(value: JsonValue | undefined): Record<string, JsonValue>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const object = jsonObject(item);
        return object === null ? [] : [object];
      })
    : [];
}

function objectString(payload: Record<string, JsonValue> | null, key: string): string {
  if (payload === null) {
    return "";
  }
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function objectNumber(payload: Record<string, JsonValue>, key: string): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scalarText(value: JsonValue | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function jsonStringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function payloadHasParseError(payload: Record<string, JsonValue>): boolean {
  return payload.parse_error === true || payload._parse_error === true;
}

function formatCount(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("en-US");
}

function truncatePreview(value: string, limit = 240): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
