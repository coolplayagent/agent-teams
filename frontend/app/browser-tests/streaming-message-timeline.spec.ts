import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test, type Page } from "@playwright/test";

import { serveFrontendDist } from "./support/frontend-app";

const WAIT_TIMEOUT_MS = 10_000;

interface OverlayPart {
  closed?: boolean;
  content?: string;
  kind: string;
  status?: string;
  toolCallId?: string;
}

interface TextToolPayload {
  cursorCount?: number;
  overlayParts?: OverlayPart[];
  rawTextBlocks?: string[];
  textBlocks?: string[];
  toolBlockCount?: number;
}

interface PartialRepeatedPayload {
  occurrences: number;
  text: string;
  toolBlockCount: number;
}

interface RichTextPayload {
  cursorCount: number;
  strongText: string;
  text: string;
}

interface ToolArgsPayload {
  livePreview: string;
  overlayAfterPersist: unknown;
  persistedPreview: string;
  persistedToolCount: number;
}

interface ToolSummaryVisualState {
  labelOpacity: number;
  previewOpacity: number;
  status: string;
  statusOpacity: number;
  summaryAlpha: number;
}

interface ToolSummaryPayload {
  completed: ToolSummaryVisualState;
  error: ToolSummaryVisualState;
}

interface StreamTimelineHarnessWindow {
  __streamTimelineHarness: Record<string, () => unknown> & {
    readToolSummaryVisualWeight: (toolCallId: string) => ToolSummaryVisualState;
  };
}

test("live text around tool calls stays visible", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderLiveTextAroundToolCalls",
    );

    expect(payload.textBlocks).toEqual([
      "before tool",
      "during tool",
      "after result",
    ]);
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.cursorCount).toBe(1);
    expect(textOverlayTriples(payload.overlayParts)).toEqual([
      ["text", "before tool", true],
      ["text", "during tool", true],
      ["text", "after result", false],
    ]);
  } finally {
    await appServer.close();
  }
});

test("overlay replay text around tool calls stays visible", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderOverlayReplayTextAroundToolCalls",
    );

    expect(payload.textBlocks).toEqual([
      "before tool",
      "during tool",
      "after result",
    ]);
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.cursorCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("overlay replay model-step boundary stays segmented", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderOverlayReplayTextAroundModelStepBoundary",
    );

    expect(payload.textBlocks).toEqual(["before retry", "after retry"]);
    expect(payload.cursorCount).toBe(1);
    expect(textOverlayTriples(payload.overlayParts)).toEqual([
      ["text", "before retry", true],
      ["text", "after retry", false],
    ]);
  } finally {
    await appServer.close();
  }
});

test("overlay replay model-step boundary preserves whitespace", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderOverlayReplayTextAroundModelStepBoundaryWhitespace",
    );

    expect(payload.rawTextBlocks).toEqual(["before retry ", "\n after retry"]);
    expect(
      (payload.overlayParts ?? [])
        .filter((part) => part.kind === "text")
        .map((part) => [part.content ?? "", part.closed === true]),
    ).toEqual([
      ["before retry ", true],
      ["\n after retry", false],
    ]);
  } finally {
    await appServer.close();
  }
});

