import { describe, expect, it } from "vitest";

import type { SessionSubagentRecord, TimelineMessage } from "../api/contracts";
import { correlateSessionSubagents } from "../features/timeline/subagentTimelineCorrelation";

describe("subagent timeline correlation", () => {
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
