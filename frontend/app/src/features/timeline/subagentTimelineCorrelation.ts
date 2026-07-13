import type {
  ContentPart,
  JsonValue,
  SessionSubagentRecord,
  TimelineMessage,
} from "../../api/contracts";
import { contentPartText } from "../../api/contracts";

export interface CorrelatedSubagentRecord {
  instanceId: string;
  interactive?: boolean;
  roleId: string;
  runId: string;
  runPhase: string;
  runStatus: string;
  sourceRunId: string;
  sourceTaskId: string;
  sourceToolCallId: string;
  status: string;
  subagentKind: string;
  taskId: string;
  title: string;
}

interface ToolCallSite {
  callId: string;
  prompt: string;
  roleId: string;
  runId: string;
  taskId: string;
}

export function correlateSessionSubagents(
  messages: readonly TimelineMessage[],
  records: readonly SessionSubagentRecord[],
): CorrelatedSubagentRecord[] {
  const callSites = messages.flatMap(messageToolCallSites);
  return records.flatMap((record) => {
    const explicit = explicitSourceCallSite(record, callSites);
    const taskScoped = explicit === null
      ? taskSourceCallSite(record, callSites)
      : null;
    const callSite = explicit ?? taskScoped ?? legacySourceCallSite(
      record,
      messages,
      callSites,
    );
    if (callSite === null) {
      return [];
    }
    const instanceId = recordIdentity(record, "instance");
    const runId = recordIdentity(record, "run");
    const taskId = recordIdentity(record, "task");
    if (instanceId.length === 0 && runId.length === 0 && taskId.length === 0) {
      return [];
    }
    return [{
      instanceId,
      interactive: record.interactive,
      roleId: recordIdentity(record, "role"),
      runId,
      runPhase: normalized(record.run_phase),
      runStatus: normalized(record.run_status),
      sourceRunId: callSite.runId,
      sourceTaskId: callSite.taskId,
      sourceToolCallId: callSite.callId,
      status: normalized(record.status),
      subagentKind: normalized(record.subagent_kind),
      taskId,
      title: normalized(record.title),
    }];
  });
}

function taskSourceCallSite(
  record: SessionSubagentRecord,
  callSites: readonly ToolCallSite[],
): ToolCallSite | null {
  const taskId = recordIdentity(record, "task");
  if (taskId.length === 0) {
    return null;
  }
  const sourceRunId = normalized(record.source_run_id);
  const roleId = recordIdentity(record, "role");
  const matches = callSites.filter((callSite) =>
    callSite.taskId === taskId &&
    (sourceRunId.length === 0 || callSite.runId === sourceRunId) &&
    (roleId.length === 0 || callSite.roleId === roleId)
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

function explicitSourceCallSite(
  record: SessionSubagentRecord,
  callSites: readonly ToolCallSite[],
): ToolCallSite | null {
  const callId = normalized(record.source_tool_call_id);
  if (callId.length === 0) {
    return null;
  }
  const sourceRunId = normalized(record.source_run_id);
  const sourceTaskId = normalized(record.source_task_id);
  const matches = callSites.filter((callSite) =>
    callSite.callId === callId &&
    (sourceRunId.length === 0 || callSite.runId === sourceRunId) &&
    (sourceTaskId.length === 0 || callSite.taskId === sourceTaskId)
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

function legacySourceCallSite(
  record: SessionSubagentRecord,
  messages: readonly TimelineMessage[],
  callSites: readonly ToolCallSite[],
): ToolCallSite | null {
  if (normalized(record.source_tool_call_id).length > 0) {
    return null;
  }
  const roleId = recordIdentity(record, "role");
  const prompt = childPrompt(record, messages);
  if (roleId.length === 0 || prompt.length === 0) {
    return null;
  }
  const matches = callSites.filter((callSite) =>
    callSite.roleId === roleId && callSite.prompt === prompt
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

function childPrompt(
  record: SessionSubagentRecord,
  messages: readonly TimelineMessage[],
): string {
  const instanceId = recordIdentity(record, "instance");
  const taskId = recordIdentity(record, "task");
  const runId = recordIdentity(record, "run");
  const candidates = messages.filter((message) => {
    if (normalized(message.role).toLowerCase() !== "user") {
      return false;
    }
    const messageInstanceId = normalized(message.instance_id);
    const messageTaskId = normalized(message.task_id);
    const messageRunId = messageRunIdentity(message);
    if (instanceId.length > 0 && messageInstanceId !== instanceId) {
      return false;
    }
    if (taskId.length > 0 && messageTaskId.length > 0 && messageTaskId !== taskId) {
      return false;
    }
    if (runId.length > 0 && messageRunId.length > 0 && messageRunId !== runId) {
      return false;
    }
    return instanceId.length > 0 || taskId.length > 0 || runId.length > 0;
  });
  if (candidates.length !== 1) {
    return "";
  }
  return messageText(candidates[0] ?? {});
}

function messageToolCallSites(message: TimelineMessage): ToolCallSite[] {
  const runId = messageRunIdentity(message);
  return messageParts(message).flatMap((part) => {
    if (!(
      ("kind" in part && part.kind === "tool-call") ||
      ("part_kind" in part && part.part_kind === "tool-call")
    )) {
      return [];
    }
    const callId = normalized(part.tool_call_id);
    const args = jsonObject(part.args);
    const roleId = jsonString(args, "role_id");
    const prompt = jsonString(args, "prompt");
    const taskId = jsonString(args, "task_id") || normalized(message.task_id);
    const isLegacyOrchestrationDispatch =
      part.action_family === "orchestration" &&
      part.semantic_category === "orchestration" &&
      jsonString(args, "task_id").length > 0;
    if (
      (
        part.action_family !== undefined &&
        part.action_family !== "subagent" &&
        !isLegacyOrchestrationDispatch
      ) ||
      (
        part.semantic_category !== undefined &&
        part.semantic_category !== "orchestration"
      )
    ) {
      return [];
    }
    if (callId.length === 0 || roleId.length === 0 || prompt.length === 0) {
      return [];
    }
    return [{ callId, prompt, roleId, runId, taskId }];
  });
}

function messageParts(message: TimelineMessage): ContentPart[] {
  return message.message?.parts ?? message.parts ?? [];
}

function messageText(message: TimelineMessage): string {
  const direct = normalized(message.content ?? message.message?.content);
  if (direct.length > 0) {
    return direct;
  }
  for (const part of messageParts(message)) {
    const text = normalized(contentPartText(part));
    if (text.length > 0) {
      return text;
    }
  }
  return "";
}

function messageRunIdentity(message: TimelineMessage): string {
  return normalized(message.trace_id ?? message.run_id);
}

function recordIdentity(
  record: SessionSubagentRecord,
  field: "instance" | "role" | "run" | "task",
): string {
  const values = {
    instance: [record.subagent_instance_id, record.instance_id],
    role: [record.subagent_role_id, record.role_id],
    run: [record.subagent_run_id, record.run_id],
    task: [record.subagent_task_id, record.task_id],
  }[field];
  return values.map(normalized).find((value) => value.length > 0) ?? "";
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function jsonString(
  value: Record<string, JsonValue> | null,
  key: string,
): string {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? "";
}