test("output delta text around tool calls stays segmented", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderOutputDeltaTextAroundToolCalls",
    );

    expect(payload.textBlocks).toEqual([
      "before tool",
      "during tool",
      "after result",
    ]);
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.cursorCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("persisted history text around tool calls stays segmented", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TextToolPayload>(
      page,
      "renderPersistedHistoryTextAroundToolCalls",
    );

    expect(payload.textBlocks).toEqual([
      "before tool",
      "during tool",
      "after result",
    ]);
    expect(payload.toolBlockCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("partial persisted repeated text after tool is preserved", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<PartialRepeatedPayload>(
      page,
      "renderPartialPersistedRepeatedTextAroundTool",
    );

    expect(payload.occurrences).toBe(2);
    expect(payload.toolBlockCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("timeline text update keeps rich content and cursor", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RichTextPayload>(
      page,
      "renderTimelineTextUpdateKeepsRichContent",
    );

    expect(payload.text).toContain("hello bold");
    expect(payload.strongText).toBe("bold");
    expect(payload.cursorCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("streamed tool args match persisted history", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<ToolArgsPayload>(
      page,
      "renderToolArgsParity",
    );

    expect(payload.livePreview).toBe("Anthropic funding 2026");
    expect(payload.persistedPreview).toBe("Anthropic funding 2026");
    expect(payload.persistedToolCount).toBe(1);
    expect(payload.overlayAfterPersist).toBeNull();
  } finally {
    await appServer.close();
  }
});

test("completed tool summaries render muted by default", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    await runHarness<ToolSummaryPayload>(
      page,
      "renderToolSummaryVisualWeight",
    );
    await page.waitForTimeout(200);
    const payload = await readToolSummaryVisualWeights(page);
    await page
      .locator(
        '#tool-summary-visual-weight [data-tool-call-id="call-muted-tool"] > .tool-summary',
      )
      .hover();
    await page.waitForTimeout(200);
    const hoverPayload = await readToolSummaryVisualWeight(
      page,
      "call-muted-tool",
    );

    expect(payload.completed.labelOpacity).toBeLessThan(0.8);
    expect(payload.completed.previewOpacity).toBeLessThan(0.8);
    expect(payload.completed.statusOpacity).toBeLessThan(0.5);
    expect(hoverPayload.summaryAlpha).toBe(1);
    expect(hoverPayload.labelOpacity).toBe(1);
    expect(hoverPayload.previewOpacity).toBeGreaterThan(0.9);
    expect(hoverPayload.statusOpacity).toBeGreaterThanOrEqual(0.8);
    expect(payload.error.labelOpacity).toBe(1);
    expect(payload.error.previewOpacity).toBe(1);
    expect(payload.error.statusOpacity).toBe(1);
  } finally {
    await appServer.close();
  }
});

async function openStreamTimelineHarness(
  page: Page,
  baseUrl: string,
): Promise<void> {
  await page.goto(`${baseUrl}/stream-timeline-text-tools.html`);
  await page.waitForFunction(
    () =>
      (window as unknown as StreamTimelineHarnessWindow)
        .__streamTimelineHarness !== undefined,
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );
}

async function runHarness<T>(page: Page, methodName: string): Promise<T> {
  return page.evaluate<T, string>((selectedMethodName) => {
    const harness = (window as unknown as StreamTimelineHarnessWindow)
      .__streamTimelineHarness;
    return harness[selectedMethodName]() as T;
  }, methodName);
}

async function readToolSummaryVisualWeight(
  page: Page,
  toolCallId: string,
): Promise<ToolSummaryVisualState> {
  return page.evaluate<ToolSummaryVisualState, string>((selectedToolCallId) => {
    return (window as unknown as StreamTimelineHarnessWindow)
      .__streamTimelineHarness.readToolSummaryVisualWeight(selectedToolCallId);
  }, toolCallId);
}

async function readToolSummaryVisualWeights(
  page: Page,
): Promise<ToolSummaryPayload> {
  return page.evaluate<ToolSummaryPayload>(() => {
    const harness = (window as unknown as StreamTimelineHarnessWindow)
      .__streamTimelineHarness;
    return {
      completed: harness.readToolSummaryVisualWeight("call-muted-tool"),
      error: harness.readToolSummaryVisualWeight("call-error-tool"),
    };
  });
}

function textOverlayTriples(
  parts: OverlayPart[] | undefined,
): Array<[string, string, boolean]> {
  return (parts ?? [])
    .filter((part) => part.kind === "text")
    .map((part) => [
      part.kind,
      part.content ?? "",
      part.closed === true,
    ]);
}

function handleHarnessRequest(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/stream-timeline-text-tools.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(streamTimelineHarnessHtml());
    return true;
  }
  return false;
}

function streamTimelineHarnessHtml(): string {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>stream timeline harness</title>
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/components/tools.css">
  <link rel="stylesheet" href="/css/components/rounds/navigator.css">
  <link rel="stylesheet" href="/css/components/subagent.css">
</head>
<body>
  <div id="chat-messages"></div>
  <script type="module">
    import {
      appendStreamChunk,
      appendToolCallBlock,
      applyStreamOverlayEvent,
      clearAllStreamState,
      getCoordinatorStreamOverlay,
      getOrCreateStreamBlock,
      updateToolResult,
    } from "/js/components/messageRenderer/stream.js";
    import {
      renderHistoricalMessageList,
    } from "/js/components/messageRenderer/history.js";
    import {
      renderTimelineStream,
    } from "/js/components/messageTimeline/renderer.js";
    import {
      applyTimelineAction,
      clearTimelineState,
    } from "/js/components/messageTimeline/store.js";

    function makeContainer(id) {
      const container = document.createElement("section");
      container.id = id;
      document.body.appendChild(container);
      return container;
    }

    function renderHistory(container, messages, options) {
      container.replaceChildren();
      renderHistoricalMessageList(container, messages, {
        pendingToolApprovals: [],
        isLatestRound: true,
        ...options,
      });
    }

    function countSubstring(source, needle) {
      const haystack = String(source || "");
      const target = String(needle || "");
      if (!target) return 0;
      return haystack.split(target).length - 1;
    }

    function cssColorAlpha(value) {
      const text = String(value || "").trim();
      const colorAlpha = text.match(/\\/\\s*([0-9.]+)\\)?$/);
      if (colorAlpha) return Number(colorAlpha[1]);
      const rgbaAlpha = text.match(/^rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9.]+)\\)$/);
      if (rgbaAlpha) return Number(rgbaAlpha[1]);
      return 1;
    }

    function readToolSummaryVisualState(block) {
      const summary = block.querySelector(".tool-summary");
      const label = summary.querySelector(".tool-summary-label");
      const preview = summary.querySelector(".tool-summary-preview");
      const status = summary.querySelector(".tool-status");
      return {
        status: block.dataset.status || "",
        summaryAlpha: cssColorAlpha(getComputedStyle(summary).color),
        labelOpacity: Number(getComputedStyle(label).opacity),
        previewOpacity: Number(getComputedStyle(preview).opacity),
        statusOpacity: Number(getComputedStyle(status).opacity),
      };
    }

    function serializeOverlayPart(part) {
      return {
        kind: part.kind,
        content: part.content || "",
        closed: part.closed === true,
        toolCallId: part.tool_call_id || "",
        status: part.status || "",
      };
    }

    function textBlocks(container) {
      return Array.from(container.querySelectorAll(".msg-text"))
        .map(item => item.textContent.replace(/\\s+/g, " ").trim())
        .filter(Boolean);
    }

    window.__streamTimelineHarness = {
      readToolSummaryVisualWeight(toolCallId) {
        return readToolSummaryVisualState(
          document.querySelector('[data-tool-call-id="' + toolCallId + '"]'),
        );
      },

      renderLiveTextAroundToolCalls() {
        clearAllStreamState();
        const container = makeContainer("live-text-around-tools");
        const runId = "run-live-text-around-tools";
        getOrCreateStreamBlock(container, "primary", "Coordinator", "Main Agent", runId);
        appendStreamChunk("primary", "before tool", runId, "Coordinator", "Main Agent");
        appendToolCallBlock(
          container,
          "primary",
          "shell",
          { command: "date" },
          "call-live-text",
          { runId, roleId: "Coordinator", label: "Main Agent" },
        );
        appendStreamChunk("primary", "during tool", runId, "Coordinator", "Main Agent");
        updateToolResult(
          "primary",
          "shell",
          { ok: true, output: "tool done" },
          false,
          "call-live-text",
          { runId, roleId: "Coordinator", label: "Main Agent", container },
        );
        appendStreamChunk("primary", "after result", runId, "Coordinator", "Main Agent");
        const overlayParts = (getCoordinatorStreamOverlay(runId)?.parts || [])
          .map(serializeOverlayPart);
        return {
          textBlocks: textBlocks(container),
          toolBlockCount: container.querySelectorAll(".tool-block").length,
          overlayParts,
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderOverlayReplayTextAroundToolCalls() {
        clearAllStreamState();
        const container = makeContainer("overlay-text-around-tools");
        const runId = "run-overlay-text-around-tools";
        applyStreamOverlayEvent(
          "text_delta",
          { text: "before tool" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-text-1" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          { tool_name: "shell", tool_call_id: "call-overlay-text", args: { command: "date" } },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-tool-1" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "during tool" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-text-2" },
        );
        applyStreamOverlayEvent(
          "tool_result",
          { tool_name: "shell", tool_call_id: "call-overlay-text", result: { ok: true, output: "tool done" } },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-tool-2" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "after result" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-text-3" },
        );
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          textBlocks: textBlocks(container),
          toolBlockCount: container.querySelectorAll(".tool-block").length,
          overlayParts: (getCoordinatorStreamOverlay(runId)?.parts || [])
            .map(serializeOverlayPart),
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderOverlayReplayTextAroundModelStepBoundary() {
        clearAllStreamState();
        const container = makeContainer("overlay-text-around-model-step");
        const runId = "run-overlay-text-around-model-step";
        applyStreamOverlayEvent(
          "text_delta",
          { text: "before retry" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-text-1" },
        );
        applyStreamOverlayEvent(
          "model_step_finished",
          { role_id: "Coordinator", instance_id: "primary" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-finished-1" },
        );
        applyStreamOverlayEvent(
          "model_step_started",
          { role_id: "Coordinator", instance_id: "primary" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-started-1" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "after retry" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-text-2" },
        );
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          textBlocks: textBlocks(container),
          overlayParts: (getCoordinatorStreamOverlay(runId)?.parts || [])
            .map(serializeOverlayPart),
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderOverlayReplayTextAroundModelStepBoundaryWhitespace() {
        clearAllStreamState();
        const container = makeContainer("overlay-text-around-model-step-whitespace");
        const runId = "run-overlay-text-around-model-step-whitespace";
        applyStreamOverlayEvent(
          "text_delta",
          { text: "before retry " },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-whitespace-text-1" },
        );
        applyStreamOverlayEvent(
          "model_step_finished",
          { role_id: "Coordinator", instance_id: "primary" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-whitespace-finished-1" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "\\n after retry" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "overlay-step-whitespace-text-2" },
        );
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          rawTextBlocks: Array.from(container.querySelectorAll(".msg-text"))
            .map(item => item.textContent),
          overlayParts: (getCoordinatorStreamOverlay(runId)?.parts || [])
            .map(serializeOverlayPart),
        };
      },

      renderOutputDeltaTextAroundToolCalls() {
        clearAllStreamState();
        const container = makeContainer("output-delta-text-around-tools");
        const runId = "run-output-delta-text-around-tools";
        applyStreamOverlayEvent(
          "output_delta",
          { output: [{ kind: "text", text: "before tool" }] },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-text-1" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          { tool_name: "shell", tool_call_id: "call-output-text", args: { command: "date" } },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-tool-1" },
        );
        applyStreamOverlayEvent(
          "output_delta",
          { output: [{ kind: "text", text: "during tool" }] },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-text-2" },
        );
        applyStreamOverlayEvent(
          "tool_result",
          { tool_name: "shell", tool_call_id: "call-output-text", result: { ok: true, output: "tool done" } },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-tool-2" },
        );
        applyStreamOverlayEvent(
          "output_delta",
          { output: [{ kind: "text", text: "after result" }] },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-text-3" },
        );
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          textBlocks: textBlocks(container),
          toolBlockCount: container.querySelectorAll(".tool-block").length,
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderPersistedHistoryTextAroundToolCalls() {
        clearAllStreamState();
        const container = makeContainer("persisted-history-text-around-tools");
        const runId = "run-persisted-history-text-around-tools";
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "primary",
          message: {
            parts: [
              { part_kind: "text", content: "before tool" },
              {
                part_kind: "tool-call",
                tool_name: "shell",
                tool_call_id: "call-history-text",
                args: { command: "date" },
              },
              { part_kind: "text", content: "during tool" },
              {
                part_kind: "tool-return",
                tool_name: "shell",
                tool_call_id: "call-history-text",
                content: { ok: true, output: "tool done" },
              },
              { part_kind: "text", content: "after result" },
            ],
          },
        }], {
          runId,
          runStatus: "completed",
          streamOverlayEntry: null,
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          textBlocks: textBlocks(container),
          toolBlockCount: container.querySelectorAll(".tool-block").length,
        };
      },

      renderPartialPersistedRepeatedTextAroundTool() {
        clearAllStreamState();
        const container = makeContainer("partial-persisted-repeated-text");
        const runId = "run-partial-persisted-repeated-text";
        applyStreamOverlayEvent(
          "text_delta",
          { text: "same process text" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-text-1" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          { tool_name: "shell", tool_call_id: "call-partial-text", args: { command: "date" } },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-tool-1" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "same process text" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-text-2" },
        );
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "primary",
          created_at: "2026-04-25T12:00:01Z",
          message: {
            parts: [{ part_kind: "text", content: "same process text" }],
          },
        }], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          text: container.textContent || "",
          occurrences: countSubstring(container.textContent || "", "same process text"),
          toolBlockCount: container.querySelectorAll(".tool-block").length,
        };
      },

      renderTimelineTextUpdateKeepsRichContent() {
        clearTimelineState();
        const container = makeContainer("timeline-rich-text-update");
        const scope = {
          runId: "run-timeline-rich-text-update",
          instanceId: "primary",
          roleId: "Coordinator",
          streamKey: "primary",
          view: "main",
        };
        let stream = applyTimelineAction({
          type: "text_delta",
          scope,
          text: "hello **bo",
        });
        renderTimelineStream(container, stream, { label: "Main Agent" });
        stream = applyTimelineAction({
          type: "text_delta",
          scope,
          text: "ld**",
        });
        renderTimelineStream(container, stream, { label: "Main Agent" });
        return {
          text: container.textContent || "",
          strongText: container.querySelector("strong")?.textContent || "",
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderToolArgsParity() {
        clearAllStreamState();
        const container = makeContainer("tool-args");
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "websearch",
            tool_call_id: "call-search",
            args: '{"query":"Anthropic funding 2026"}',
          },
          {
            runId: "run-tool-args",
            instanceId: "primary",
            roleId: "main-role",
            label: "Main Agent",
          },
        );
        renderHistory(container, [], {
          runId: "run-tool-args",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-tool-args"),
        });
        const livePreview = container.querySelector(".tool-summary-preview")?.textContent?.trim() || "";
        renderHistory(container, [{
          role: "assistant",
          role_id: "main-role",
          instance_id: "primary",
          message: {
            parts: [{
              part_kind: "tool-call",
              tool_name: "websearch",
              tool_call_id: "call-search",
              args: '{"query":"Anthropic funding 2026"}',
            }],
          },
        }], {
          runId: "run-tool-args",
          runStatus: "completed",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-tool-args"),
        });
        return {
          livePreview,
          persistedPreview: container.querySelector(".tool-summary-preview")?.textContent?.trim() || "",
          persistedToolCount: container.querySelectorAll(".tool-block").length,
          overlayAfterPersist: getCoordinatorStreamOverlay("run-tool-args"),
        };
      },

      renderToolSummaryVisualWeight() {
        clearAllStreamState();
        const container = makeContainer("tool-summary-visual-weight");
        const runId = "run-tool-summary-visual-weight";
        getOrCreateStreamBlock(container, "primary", "Coordinator", "Main Agent", runId);
        appendToolCallBlock(
          container,
          "primary",
          "shell",
          { command: "date" },
          "call-muted-tool",
          { runId, roleId: "Coordinator", label: "Main Agent" },
        );
        updateToolResult(
          "primary",
          "shell",
          { ok: true, output: "done" },
          false,
          "call-muted-tool",
          { runId, roleId: "Coordinator", label: "Main Agent", container },
        );
        appendToolCallBlock(
          container,
          "primary",
          "grep",
          { pattern: "missing" },
          "call-error-tool",
          { runId, roleId: "Coordinator", label: "Main Agent" },
        );
        updateToolResult(
          "primary",
          "grep",
          { ok: false, error: "failed" },
          true,
          "call-error-tool",
          { runId, roleId: "Coordinator", label: "Main Agent", container },
        );
        return {
          completed: readToolSummaryVisualState(container.querySelector('[data-tool-call-id="call-muted-tool"]')),
          error: readToolSummaryVisualState(container.querySelector('[data-tool-call-id="call-error-tool"]')),
        };
      },
    };
  </script>
</body>
</html>
`.trim();
}
