import { describe, expect, it } from "vitest";

import {
  humanReadableToolText,
  formatToolDuration,
  toolActionFamily,
  toolDurationMs,
  toolSemanticCategory,
} from "../features/timeline/toolPresentation";

describe("toolPresentation", () => {
  it.each([
    ["read", "file-read", "read"],
    ["glob", "file-read", "search"],
    ["apply_patch", "file-edit", "edit"],
    ["shell", "execution", "run"],
    ["websearch", "web", "search"],
    ["browser_click", "web", "search"],
    ["orch_dispatch_task", "orchestration", "subagent"],
    ["orch_create_tasks", "orchestration", "orchestration"],
    ["orch_update_task", "orchestration", "orchestration"],
    ["orch_list_available_roles", "orchestration", "orchestration"],
    ["orch_create_temporary_role", "orchestration", "orchestration"],
    ["ask_question", "interactive", "generic"],
    ["todo_write", "planning", "generic"],
    ["memory_rewrite", "memory-artifact", "generic"],
    ["custom_server_tool", "unknown", "generic"],
  ] as const)("classifies %s", (toolName, semantic, family) => {
    expect(toolSemanticCategory(toolName)).toBe(semantic);
    expect(toolActionFamily(toolName)).toBe(family);
  });

  it("renders common result collections as readable lists", () => {
    expect(humanReadableToolText("grep", '{"matches":["a.ts:1","b.ts:2"]}'))
      .toBe("- a.ts:1\n- b.ts:2");
  });

  it("renders known tool objects as labelled fields instead of raw JSON", () => {
    expect(humanReadableToolText("websearch", '{"query":"SSE batching","limit":5}'))
      .toBe("query: SSE batching\nlimit: 5");
  });

  it("keeps unknown nested payloads available as formatted JSON", () => {
    expect(humanReadableToolText("custom_server_tool", '{"result":{"ok":true}}'))
      .toContain('"result"');
  });

  it("unwraps standard execution envelopes without exposing internal metadata", () => {
    const envelope = JSON.stringify({
      data: { exit_code: 0, stdout: "tests passed" },
      meta: { duration_ms: 1250, tool_result_event_published: true },
      ok: true,
    });

    expect(humanReadableToolText("shell", envelope))
      .toBe("exit code: 0\nstdout: tests passed");
    expect(toolDurationMs(envelope)).toBe(1250);
    expect(formatToolDuration(1250)).toBe("1.3 s");
  });

  it("formats short and long tool durations compactly", () => {
    expect(formatToolDuration(42)).toBe("42 ms");
    expect(formatToolDuration(65_000)).toBe("1m 5s");
  });
});
