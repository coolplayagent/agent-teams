import { describe, expect, it } from "vitest";

import {
  humanReadableToolText,
  toolActionFamily,
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
});
