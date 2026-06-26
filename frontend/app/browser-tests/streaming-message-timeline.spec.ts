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

interface SessionSwitchPayload {
  hydratedSessionOneText: string;
  hydratedSessionOneThinkingCount: number;
  sessionOneThinkingCount: number;
  sessionTwoText: string;
}

interface PrimaryAliasPayload {
  overlayAfterPersist: unknown;
  text: string;
  thinkingCount: number;
  toolCount: number;
}

interface RepeatedSessionSwitchPayload {
  finalRunAThinkingCount: number;
  finalRunBThinkingCount: number;
  foreignLeakCount: number;
  iterations: number;
  maxIntroOccurrences: number;
  maxToolDuplicateCount: number;
  overlayAfterFullRunA: unknown;
  overlayAfterFullRunB: unknown;
}

interface PartialThinkingReplayPayload {
  introOccurrences: number;
  overlayAfterPersist: unknown;
  planOccurrences: number;
  thinkingCount: number;
  toolCount: number;
}

interface ConcurrentDirectStreamPayload {
  runACursorCountAfterFinalize: number;
  runAText: string;
  runBText: string;
}

interface EmptyThinkingPayload {
  overlayAfterReplay: {
    parts: Array<{ finished?: boolean }>;
  };
  thinkingCount: number;
}

interface MissingToolReinvocationPayload {
  results: boolean[];
  statuses: string[];
  toolPartCount: number;
}

interface MissingToolResultPayload {
  args: Record<string, unknown>;
  hasResult: boolean;
  status: string;
  toolCallId?: string;
  toolPartCount: number;
}

interface RepeatedThinkingPayload {
  latestPhraseOccurrences: number;
  olderPhraseOccurrences: number;
  thinkingCount: number;
}

interface UnfinishedThinkingPayload {
  prefixOccurrences: number;
  suffixOccurrences: number;
  thinkingCount: number;
}

interface RunCleanupPayload {
  afterReplayToolCount: number;
  beforeClearToolCount: number;
  overlayAfterClear: unknown;
}

interface OutputDeltaOverlayPayload {
  cursorCount: number;
  textStreaming: boolean;
}

interface MediaOverlayPayload {
  imageCount: number;
  imageNames: string[];
}

interface TerminalOverlayPayload {
  firstOccurrences: number;
  secondOccurrences: number;
  textStreaming: boolean;
}

interface StoppedReplayPayload {
  firstCursorCount: number;
  firstThinkingCount: number;
  firstToolCount: number;
  overlayAfterFirst: unknown;
  overlayAfterSecond: unknown;
  secondCursorCount: number;
  secondGroupCount: number;
  secondThinkingCount: number;
  secondToolCount: number;
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

test("session switching keeps stream overlays isolated", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SessionSwitchPayload>(
      page,
      "renderSessionSwitchIsolation",
    );

    expect(payload.sessionTwoText).not.toContain("S1 private thought");
    expect(payload.sessionTwoText).toContain("S2 visible thought");
    expect(payload.sessionOneThinkingCount).toBe(1);
    expect(payload.hydratedSessionOneThinkingCount).toBe(1);
    expect(countSubstring(payload.hydratedSessionOneText, "S1 private thought")).toBe(
      1,
    );
  } finally {
    await appServer.close();
  }
});

test("main history overlay dedupes primary alias", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<PrimaryAliasPayload>(
      page,
      "renderMainPrimaryAliasDedup",
    );

    expect(payload.thinkingCount).toBe(1);
    expect(payload.toolCount).toBe(1);
    expect(countSubstring(payload.text, "DUP_THINK")).toBe(1);
    expect(payload.overlayAfterPersist).toBeNull();
  } finally {
    await appServer.close();
  }
});

test("repeated session switch stress does not duplicate stream blocks", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RepeatedSessionSwitchPayload>(
      page,
      "renderRepeatedSessionSwitchStress",
    );

    expect(payload.iterations).toBe(120);
    expect(payload.maxIntroOccurrences).toBe(1);
    expect(payload.maxToolDuplicateCount).toBe(1);
    expect(payload.foreignLeakCount).toBe(0);
    expect(payload.finalRunAThinkingCount).toBe(3);
    expect(payload.finalRunBThinkingCount).toBe(3);
    expect(payload.overlayAfterFullRunA).toBeNull();
    expect(payload.overlayAfterFullRunB).toBeNull();
  } finally {
    await appServer.close();
  }
});

