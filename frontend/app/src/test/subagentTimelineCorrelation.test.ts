import { describe, expect, it } from "vitest";

import type { SessionSubagentRecord, TimelineMessage } from "../api/contracts";
import { correlateSessionSubagents } from "../features/timeline/subagentTimelineCorrelation";

describe("subagent timeline correlation", () => {
  it("correlates a structured dispatch without prompt or role arguments", () => {
    const messages: TimelineMessage[] = [{
      message: { parts: [{
        action_family: "orchestration",
        args: {
          task_id: "structured-task",
        },
        kind: "tool-call",
        semantic_category: "orchestration",
        tool_call_id: "structured-call",
        tool_name: "orch_dispatch_task",
      }] },
      role: "assistant",
      task_id: "root-task",
      trace_id: "root-run",
    }];

    expect(correlateSessionSubagents(messages, [{
      instance_id: "structured-instance",
      role_id: "Crafter",
      run_id: "structured-run",
      source_run_id: "root-run",
      source_tool_call_id: "structured-call",
      subagent_task_id: "structured-task",
    }])).toEqual([
      expect.objectContaining({
        instanceId: "structured-instance",
        sourceRunId: "root-run",
        sourceToolCallId: "structured-call",
        taskId: "structured-task",
      }),
    ]);
  });

  it("correlates legacy orchestration dispatches by their assigned task", () => {
    const messages: TimelineMessage[] = [{
      message: { parts: [{
        action_family: "orchestration",
        args: {
          prompt: "Implement the compact timeline.",
          role_id: "Crafter",
          task_id: "child-task",
        },
        kind: "tool-call",
        semantic_category: "orchestration",
        tool_call_id: "dispatch-call",
        tool_name: "legacy-dispatch",
      }] },
      message_id: "parent-message",
      role: "assistant",
      task_id: "root-task",
      trace_id: "root-run",
    }];
    const records: SessionSubagentRecord[] = [{
      instance_id: "crafter-instance",
      role_id: "Crafter",
      run_id: "root-run",
      source_run_id: "root-run",
      subagent_task_id: "child-task",
      title: "Compact timeline",
    }];

    expect(correlateSessionSubagents(messages, records)).toEqual([
      expect.objectContaining({
        instanceId: "crafter-instance",
        sourceRunId: "root-run",
        sourceTaskId: "child-task",
        sourceToolCallId: "dispatch-call",
        taskId: "child-task",
      }),
    ]);
  });

  it("correlates persisted dispatches whose arguments are serialized JSON", () => {
    const messages: TimelineMessage[] = [{
      message: { parts: [{
        args: JSON.stringify({
          prompt: "Inspect the replay.",
          role_id: "Explorer",
          task_id: "serialized-task",
        }),
        kind: "tool-call",
        tool_call_id: "serialized-call",
        tool_name: "persisted-dispatch",
      }] },
      role: "assistant",
      task_id: "root-task",
      trace_id: "root-run",
    }];

    expect(correlateSessionSubagents(messages, [{
      instance_id: "explorer-instance",
      role_id: "Explorer",
      run_id: "root-run",
      source_run_id: "root-run",
      subagent_task_id: "serialized-task",
    }])).toEqual([
      expect.objectContaining({
        sourceToolCallId: "serialized-call",
        taskId: "serialized-task",
      }),
    ]);
  });

  it("does not let task maintenance calls make a legacy dispatch ambiguous", () => {
    const messages: TimelineMessage[] = [{
      message: { parts: [
        {
          args: JSON.stringify({
            prompt: "Inspect the real browser replay.",
            role_id: "Explorer",
            task_id: "shared-task",
          }),
          kind: "tool-call",
          tool_call_id: "dispatch-call",
          tool_name: "legacy-dispatch",
        },
        {
          action_family: "orchestration",
          args: { task_id: "shared-task" },
          kind: "tool-call",
          semantic_category: "orchestration",
          tool_call_id: "maintenance-call",
          tool_name: "task-maintenance",
        },
      ] },
      role: "assistant",
      task_id: "root-task",
      trace_id: "root-run",
    }];

    expect(correlateSessionSubagents(messages, [{
      instance_id: "explorer-instance",
      role_id: "Explorer",
      run_id: "child-run",
      source_run_id: "root-run",
      subagent_task_id: "shared-task",
    }])).toEqual([
      expect.objectContaining({
        sourceToolCallId: "dispatch-call",
        taskId: "shared-task",
      }),
    ]);
  });

  it("does not reinterpret an ordinary orchestration tool as a subagent", () => {
    const messages: TimelineMessage[] = [{
      message: { parts: [{
        action_family: "orchestration",
        args: {
          prompt: "List the delegated work.",
          role_id: "Crafter",
        },
        kind: "tool-call",
        semantic_category: "orchestration",
        tool_call_id: "list-call",
        tool_name: "ordinary-orchestration",
      }] },
      message_id: "parent-message",
      role: "assistant",
      task_id: "root-task",
      trace_id: "root-run",
    }];

    expect(correlateSessionSubagents(messages, [{
      instance_id: "crafter-instance",
      role_id: "Crafter",
      run_id: "root-run",
      subagent_task_id: "child-task",
    }])).toEqual([]);
  });
});
