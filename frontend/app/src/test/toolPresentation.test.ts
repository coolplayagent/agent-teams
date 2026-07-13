import { describe, expect, it } from "vitest";

import {
  humanReadableToolText,
  formatToolDuration,
  toolActionFamily,
  toolDurationMs,
  toolSemanticCategory,
} from "../features/timeline/toolPresentation";

describe("toolPresentation", () => {
  it("does not infer presentation semantics from a tool name", () => {
    expect(toolSemanticCategory("spawn_subagent")).toBe("unknown");
    expect(toolSemanticCategory("ask_question")).toBe("unknown");
    expect(toolActionFamily("spawn_subagent")).toBe("generic");
  });

  it("uses explicit presentation semantics from the transport contract", () => {
    expect(toolSemanticCategory("opaque", { semanticCategory: "interactive" }))
      .toBe("interactive");
    expect(toolActionFamily("opaque", { actionFamily: "subagent" }))
      .toBe("subagent");
    expect(toolActionFamily("opaque", { semanticCategory: "file-read" }))
      .toBe("read");
  });

  it("rejects unsupported semantic values instead of guessing", () => {
    expect(toolSemanticCategory("shell", { semanticCategory: "commandish" }))
      .toBe("unknown");
    expect(toolActionFamily("shell", { actionFamily: "execute-ish" }))
      .toBe("generic");
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