test("partial overlay replay does not duplicate earlier thinking blocks", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<PartialThinkingReplayPayload>(
      page,
      "renderPartialThinkingReplayStress",
    );

    expect(payload.introOccurrences).toBe(1);
    expect(payload.planOccurrences).toBe(1);
    expect(payload.thinkingCount).toBe(2);
    expect(payload.toolCount).toBe(2);
    expect(payload.overlayAfterPersist).toBeNull();
  } finally {
    await appServer.close();
  }
});

test("direct stream state is isolated across concurrent primary runs", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<ConcurrentDirectStreamPayload>(
      page,
      "renderConcurrentPrimaryDirectStreamStress",
    );

    expect(countSubstring(payload.runAText, "A late")).toBe(1);
    expect(payload.runBText).not.toContain("A late");
    expect(countSubstring(payload.runBText, "B first")).toBe(1);
    expect(payload.runACursorCountAfterFinalize).toBe(0);
  } finally {
    await appServer.close();
  }
});

test("empty active thinking overlay survives history replay", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<EmptyThinkingPayload>(
      page,
      "renderEmptyActiveThinkingOverlay",
    );

    expect(payload.thinkingCount).toBe(1);
    expect(payload.overlayAfterReplay.parts[0]?.finished).toBe(false);
  } finally {
    await appServer.close();
  }
});

test("missing tool call ids create new pending overlay invocations", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<MissingToolReinvocationPayload>(
      page,
      "renderMissingToolCallIdReinvocation",
    );

    expect(payload.toolPartCount).toBe(2);
    expect(payload.statuses).toEqual(["completed", "pending"]);
    expect(payload.results).toEqual([true, false]);
  } finally {
    await appServer.close();
  }
});

test("missing tool call id out-of-order result reuses overlay part", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<MissingToolResultPayload>(
      page,
      "renderMissingToolCallIdOutOfOrderResult",
    );

    expect(payload.toolPartCount).toBe(1);
    expect(payload.status).toBe("completed");
    expect(payload.hasResult).toBe(true);
    expect(payload.args).toEqual({ command: "date" });
  } finally {
    await appServer.close();
  }
});

test("ided tool result reuses pending missing id tool call", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<MissingToolResultPayload>(
      page,
      "renderIdedToolResultAfterMissingCallId",
    );

    expect(payload.toolPartCount).toBe(1);
    expect(payload.status).toBe("completed");
    expect(payload.toolCallId).toBe("call-shell-1");
    expect(payload.hasResult).toBe(true);
    expect(payload.args).toEqual({ command: "date" });
  } finally {
    await appServer.close();
  }
});

test("repeated live thinking text from older history survives replay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RepeatedThinkingPayload>(
      page,
      "renderRepeatedLiveThinkingTextFromOlderHistory",
    );

    expect(payload.olderPhraseOccurrences).toBe(2);
    expect(payload.latestPhraseOccurrences).toBe(1);
    expect(payload.thinkingCount).toBe(3);
  } finally {
    await appServer.close();
  }
});

test("unfinished thinking with persisted prefix survives replay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<UnfinishedThinkingPayload>(
      page,
      "renderUnfinishedThinkingWithPersistedPrefix",
    );

    expect(payload.prefixOccurrences).toBe(2);
    expect(payload.suffixOccurrences).toBe(1);
    expect(payload.thinkingCount).toBe(2);
  } finally {
    await appServer.close();
  }
});

test("run stream cleanup clears overlay and event dedupe", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RunCleanupPayload>(
      page,
      "renderRunStreamCleanupReleasesOverlayAndDedupe",
    );

    expect(payload.beforeClearToolCount).toBe(1);
    expect(payload.overlayAfterClear).toBeNull();
    expect(payload.afterReplayToolCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("output delta overlay keeps text streaming state", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<OutputDeltaOverlayPayload>(
      page,
      "renderOutputDeltaOverlayStreamingState",
    );

    expect(payload.textStreaming).toBe(true);
    expect(payload.cursorCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("persisted media ref filters finalized stream overlay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<MediaOverlayPayload>(
      page,
      "renderPersistedMediaRefOverlayDedupe",
    );

    expect(payload.imageCount).toBe(1);
    expect(payload.imageNames).toEqual(["image.png"]);
  } finally {
    await appServer.close();
  }
});

test("reused media ref from older history survives overlay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<MediaOverlayPayload>(
      page,
      "renderOlderMediaRefReuseOverlay",
    );

    expect(payload.imageCount).toBe(2);
    expect(payload.imageNames).toEqual(["image.png", "image.png"]);
  } finally {
    await appServer.close();
  }
});

test("terminal overlay event clears event dedupe", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalOverlayPayload>(
      page,
      "renderTerminalOverlayEventClearsDedupe",
    );

    expect(payload.firstOccurrences).toBe(1);
    expect(payload.secondOccurrences).toBe(1);
    expect(payload.textStreaming).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("replayed stopped session events do not duplicate history overlay", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<StoppedReplayPayload>(
      page,
      "renderStoppedReplayDedup",
    );

    expect(payload.firstThinkingCount).toBe(1);
    expect(payload.secondThinkingCount).toBe(1);
    expect(payload.firstToolCount).toBe(1);
    expect(payload.secondToolCount).toBe(1);
    expect(payload.firstCursorCount).toBe(0);
    expect(payload.secondCursorCount).toBe(0);
    expect(payload.secondGroupCount).toBe(0);
    expect(payload.overlayAfterFirst).toBeNull();
    expect(payload.overlayAfterSecond).toBeNull();
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

function countSubstring(source: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return source.split(needle).length - 1;
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
      appendThinkingChunk,
      appendStreamChunk,
      appendToolCallBlock,
      applyStreamOverlayEvent,
      clearAllStreamState,
      clearRunStreamState,
      finalizeStream,
      finalizeThinking,
      getCoordinatorStreamOverlay,
      getOrCreateStreamBlock,
      startThinkingBlock,
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

    function maxDuplicateToolCount(container) {
      const counts = new Map();
      Array.from(container.querySelectorAll(".tool-block")).forEach(block => {
        const key = block.dataset.toolCallId || block.textContent || "";
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      return Math.max(0, ...Array.from(counts.values()));
    }

    function waitForAnimationFrame() {
      return new Promise(resolve => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
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

      renderSessionSwitchIsolation() {
        clearAllStreamState();
        const sessionOne = makeContainer("session-one");
        const sessionTwo = makeContainer("session-two");
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 0 },
          { runId: "run-s1", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 0, text: "S1 private thought" },
          { runId: "run-s1", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 0 },
          { runId: "run-s1", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "run_completed",
          {},
          { runId: "run-s1", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 0 },
          { runId: "run-s2", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 0, text: "S2 visible thought" },
          { runId: "run-s2", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        renderHistory(sessionTwo, [], {
          runId: "run-s2",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-s2"),
        });
        renderHistory(sessionOne, [], {
          runId: "run-s1",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-s1"),
        });
        const sessionOneThinkingCount = sessionOne.querySelectorAll(".thinking-block").length;
        renderHistory(sessionOne, [{
          role: "assistant",
          role_id: "main-role",
          instance_id: "primary",
          message: {
            parts: [{
              part_kind: "thinking",
              part_index: 0,
              content: "S1 private thought",
            }],
          },
        }], {
          runId: "run-s1",
          runStatus: "completed",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-s1"),
        });
        return {
          sessionTwoText: sessionTwo.textContent || "",
          sessionOneThinkingCount,
          hydratedSessionOneThinkingCount: sessionOne.querySelectorAll(".thinking-block").length,
          hydratedSessionOneText: sessionOne.textContent || "",
        };
      },

      renderMainPrimaryAliasDedup() {
        clearAllStreamState();
        const container = makeContainer("primary-alias-dedup");
        const runId = "run-primary-alias-dedup";
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 0 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "alias-1" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 0, text: "DUP_THINK" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "alias-2" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 0 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "alias-3" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "load_skill",
            tool_call_id: "call-alias-load",
            args: { name: "deepresearch" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "alias-4" },
        );
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "inst-main-after-switch",
          created_at: "2026-04-26T09:46:41Z",
          message: {
            parts: [
              { part_kind: "thinking", part_index: 0, content: "DUP_THINK" },
              {
                part_kind: "tool-call",
                tool_name: "load_skill",
                tool_call_id: "call-alias-load",
                args: { name: "deepresearch" },
              },
            ],
          },
        }], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          thinkingCount: container.querySelectorAll(".thinking-block").length,
          toolCount: container.querySelectorAll(".tool-block").length,
          text: container.textContent || "",
          overlayAfterPersist: getCoordinatorStreamOverlay(runId),
        };
      },

      renderRepeatedSessionSwitchStress() {
        clearAllStreamState();
        const container = makeContainer("session-switch-stress");
        const runA = "session-17606bc3-run";
        const runB = "session-70b72c62-run";
        const seedRun = (runId, label) => {
          applyStreamOverlayEvent(
            "thinking_started",
            { part_index: 0 },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-intro-start" },
          );
          applyStreamOverlayEvent(
            "thinking_delta",
            { part_index: 0, text: label + " intro thinking" },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-intro-delta" },
          );
          applyStreamOverlayEvent(
            "thinking_finished",
            { part_index: 0 },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-intro-finish" },
          );
          applyStreamOverlayEvent(
            "tool_call",
            {
              tool_name: "load_skill",
              tool_call_id: label + "-load-deepresearch",
              args: { name: "deepresearch" },
            },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-tool-1" },
          );
          applyStreamOverlayEvent(
            "tool_call",
            {
              tool_name: "load_skill",
              tool_call_id: label + "-load-pptx",
              args: { name: "pptx-craft" },
            },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-tool-2" },
          );
          applyStreamOverlayEvent(
            "thinking_started",
            { part_index: 1 },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-plan-start" },
          );
          applyStreamOverlayEvent(
            "thinking_delta",
            { part_index: 1, text: label + " plan thinking" },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-plan-delta" },
          );
          applyStreamOverlayEvent(
            "thinking_finished",
            { part_index: 1 },
            { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: label + "-think-plan-finish" },
          );
        };
        const persistedPartial = (label) => [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: label + "-persisted-instance-after-switch",
          created_at: "2026-04-26T09:46:41Z",
          message: {
            parts: [
              { part_kind: "thinking", part_index: 0, content: label + " intro thinking" },
              {
                part_kind: "tool-call",
                tool_name: "load_skill",
                tool_call_id: label + "-load-deepresearch",
                args: { name: "deepresearch" },
              },
              {
                part_kind: "tool-call",
                tool_name: "load_skill",
                tool_call_id: label + "-load-pptx",
                args: { name: "pptx-craft" },
              },
            ],
          },
        }];
        const persistedFull = (label) => [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: label + "-persisted-instance-after-switch",
          created_at: "2026-04-26T09:46:41Z",
          message: {
            parts: [
              { part_kind: "thinking", part_index: 0, content: label + " intro thinking" },
              {
                part_kind: "tool-call",
                tool_name: "load_skill",
                tool_call_id: label + "-load-deepresearch",
                args: { name: "deepresearch" },
              },
              {
                part_kind: "tool-call",
                tool_name: "load_skill",
                tool_call_id: label + "-load-pptx",
                args: { name: "pptx-craft" },
              },
              { part_kind: "thinking", part_index: 1, content: label + " plan thinking" },
              { part_kind: "thinking", part_index: 2, content: label + " final planning thought" },
            ],
          },
        }];
        const renderRun = (runId, label, messages, runStatus = "running") => {
          renderHistory(container, messages, {
            runId,
            runStatus,
            streamOverlayEntry: getCoordinatorStreamOverlay(runId),
            timelineView: "main",
            canonicalStreamKey: "primary",
          });
          const text = container.textContent || "";
          return {
            introOccurrences: countSubstring(text, label + " intro thinking"),
            foreignOccurrences: countSubstring(text, (label === "A" ? "B" : "A") + " intro thinking"),
            maxToolDuplicateCount: maxDuplicateToolCount(container),
          };
        };
        seedRun(runA, "A");
        seedRun(runB, "B");
        let maxIntroOccurrences = 0;
        let maxToolDuplicateCount = 0;
        let foreignLeakCount = 0;
        for (let i = 0; i < 120; i += 1) {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: i % 7 === 0,
          });
          document.dispatchEvent(new Event("visibilitychange"));
          const label = i % 2 === 0 ? "A" : "B";
          const result = renderRun(
            label === "A" ? runA : runB,
            label,
            persistedPartial(label),
          );
          maxIntroOccurrences = Math.max(maxIntroOccurrences, result.introOccurrences);
          maxToolDuplicateCount = Math.max(maxToolDuplicateCount, result.maxToolDuplicateCount);
          foreignLeakCount += result.foreignOccurrences;
        }
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 2 },
          { runId: runA, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "A-think-final-start" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 2, text: "A final planning thought" },
          { runId: runA, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "A-think-final-delta" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 2 },
          { runId: runA, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "A-think-final-finish" },
        );
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 2 },
          { runId: runB, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "B-think-final-start" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 2, text: "B final planning thought" },
          { runId: runB, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "B-think-final-delta" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 2 },
          { runId: runB, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "B-think-final-finish" },
        );
        renderRun(runA, "A", persistedFull("A"), "completed");
        const finalRunAThinkingCount = container.querySelectorAll(".thinking-block").length;
        const overlayAfterFullRunA = getCoordinatorStreamOverlay(runA);
        renderRun(runB, "B", persistedFull("B"), "completed");
        const finalRunBThinkingCount = container.querySelectorAll(".thinking-block").length;
        const overlayAfterFullRunB = getCoordinatorStreamOverlay(runB);
        return {
          iterations: 120,
          maxIntroOccurrences,
          maxToolDuplicateCount,
          foreignLeakCount,
          finalRunAThinkingCount,
          finalRunBThinkingCount,
          overlayAfterFullRunA,
          overlayAfterFullRunB,
        };
      },

      renderPartialThinkingReplayStress() {
        clearAllStreamState();
        const container = makeContainer("partial-thinking-replay-stress");
        const runId = "session-7f051512";
        const introPrefix = "The user wants me to: use deepresearch and pptx-craft";
        const introFull = introPrefix + " before loading both skills and planning the workflow.";
        const planFull = "Now I have both skills loaded. Let me plan the workflow in detail.";
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 0 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-1" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 0, text: introPrefix },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-2" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 0 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-3" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "load_skill",
            tool_call_id: "partial-load-deepresearch",
            args: { name: "deepresearch" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-4" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "load_skill",
            tool_call_id: "partial-load-pptx",
            args: { name: "pptx-craft" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-5" },
        );
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 1 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-6" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 1, text: planFull },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-7" },
        );
        applyStreamOverlayEvent(
          "thinking_finished",
          { part_index: 1 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "partial-8" },
        );
        const messages = [
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "persisted-main-before-switch",
            created_at: "2026-04-26T09:46:41Z",
            message: {
              parts: [
                { part_kind: "thinking", part_index: 0, content: introFull },
                {
                  part_kind: "tool-call",
                  tool_name: "load_skill",
                  tool_call_id: "partial-load-deepresearch",
                  args: { name: "deepresearch" },
                },
                {
                  part_kind: "tool-call",
                  tool_name: "load_skill",
                  tool_call_id: "partial-load-pptx",
                  args: { name: "pptx-craft" },
                },
              ],
            },
          },
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "persisted-main-after-switch",
            created_at: "2026-04-26T09:46:49Z",
            message: {
              parts: [
                { part_kind: "thinking", part_index: 1, content: planFull },
                { part_kind: "text", content: "Starting the long research loop." },
              ],
            },
          },
        ];
        for (let i = 0; i < 180; i += 1) {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: i % 5 === 0,
          });
          document.dispatchEvent(new Event("visibilitychange"));
          renderHistory(container, messages, {
            runId,
            runStatus: "running",
            streamOverlayEntry: getCoordinatorStreamOverlay(runId),
            timelineView: "main",
            canonicalStreamKey: "primary",
          });
        }
        const text = container.textContent || "";
        return {
          introOccurrences: countSubstring(text, introPrefix),
          planOccurrences: countSubstring(text, planFull),
          thinkingCount: container.querySelectorAll(".thinking-block").length,
          toolCount: container.querySelectorAll(".tool-block").length,
          overlayAfterPersist: getCoordinatorStreamOverlay(runId),
        };
      },

      async renderConcurrentPrimaryDirectStreamStress() {
        clearAllStreamState();
        const runA = "session-7f051512";
        const runB = "session-8bcc5caa";
        const roleId = "Coordinator";
        const containerA = makeContainer("direct-stream-run-a");
        const containerB = makeContainer("direct-stream-run-b");
        getOrCreateStreamBlock(containerA, "primary", roleId, "Main Agent", runA);
        appendStreamChunk("primary", "A first", runA, roleId, "Main Agent");
        startThinkingBlock("primary", 0, {
          container: containerA,
          runId: runA,
          roleId,
          label: "Main Agent",
        });
        appendThinkingChunk("primary", 0, "A thought", {
          container: containerA,
          runId: runA,
          roleId,
          label: "Main Agent",
        });
        finalizeThinking("primary", 0, {
          container: containerA,
          runId: runA,
          roleId,
        });
        getOrCreateStreamBlock(containerB, "primary", roleId, "Main Agent", runB);
        appendStreamChunk("primary", "B first", runB, roleId, "Main Agent");
        appendStreamChunk("primary", " A late", runA, roleId, "Main Agent");
        finalizeStream("primary", roleId, { runId: runA });
        await waitForAnimationFrame();
        return {
          runAText: containerA.textContent || "",
          runBText: containerB.textContent || "",
          runACursorCountAfterFinalize: containerA.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderEmptyActiveThinkingOverlay() {
        clearAllStreamState();
        const container = makeContainer("empty-active-thinking-overlay");
        const runId = "run-empty-thinking";
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 3 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "empty-think-1" },
        );
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          thinkingCount: container.querySelectorAll(".thinking-block").length,
          overlayAfterReplay: getCoordinatorStreamOverlay(runId),
        };
      },

      renderMissingToolCallIdReinvocation() {
        clearAllStreamState();
        const runId = "run-missing-tool-call-id";
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "shell",
            args: { command: "date" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-1" },
        );
        applyStreamOverlayEvent(
          "tool_result",
          {
            tool_name: "shell",
            result: { ok: true },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-2" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "shell",
            args: { command: "pwd" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-3" },
        );
        const parts = getCoordinatorStreamOverlay(runId).parts.filter(part => part.kind === "tool");
        return {
          toolPartCount: parts.length,
          statuses: parts.map(part => part.status || ""),
          results: parts.map(part => part.result !== undefined),
        };
      },

      renderMissingToolCallIdOutOfOrderResult() {
        clearAllStreamState();
        const runId = "run-missing-tool-call-id-out-of-order";
        applyStreamOverlayEvent(
          "tool_result",
          {
            tool_name: "shell",
            result: { ok: true, output: "done" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-ooo-1" },
        );
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "shell",
            args: { command: "date" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-ooo-2" },
        );
        const parts = getCoordinatorStreamOverlay(runId).parts.filter(part => part.kind === "tool");
        const part = parts[0] || {};
        return {
          toolPartCount: parts.length,
          status: part.status || "",
          hasResult: part.result !== undefined,
          args: part.args || {},
        };
      },

      renderIdedToolResultAfterMissingCallId() {
        clearAllStreamState();
        const runId = "run-ided-tool-result-after-missing-call-id";
        applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "shell",
            args: { command: "date" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-later-id-1" },
        );
        applyStreamOverlayEvent(
          "tool_result",
          {
            tool_name: "shell",
            tool_call_id: "call-shell-1",
            result: { ok: true, output: "done" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "missing-tool-later-id-2" },
        );
        const parts = getCoordinatorStreamOverlay(runId).parts.filter(part => part.kind === "tool");
        const part = parts[0] || {};
        return {
          toolPartCount: parts.length,
          status: part.status || "",
          toolCallId: part.tool_call_id || "",
          hasResult: part.result !== undefined,
          args: part.args || {},
        };
      },

      renderRepeatedLiveThinkingTextFromOlderHistory() {
        clearAllStreamState();
        const container = makeContainer("repeated-live-thinking-text");
        const runId = "run-repeated-live-thinking";
        const olderPhrase = "Now let me plan the workflow.";
        const latestPhrase = "Latest persisted thinking tail.";
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 2 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "repeat-live-1" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 2, text: olderPhrase },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "repeat-live-2" },
        );
        renderHistory(container, [
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "primary",
            created_at: "2026-04-26T09:46:41Z",
            message: {
              parts: [{ part_kind: "thinking", part_index: 0, content: olderPhrase }],
            },
          },
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "primary",
            created_at: "2026-04-26T09:46:49Z",
            message: {
              parts: [{ part_kind: "thinking", part_index: 1, content: latestPhrase }],
            },
          },
        ], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        const text = container.textContent || "";
        return {
          olderPhraseOccurrences: countSubstring(text, olderPhrase),
          latestPhraseOccurrences: countSubstring(text, latestPhrase),
          thinkingCount: container.querySelectorAll(".thinking-block").length,
        };
      },

      renderUnfinishedThinkingWithPersistedPrefix() {
        clearAllStreamState();
        const container = makeContainer("unfinished-thinking-prefix");
        const runId = "run-unfinished-thinking-prefix";
        const prefix = "Now let me analyze the session switching timeline carefully.";
        const suffix = " This live suffix must remain visible.";
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 2 },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "thinking-prefix-1" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 2, text: prefix + suffix },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "thinking-prefix-2" },
        );
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "primary",
          created_at: "2026-04-26T09:46:41Z",
          message: {
            parts: [{ part_kind: "thinking", part_index: 2, content: prefix }],
          },
        }], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        const text = container.textContent || "";
        return {
          prefixOccurrences: countSubstring(text, prefix),
          suffixOccurrences: countSubstring(text, suffix.trim()),
          thinkingCount: container.querySelectorAll(".thinking-block").length,
        };
      },

      renderRunStreamCleanupReleasesOverlayAndDedupe() {
        clearAllStreamState();
        const runId = "run-cleanup-dedupe";
        const emitToolCall = () => applyStreamOverlayEvent(
          "tool_call",
          {
            tool_name: "shell",
            tool_call_id: "call-cleanup",
            args: { command: "date" },
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "cleanup-evt-1" },
        );
        emitToolCall();
        const beforeClearToolCount = getCoordinatorStreamOverlay(runId)?.parts?.length || 0;
        clearRunStreamState(runId);
        const overlayAfterClear = getCoordinatorStreamOverlay(runId);
        emitToolCall();
        const afterReplayToolCount = getCoordinatorStreamOverlay(runId)?.parts?.length || 0;
        return {
          beforeClearToolCount,
          overlayAfterClear,
          afterReplayToolCount,
        };
      },

      renderOutputDeltaOverlayStreamingState() {
        clearAllStreamState();
        const container = makeContainer("output-delta-overlay-streaming");
        const runId = "run-output-delta-overlay";
        applyStreamOverlayEvent(
          "output_delta",
          {
            output: [{ kind: "text", text: "streamed output delta text" }],
          },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "output-delta-1" },
        );
        const overlay = getCoordinatorStreamOverlay(runId);
        renderHistory(container, [], {
          runId,
          runStatus: "running",
          streamOverlayEntry: overlay,
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          textStreaming: overlay?.textStreaming === true,
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderPersistedMediaRefOverlayDedupe() {
        clearAllStreamState();
        const container = makeContainer("persisted-media-ref-overlay-dedupe");
        const runId = "run-persisted-media-ref-overlay-dedupe";
        const mediaPart = {
          kind: "media_ref",
          modality: "image",
          mime_type: "image/png",
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          name: "image.png",
        };
        applyStreamOverlayEvent(
          "output_delta",
          { output: [mediaPart] },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "media-dedupe-1" },
        );
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "primary",
          message: {
            parts: [mediaPart],
          },
        }], {
          runId,
          runStatus: "completed",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          imageCount: container.querySelectorAll(".msg-image-preview").length,
          imageNames: Array.from(container.querySelectorAll(".msg-image-preview"))
            .map(image => image.getAttribute("data-image-preview-name") || ""),
        };
      },

      renderOlderMediaRefReuseOverlay() {
        clearAllStreamState();
        const container = makeContainer("older-media-ref-reuse-overlay");
        const runId = "run-older-media-ref-reuse-overlay";
        const mediaPart = {
          kind: "media_ref",
          modality: "image",
          mime_type: "image/png",
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          name: "image.png",
        };
        applyStreamOverlayEvent(
          "output_delta",
          { output: [mediaPart] },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "media-reuse-1" },
        );
        renderHistory(container, [
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "primary",
            message: {
              parts: [mediaPart],
            },
          },
          {
            role: "assistant",
            role_id: "Coordinator",
            instance_id: "primary",
            message: {
              parts: [{ part_kind: "text", content: "newer persisted text" }],
            },
          },
        ], {
          runId,
          runStatus: "running",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        return {
          imageCount: container.querySelectorAll(".msg-image-preview").length,
          imageNames: Array.from(container.querySelectorAll(".msg-image-preview"))
            .map(image => image.getAttribute("data-image-preview-name") || ""),
        };
      },

      renderTerminalOverlayEventClearsDedupe() {
        clearAllStreamState();
        const runId = "run-terminal-clears-overlay-dedupe";
        applyStreamOverlayEvent(
          "text_delta",
          { text: "first lifecycle text" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "repeat-event-id" },
        );
        applyStreamOverlayEvent(
          "run_completed",
          {},
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "terminal-event-id" },
        );
        applyStreamOverlayEvent(
          "text_delta",
          { text: "second lifecycle text" },
          { runId, instanceId: "primary", roleId: "Coordinator", label: "Main Agent", eventId: "repeat-event-id" },
        );
        const overlay = getCoordinatorStreamOverlay(runId);
        const text = overlay?.parts
          ?.filter(part => part.kind === "text")
          ?.map(part => part.content || "")
          ?.join("\\n") || "";
        return {
          firstOccurrences: countSubstring(text, "first lifecycle text"),
          secondOccurrences: countSubstring(text, "second lifecycle text"),
          textStreaming: overlay?.textStreaming === true,
        };
      },

      renderStoppedReplayDedup() {
        clearAllStreamState();
        const container = makeContainer("stopped-replay");
        const runId = "run-stopped-replay";
        const messages = [{
          role: "assistant",
          role_id: "main-role",
          instance_id: "primary",
          created_at: "2026-04-25T12:00:02Z",
          message: {
            parts: [
              {
                part_kind: "thinking",
                part_index: 0,
                content: "persisted thought",
              },
              {
                part_kind: "tool-call",
                tool_name: "shell",
                tool_call_id: "call-1",
                args: { command: "date" },
              },
              {
                part_kind: "text",
                content: "final answer",
              },
            ],
          },
        }];
        const events = [
          ["thinking_started", { part_index: 0 }, "evt-1"],
          ["thinking_delta", { part_index: 0, text: "persisted thought" }, "evt-2"],
          ["thinking_finished", { part_index: 0 }, "evt-3"],
          [
            "tool_call",
            {
              tool_name: "shell",
              tool_call_id: "call-1",
              args: { command: "date" },
            },
            "evt-4",
          ],
          [
            "tool_result",
            {
              tool_name: "shell",
              tool_call_id: "call-1",
              result: { ok: true, output: "done" },
            },
            "evt-5",
          ],
          ["run_stopped", {}, "evt-6"],
        ];
        const replayEvents = () => {
          events.forEach(([type, payload, eventId]) => {
            applyStreamOverlayEvent(type, payload, {
              runId,
              instanceId: "primary",
              roleId: "main-role",
              label: "Main Agent",
              eventId,
            });
          });
        };
        replayEvents();
        renderHistory(container, messages, {
          runId,
          runStatus: "stopped",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
        });
        const firstThinkingCount = container.querySelectorAll(".thinking-block").length;
        const firstToolCount = container.querySelectorAll(".tool-block").length;
        const firstCursorCount = container.querySelectorAll(".streaming-cursor").length;
        const overlayAfterFirst = getCoordinatorStreamOverlay(runId);
        replayEvents();
        renderHistory(container, messages, {
          runId,
          runStatus: "stopped",
          streamOverlayEntry: getCoordinatorStreamOverlay(runId),
        });
        return {
          firstThinkingCount,
          firstToolCount,
          firstCursorCount,
          overlayAfterFirst,
          secondThinkingCount: container.querySelectorAll(".thinking-block").length,
          secondToolCount: container.querySelectorAll(".tool-block").length,
          secondCursorCount: container.querySelectorAll(".streaming-cursor").length,
          secondGroupCount: container.querySelectorAll(".tool-group").length,
          overlayAfterSecond: getCoordinatorStreamOverlay(runId),
        };
      },
    };
  </script>
</body>
</html>
`.trim();
}
