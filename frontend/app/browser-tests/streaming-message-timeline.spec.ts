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

interface ThinkingPlacementPayload {
  firstMessageText: string;
  messageCount: number;
  secondMessageText: string;
}

interface DetachedRebindPayload {
  afterClearToolCount: number;
  beforeClearToolCount: number;
  toolCallIds: string[];
}

interface RandomizedStreamPressurePayload {
  containers: number;
  duplicateMax: number;
  missing: string[];
  missingResults: string[];
  orderMismatches: unknown[];
  overlayCounts: number[];
  toolBlocks: number;
}

interface VisibleSubagentOverlayPayload {
  messageTextCount: number;
  ordered: boolean;
  thinkingBlockCount: number;
  toolBlockCount: number;
}

interface SubagentRenderBindPayload {
  completedToolCount: number;
  messageCount: number;
  roleLabels: string[];
  textBlocks: string[];
  thinkingBlockCount: number;
  toolBlockCount: number;
}

interface StreamRebindSkipsUserPromptPayload {
  messageCount: number;
  modelText: string;
  userText: string;
}

interface SubagentThinkingOrderPayload {
  afterActiveThinkingParts: string[];
  beforeActiveThinkingParts: string[];
  beforeThinkingFinished: boolean[];
  parts: string[];
  textInsideThinking: string[];
  thinkingTexts: string[];
}

interface RunningSubagentHistoryCompactionPayload {
  groupCount: number;
  messageCount: number;
  parts: string[];
}

interface TerminalCollapsePayload {
  groupCount: number;
  groupToolCount: number;
}

interface TerminalPayloadOutputPayload {
  cursorCount: number;
  failedText: string;
  occurrences: number;
  stoppedText: string;
  text: string;
}

interface TerminalPayloadDedupePayload {
  messageCount: number;
  occurrences: number;
}

interface TerminalHistoryToolFinalPayload {
  flowCount: number;
  groupBodyClass: string;
  groupCount: number;
  messageCount: number;
  occurrences: number;
  text: string;
  toolBlockCount: number;
}

interface ProcessedTranscriptPayload {
  childClasses: string[];
  finalTexts: string[];
  groupBodyClass: string;
  groupCount: number;
  groupParts: string[];
  messageCount: number;
  nestedMessageCount: number;
}

interface TerminalParityPayload {
  history: ProcessedTranscriptPayload;
  live: ProcessedTranscriptPayload;
}

interface CompletedSubagentStatusOnlyPayload extends ProcessedTranscriptPayload {
  containsLiveLabel: boolean;
}

interface FinalMessageCollapsePayload {
  cancelledFinalGroupCount: number;
  cancelledFinalText: string;
  completedNoFinalGroupCount: number;
  completedNoFinalText: string;
  failedFinalGroupCount: number;
  failedFinalText: string;
  stoppedNoFinalGroupCount: number;
}

interface SubagentSessionWidthPayload {
  afterWidth: number;
  afterWithinScroll: boolean;
  beforeWidth: number;
  beforeWithinScroll: boolean;
}

interface SubagentRoundNavigatorPayload {
  baselineWidth: number;
  mainHasTimelineClass: boolean;
  mainNavVisible: boolean;
  mainNodeCount: number;
  staleNavVisible: boolean;
  staleWidth: number;
  staleWithinScroll: boolean;
  subagentDensity: string;
  subagentHasTimelineClass: boolean;
  subagentNavVisible: boolean;
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

test("unpersisted thinking overlay renders after history message", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<ThinkingPlacementPayload>(
      page,
      "renderThinkingOverlayPlacement",
    );

    expect(payload.messageCount).toBe(2);
    expect(payload.firstMessageText).not.toContain("live thought in progress");
    expect(payload.secondMessageText).toContain("live thought in progress");
  } finally {
    await appServer.close();
  }
});

test("late tool call rebinds after stream container rerender", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<DetachedRebindPayload>(
      page,
      "renderDetachedStreamRebind",
    );

    expect(payload.beforeClearToolCount).toBe(1);
    expect(payload.afterClearToolCount).toBe(2);
    expect(payload.toolCallIds).toEqual(["call-1", "call-2"]);
  } finally {
    await appServer.close();
  }
});

test("randomized stream switch pressure preserves tool calls", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RandomizedStreamPressurePayload>(
      page,
      "renderRandomizedStreamSwitchPressure",
    );

    expect(payload.missing).toEqual([]);
    expect(payload.missingResults).toEqual([]);
    expect(payload.orderMismatches).toEqual([]);
    expect(payload.overlayCounts).toEqual(Array.from({ length: 18 }, () => 12));
    expect(payload.duplicateMax).toBe(1);
    expect(payload.containers).toBe(18);
    expect(payload.toolBlocks).toBe(216);
  } finally {
    await appServer.close();
  }
});

test("visible subagent live overlay survives switch back", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<VisibleSubagentOverlayPayload>(
      page,
      "renderVisibleSubagentOverlaySwitchBack",
    );

    expect(payload.thinkingBlockCount).toBe(1);
    expect(payload.messageTextCount).toBe(1);
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.ordered).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("subagent render bind continues stream after switch back", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SubagentRenderBindPayload>(
      page,
      "renderSubagentRenderBindSwitchBack",
    );

    expect(payload.messageCount).toBe(1);
    expect(payload.thinkingBlockCount).toBe(1);
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.textBlocks).toEqual(["VISIBLE_TEXT_AFTER_SWITCH"]);
    expect(payload.completedToolCount).toBe(1);
    expect(payload.roleLabels).toEqual(["Explorer - 4de494db"]);
  } finally {
    await appServer.close();
  }
});

test("stream rebind does not append agent delta to user prompt", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<StreamRebindSkipsUserPromptPayload>(
      page,
      "renderStreamRebindSkipsUserPrompt",
    );

    expect(payload.messageCount).toBe(2);
    expect(payload.userText).toBe("TASK_PROMPT");
    expect(payload.modelText).toBe("AGENT_DELTA");
  } finally {
    await appServer.close();
  }
});

test("subagent switch back keeps thinking order and text separate", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SubagentThinkingOrderPayload>(
      page,
      "renderSubagentSwitchBackThinkingOrder",
    );

    expect(payload.beforeThinkingFinished).toEqual([true, true, false]);
    expect(payload.beforeActiveThinkingParts).toEqual(["2"]);
    expect(payload.parts).toEqual([
      "thinking:THINK_A",
      "tool:call-a",
      "text:TEXT_A",
      "thinking:THINK_B",
      "tool:call-b",
      "text:TEXT_B",
      "thinking:THINK_LIVE",
      "text:_TAIL",
    ]);
    expect(payload.thinkingTexts).toEqual(["THINK_A", "THINK_B", "THINK_LIVE"]);
    expect(payload.textInsideThinking).toEqual([]);
    expect(payload.afterActiveThinkingParts).toEqual([]);
  } finally {
    await appServer.close();
  }
});

test("subagent switch back drops stale overlay thinking gaps", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SubagentThinkingOrderPayload>(
      page,
      "renderSubagentSwitchBackWithoutPersistedThinking",
    );

    expect(payload.beforeThinkingFinished).toEqual([true, true, false]);
    expect(payload.beforeActiveThinkingParts).toEqual(["2"]);
    expect(payload.parts).toEqual([
      "tool:call-a",
      "text:TEXT_A",
      "tool:call-b",
      "text:TEXT_B",
      "thinking:THINK_LIVE",
      "text:_TAIL",
    ]);
    expect(payload.thinkingTexts).toEqual(["THINK_LIVE"]);
    expect(payload.textInsideThinking).toEqual([]);
    expect(payload.afterActiveThinkingParts).toEqual([]);
  } finally {
    await appServer.close();
  }
});

test("running subagent history uses stream-like compact DOM", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<RunningSubagentHistoryCompactionPayload>(
      page,
      "renderRunningSubagentHistoryCompaction",
    );

    expect(payload.messageCount).toBe(1);
    expect(payload.groupCount).toBe(0);
    expect(payload.parts).toEqual([
      "text:I'll systematically explore the plugin system.",
      "tool:read_file",
      "text:Excellent. Now let me read all the core plugin source files.",
      "tool:read_file",
      "text:Let me read the remaining files.",
      "tool:read_file",
    ]);
  } finally {
    await appServer.close();
  }
});

test("terminal completed overlay does not block processed group", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalCollapsePayload>(
      page,
      "renderTerminalCollapseWithCompletedOverlay",
    );

    expect(payload.groupCount).toBe(1);
    expect(payload.groupToolCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("terminal payload output renders when stream has no text", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalPayloadOutputPayload>(
      page,
      "renderTerminalPayloadOutput",
    );

    expect(payload.text).toContain("terminal payload final answer");
    expect(payload.occurrences).toBe(1);
    expect(payload.failedText).toContain("failed assistant final answer");
    expect(payload.stoppedText).not.toContain("stopped diagnostic output");
    expect(payload.cursorCount).toBe(0);
  } finally {
    await appServer.close();
  }
});

test("terminal payload output dedupes hydrated history", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalPayloadDedupePayload>(
      page,
      "renderTerminalPayloadDedupesHydratedHistory",
    );

    expect(payload.occurrences).toBe(1);
    expect(payload.messageCount).toBe(1);
  } finally {
    await appServer.close();
  }
});

test("terminal history with tool history and final output renders once", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalHistoryToolFinalPayload>(
      page,
      "renderTerminalHistoryWithToolAndFinalOutput",
    );

    expect(payload.occurrences).toBe(1);
    expect(payload.groupCount).toBe(1);
    expect(payload.messageCount).toBe(1);
    expect(payload.flowCount).toBe(0);
    expect(payload.groupBodyClass).toBe("tool-group-body msg-content");
    expect(payload.toolBlockCount).toBe(1);
    expect(payload.text).toContain("terminal projected final answer");
  } finally {
    await appServer.close();
  }
});

test("live terminal finalize matches history processed transcript", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalParityPayload>(
      page,
      "renderLiveTerminalAndHistoryParity",
    );

    expect(payload.live).toEqual(payload.history);
    expect(payload.live.groupCount).toBe(1);
    expect(payload.live.messageCount).toBe(1);
    expect(payload.live.nestedMessageCount).toBe(0);
    expect(payload.live.groupBodyClass).toBe("tool-group-body msg-content");
    expect(payload.live.groupParts).toEqual([
      "tool:search",
      "tool:read_file",
      "text:Now let me read the remaining key files for the full picture.",
      "tool:read_file",
      "tool-group-final-divider",
    ]);
    expect(payload.live.finalTexts).toEqual(["final answer"]);
  } finally {
    await appServer.close();
  }
});

test("subagent live terminal matches history processed transcript", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<TerminalParityPayload>(
      page,
      "renderSubagentTerminalParity",
    );

    expect(payload.live).toEqual(payload.history);
    expect(payload.live.groupCount).toBe(1);
    expect(payload.live.messageCount).toBe(1);
    expect(payload.live.nestedMessageCount).toBe(0);
    expect(payload.live.groupBodyClass).toBe("tool-group-body msg-content");
    expect(payload.live.groupParts).toEqual([
      "tool:read_file",
      "text:Let me read the remaining key files.",
      "tool:read_file",
      "tool-group-final-divider",
    ]);
    expect(payload.live.finalTexts).toEqual(["subagent final answer"]);
  } finally {
    await appServer.close();
  }
});

test("completed subagent status-only history uses processed transcript", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<CompletedSubagentStatusOnlyPayload>(
      page,
      "renderCompletedSubagentStatusOnlyTranscript",
    );

    expect(payload.groupCount).toBe(1);
    expect(payload.messageCount).toBe(2);
    expect(payload.nestedMessageCount).toBe(0);
    expect(payload.childClasses).toEqual(["message", "tool-group", "message"]);
    expect(payload.groupParts).toEqual([
      "thinking-block",
      "text:Let me inspect first.",
      "tool:read_file",
      "text:Next file.",
      "tool:read_file",
      "tool-group-final-divider",
    ]);
    expect(payload.finalTexts).toEqual(["final response"]);
    expect(payload.containsLiveLabel).toBe(false);
  } finally {
    await appServer.close();
  }
});

test("terminal rounds collapse only when final output is projected", async ({
  page,
}) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<FinalMessageCollapsePayload>(
      page,
      "renderFinalMessageCollapseMatrix",
    );

    expect(payload.stoppedNoFinalGroupCount).toBe(0);
    expect(payload.failedFinalGroupCount).toBe(1);
    expect(payload.cancelledFinalGroupCount).toBe(1);
    expect(payload.completedNoFinalGroupCount).toBe(0);
    expect(payload.failedFinalText).toContain("failed final answer");
    expect(payload.completedNoFinalText).toContain("loop middle output");
    expect(payload.cancelledFinalText).toContain("cancelled final answer");
  } finally {
    await appServer.close();
  }
});

test("subagent session width stays stable", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SubagentSessionWidthPayload>(
      page,
      "measureSubagentSessionWidth",
    );

    expect(payload.beforeWidth).toBe(payload.afterWidth);
    expect(payload.beforeWithinScroll).toBe(true);
    expect(payload.afterWithinScroll).toBe(true);
  } finally {
    await appServer.close();
  }
});

test("subagent session suppresses round navigator", async ({ page }) => {
  const appServer = await serveFrontendDist({
    handleRequest: handleHarnessRequest,
  });
  try {
    await openStreamTimelineHarness(page, appServer.url);
    const payload = await runHarness<SubagentRoundNavigatorPayload>(
      page,
      "renderSubagentRoundNavigatorSuppression",
    );

    expect(payload.subagentNavVisible).toBe(false);
    expect(payload.subagentHasTimelineClass).toBe(false);
    expect(payload.subagentDensity).toBe("");
    expect(payload.staleNavVisible).toBe(false);
    expect(payload.baselineWidth).toBe(payload.staleWidth);
    expect(payload.staleWithinScroll).toBe(true);
    expect(payload.mainNavVisible).toBe(true);
    expect(payload.mainHasTimelineClass).toBe(true);
    expect(payload.mainNodeCount).toBe(2);
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
      getInstanceStreamOverlay,
      getOrCreateStreamBlock,
      reconcileTerminalRunStreamState,
      startThinkingBlock,
      bindStreamOverlayToContainer,
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
    import {
      routeEvent,
    } from "/js/core/eventRouter/index.js";
    import {
      renderRoundNavigator,
    } from "/js/components/rounds/navigator.js";

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

    function serializeProcessedTranscript(container) {
      const groupBody = container.querySelector(".tool-group-body");
      const groupParts = Array.from(groupBody?.children || []).map(child => {
        if (child.classList.contains("tool-block")) {
          return "tool:" + (child.dataset.toolName || "");
        }
        if (child.classList.contains("msg-text")) {
          return "text:" + child.textContent.replace(/\\s+/g, " ").trim();
        }
        return child.className || child.tagName.toLowerCase();
      });
      const finalTexts = Array.from(container.querySelectorAll(":scope > .message"))
        .filter(message => String(message.dataset.role || "").trim() !== "user")
        .flatMap(message => Array.from(message.querySelectorAll(".msg-text")))
        .map(item => item.textContent.replace(/\\s+/g, " ").trim())
        .filter(Boolean);
      return {
        childClasses: Array.from(container.children)
          .filter(child => child.classList.contains("tool-group") || child.classList.contains("message"))
          .map(child => child.className),
        groupBodyClass: groupBody?.className || "",
        groupCount: container.querySelectorAll(".tool-group").length,
        messageCount: container.querySelectorAll(":scope > .message").length,
        nestedMessageCount: container.querySelectorAll(".tool-group-body > .message").length,
        groupParts,
        finalTexts,
      };
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

      renderThinkingOverlayPlacement() {
        clearAllStreamState();
        const container = makeContainer("thinking-placement");
        applyStreamOverlayEvent(
          "thinking_started",
          { part_index: 0 },
          { runId: "run-placement", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        applyStreamOverlayEvent(
          "thinking_delta",
          { part_index: 0, text: "live thought in progress" },
          { runId: "run-placement", instanceId: "primary", roleId: "main-role", label: "Main Agent" },
        );
        renderHistory(container, [{
          role: "assistant",
          role_id: "main-role",
          instance_id: "primary",
          message: {
            parts: [{ part_kind: "text", content: "persisted final answer" }],
          },
        }], {
          runId: "run-placement",
          streamOverlayEntry: getCoordinatorStreamOverlay("run-placement"),
        });
        const messages = Array.from(container.querySelectorAll(":scope > .message"));
        return {
          messageCount: messages.length,
          firstMessageText: messages[0]?.textContent || "",
          secondMessageText: messages[1]?.textContent || "",
        };
      },

      renderDetachedStreamRebind() {
        clearAllStreamState();
        const container = makeContainer("detached-rebind");
        getOrCreateStreamBlock(container, "inst-live", "Writer", "Writer", "subagent_run_live");
        appendToolCallBlock(
          container,
          "inst-live",
          "shell",
          { command: "echo before" },
          "call-1",
          { runId: "subagent_run_live", roleId: "Writer", label: "Writer" },
        );
        const beforeClearToolCount = container.querySelectorAll(".tool-block").length;
        container.replaceChildren();
        appendToolCallBlock(
          container,
          "inst-live",
          "write_file",
          { path: "page.svg" },
          "call-2",
          { runId: "subagent_run_live", roleId: "Writer", label: "Writer" },
        );
        return {
          beforeClearToolCount,
          afterClearToolCount: container.querySelectorAll(".tool-block").length,
          toolCallIds: Array.from(container.querySelectorAll(".tool-block"))
            .map(item => item.dataset.toolCallId || ""),
        };
      },

      renderRandomizedStreamSwitchPressure() {
        clearAllStreamState();
        const containers = new Map();
        const expected = new Map();
        const expectedArrivalOrder = new Map();
        const order = [];
        let seed = 1337;
        function random() {
          seed = (seed * 48271) % 0x7fffffff;
          return seed / 0x7fffffff;
        }
        function shuffle(items) {
          const next = items.slice();
          for (let index = next.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            const tmp = next[index];
            next[index] = next[swapIndex];
            next[swapIndex] = tmp;
          }
          return next;
        }
        function keyFor(runId, instanceId) {
          return runId + "::" + instanceId;
        }
        for (let sessionIndex = 0; sessionIndex < 6; sessionIndex += 1) {
          for (const agent of ["primary", "sub-a", "sub-b"]) {
            const runId = "run-" + sessionIndex;
            const instanceId = agent === "primary" ? "primary" : agent + "-" + sessionIndex;
            const roleId = agent === "primary" ? "MainAgent" : "Explorer";
            const key = keyFor(runId, instanceId);
            containers.set(key, makeContainer("pressure-" + sessionIndex + "-" + agent));
            expected.set(key, []);
            expectedArrivalOrder.set(key, []);
            getOrCreateStreamBlock(containers.get(key), instanceId, roleId, agent, runId);
            for (let callIndex = 0; callIndex < 12; callIndex += 1) {
              const toolCallId = "call-" + sessionIndex + "-" + agent + "-" + callIndex;
              expected.get(key).push(toolCallId);
              order.push({ key, runId, instanceId, roleId, toolCallId, callIndex });
            }
          }
        }
        shuffle(order).forEach((item, index) => {
          const container = containers.get(item.key);
          if (index % 5 === 0) {
            container.replaceChildren();
          }
          if (index % 7 === 0) {
            const [runId, instanceId] = item.key.split("::");
            const roleId = instanceId === "primary" ? "MainAgent" : "Explorer";
            getOrCreateStreamBlock(container, instanceId, roleId, instanceId, runId);
          }
          appendToolCallBlock(
            container,
            item.instanceId,
            "spawn_subagent",
            { description: "Explore " + item.callIndex },
            item.toolCallId,
            {
              runId: item.runId,
              roleId: item.roleId,
              label: item.instanceId === "primary" ? "Main Agent" : "Explorer",
            },
          );
          expectedArrivalOrder.get(item.key).push(item.toolCallId);
        });
        shuffle(order).forEach((item, index) => {
          const container = containers.get(item.key);
          if (index % 4 === 0) {
            container.replaceChildren();
          }
          updateToolResult(
            item.instanceId,
            "spawn_subagent",
            "done-" + item.toolCallId,
            false,
            item.toolCallId,
            {
              container,
              runId: item.runId,
              roleId: item.roleId,
              label: item.instanceId === "primary" ? "Main Agent" : "Explorer",
            },
          );
        });
        containers.forEach((container, key) => {
          container.replaceChildren();
          const [runId, instanceId] = key.split("::");
          const roleId = instanceId === "primary" ? "MainAgent" : "Explorer";
          getOrCreateStreamBlock(container, instanceId, roleId, instanceId, runId);
        });
        const missing = [];
        const missingResults = [];
        const orderMismatches = [];
        const overlayCounts = [];
        let duplicateMax = 0;
        let toolBlocks = 0;
        containers.forEach((container, key) => {
          const rendered = Array.from(container.querySelectorAll(".tool-block"))
            .map(item => item.dataset.toolCallId || "");
          toolBlocks += rendered.length;
          const renderedSet = new Set(rendered);
          expected.get(key).forEach(toolCallId => {
            if (!renderedSet.has(toolCallId)) {
              missing.push(key + ":" + toolCallId);
            }
            if (!container.textContent.includes("done-" + toolCallId)) {
              missingResults.push(key + ":" + toolCallId);
            }
          });
          const arrivalOrder = expectedArrivalOrder.get(key) || [];
          if (JSON.stringify(rendered) !== JSON.stringify(arrivalOrder)) {
            orderMismatches.push({
              key,
              expected: arrivalOrder,
              rendered,
            });
          }
          const [runId, instanceId] = key.split("::");
          const overlay = instanceId === "primary"
            ? getCoordinatorStreamOverlay(runId)
            : getInstanceStreamOverlay(runId, instanceId);
          overlayCounts.push((overlay?.parts || []).filter(part => part.kind === "tool").length);
          duplicateMax = Math.max(duplicateMax, maxDuplicateToolCount(container));
        });
        return {
          missing,
          missingResults,
          orderMismatches,
          overlayCounts,
          duplicateMax,
          containers: containers.size,
          toolBlocks,
        };
      },

      renderVisibleSubagentOverlaySwitchBack() {
        clearAllStreamState();
        const container = makeContainer("visible-subagent-switch-back");
        const runId = "subagent_run_visible_switch";
        const instanceId = "inst-visible";
        const roleId = "Writer";
        getOrCreateStreamBlock(container, instanceId, roleId, "Writer", runId);
        startThinkingBlock(instanceId, 0, {
          container,
          runId,
          roleId,
          label: "Writer",
        });
        appendThinkingChunk(instanceId, 0, "VISIBLE_THINK", {
          container,
          runId,
          roleId,
          label: "Writer",
        });
        appendToolCallBlock(
          container,
          instanceId,
          "shell",
          { command: "date" },
          "call-visible-switch",
          { runId, roleId, label: "Writer" },
        );
        appendStreamChunk(instanceId, "VISIBLE_TEXT", runId, roleId, "Writer");

        container.replaceChildren();
        renderHistory(container, [], {
          runId,
          streamOverlayEntry: getInstanceStreamOverlay(runId, instanceId),
          canonicalStreamKey: instanceId,
        });
        const thinkingEl = container.querySelector(".thinking-block");
        const toolEl = container.querySelector(".tool-block");
        const textEl = Array.from(container.querySelectorAll(".msg-text"))
          .find(item => (item.textContent || "").includes("VISIBLE_TEXT")) || null;
        return {
          thinkingBlockCount: container.querySelectorAll(".thinking-block").length,
          messageTextCount: Array.from(container.querySelectorAll(".msg-text"))
            .filter(item => (item.textContent || "").includes("VISIBLE_TEXT")).length,
          toolBlockCount: container.querySelectorAll(".tool-block").length,
          ordered: !!(
            thinkingEl
            && toolEl
            && textEl
            && (thinkingEl.compareDocumentPosition(toolEl) & Node.DOCUMENT_POSITION_FOLLOWING)
            && (toolEl.compareDocumentPosition(textEl) & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
        };
      },

      renderSubagentRenderBindSwitchBack() {
        clearAllStreamState();
        const firstContainer = makeContainer("subagent-render-bind-first");
        const runId = "subagent_run_render_bind_switch";
        const instanceId = "inst-render-bind";
        const roleId = "Explorer";
        const overlayLabel = "Explorer - 4de494db";
        const rebindLabel = "Explorer";
        getOrCreateStreamBlock(firstContainer, instanceId, roleId, overlayLabel, runId);
        startThinkingBlock(instanceId, 0, {
          container: firstContainer,
          runId,
          roleId,
          label: overlayLabel,
        });
        appendThinkingChunk(instanceId, 0, "VISIBLE_THINK", {
          container: firstContainer,
          runId,
          roleId,
          label: overlayLabel,
        });
        appendToolCallBlock(
          firstContainer,
          instanceId,
          "read_file",
          { path: "src/a.py" },
          "call-render-bind",
          { runId, roleId, label: overlayLabel },
        );
        appendStreamChunk(instanceId, "VISIBLE_TEXT", runId, roleId, overlayLabel);

        const rebound = makeContainer("subagent-render-bind-rebound");
        rebound.className = "subagent-session-body";
        rebound.dataset.runId = runId;
        rebound.dataset.instanceId = instanceId;
        renderHistory(rebound, [], {
          runId,
          runStatus: "running",
          timelineView: "normal-child-session",
          streamOverlayEntry: getInstanceStreamOverlay(runId, instanceId),
          canonicalStreamKey: instanceId,
          separateOverlayMessage: true,
        });
        bindStreamOverlayToContainer(rebound, {
          instanceId,
          roleId,
          label: rebindLabel,
          runId,
        });
        appendStreamChunk(instanceId, "_AFTER_SWITCH", runId, roleId, rebindLabel);
        updateToolResult(instanceId, "read_file", { ok: true }, false, "call-render-bind", {
          runId,
          roleId,
          label: rebindLabel,
          container: rebound,
        });

        return {
          messageCount: rebound.querySelectorAll(":scope > .message").length,
          thinkingBlockCount: rebound.querySelectorAll(".thinking-block").length,
          toolBlockCount: rebound.querySelectorAll(".tool-block").length,
          completedToolCount: rebound.querySelectorAll('.tool-block[data-status="completed"]').length,
          roleLabels: Array.from(rebound.querySelectorAll(":scope > .message"))
            .map(item => item.dataset.roleLabel || ""),
          textBlocks: Array.from(rebound.querySelectorAll(".msg-text"))
            .filter(item => !item.closest(".thinking-block"))
            .map(item => item.textContent.replace(/\\s+/g, " ").trim())
            .filter(Boolean),
        };
      },

      async renderStreamRebindSkipsUserPrompt() {
        clearAllStreamState();
        const container = makeContainer("stream-rebind-user-prompt");
        const runId = "run_rebind_user_prompt";
        renderHistory(container, [
          {
            role: "user",
            message: { parts: [{ part_kind: "text", content: "TASK_PROMPT" }] },
          },
        ], {
          runId,
          runStatus: "running",
          timelineView: "normal-child-session",
        });
        const userMessage = container.querySelector(':scope > .message[data-role="user"]');
        userMessage.dataset.runId = runId;
        userMessage.dataset.streamKey = "primary";
        getOrCreateStreamBlock(container, "", "", "Explorer", runId);
        appendStreamChunk("", "AGENT_DELTA", runId, "", "Explorer");
        await new Promise(resolve => requestAnimationFrame(resolve));
        const modelMessage = container.querySelector(':scope > .message[data-role="model"]');
        return {
          messageCount: container.querySelectorAll(":scope > .message").length,
          userText: userMessage?.querySelector(".msg-content")?.textContent.replace(/\\s+/g, " ").trim(),
          modelText: modelMessage?.querySelector(".msg-content")?.textContent.replace(/\\s+/g, " ").trim(),
        };
      },

      async renderSubagentSwitchBackThinkingOrder() {
        clearAllStreamState();
        const firstContainer = makeContainer("subagent-thinking-order-first");
        const runId = "subagent_run_thinking_order_switch";
        const instanceId = "inst-thinking-order";
        const roleId = "Explorer";
        getOrCreateStreamBlock(firstContainer, instanceId, roleId, "Explorer", runId);
        startThinkingBlock(instanceId, 0, {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });
        appendThinkingChunk(instanceId, 0, "THINK_A", {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });
        appendToolCallBlock(firstContainer, instanceId, "read_file", { path: "a.py" }, "call-a", {
          runId,
          roleId,
          label: "Explorer",
        });
        appendStreamChunk(instanceId, "TEXT_A", runId, roleId, "Explorer");
        startThinkingBlock(instanceId, 1, {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });
        appendThinkingChunk(instanceId, 1, "THINK_B", {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });
        appendToolCallBlock(firstContainer, instanceId, "read_file", { path: "b.py" }, "call-b", {
          runId,
          roleId,
          label: "Explorer",
        });
        appendStreamChunk(instanceId, "TEXT_B", runId, roleId, "Explorer");
        startThinkingBlock(instanceId, 2, {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });
        appendThinkingChunk(instanceId, 2, "THINK_LIVE", {
          container: firstContainer,
          runId,
          roleId,
          label: "Explorer",
        });

        const beforeOverlay = getInstanceStreamOverlay(runId, instanceId);
        const rebound = makeContainer("subagent-thinking-order-rebound");
        rebound.className = "subagent-session-body";
        rebound.dataset.runId = runId;
        rebound.dataset.instanceId = instanceId;
        renderHistory(rebound, [
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "thinking", content: "THINK_A", part_index: 0 }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-a", args: { path: "a.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-a", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "TEXT_A" }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "thinking", content: "THINK_B", part_index: 1 }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-b", args: { path: "b.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-b", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "TEXT_B" }] },
          },
        ], {
          runId,
          runStatus: "running",
          timelineView: "normal-child-session",
          streamOverlayEntry: beforeOverlay,
          canonicalStreamKey: instanceId,
          separateOverlayMessage: true,
        });
        bindStreamOverlayToContainer(rebound, {
          instanceId,
          roleId,
          label: "Explorer",
          runId,
        });
        appendStreamChunk(instanceId, "_TAIL", runId, roleId, "Explorer");
        await new Promise(resolve => requestAnimationFrame(resolve));
        const content = rebound.querySelector(":scope > .message .msg-content");
        const parts = Array.from(content?.children || []).map(child => {
          if (child.classList.contains("thinking-block")) {
            return "thinking:" + (child.querySelector(".thinking-text")?.textContent.replace(/\\s+/g, " ").trim() || "");
          }
          if (child.classList.contains("tool-block")) {
            return "tool:" + (child.dataset.toolCallId || "");
          }
          if (child.classList.contains("msg-text")) {
            return "text:" + child.textContent.replace(/\\s+/g, " ").trim();
          }
          return child.className || child.tagName.toLowerCase();
        }).filter(Boolean);
        const afterOverlay = getInstanceStreamOverlay(runId, instanceId);
        return {
          beforeThinkingFinished: (beforeOverlay?.parts || [])
            .filter(part => part.kind === "thinking")
            .map(part => part.finished === true),
          beforeActiveThinkingParts: Array.from(beforeOverlay?.thinkingActiveByPart?.keys?.() || []),
          afterActiveThinkingParts: Array.from(afterOverlay?.thinkingActiveByPart?.keys?.() || []),
          parts,
          thinkingTexts: Array.from(rebound.querySelectorAll(".thinking-block .thinking-text"))
            .map(item => item.textContent.replace(/\\s+/g, " ").trim())
            .filter(Boolean),
          textInsideThinking: Array.from(rebound.querySelectorAll(".thinking-block .msg-text"))
            .map(item => item.textContent.replace(/\\s+/g, " ").trim())
            .filter(text => text.includes("TEXT") || text.includes("_TAIL")),
        };
      },

      async renderSubagentSwitchBackWithoutPersistedThinking() {
        clearAllStreamState();
        const firstContainer = makeContainer("subagent-stale-thinking-first");
        const runId = "subagent_run_stale_thinking_switch";
        const instanceId = "inst-stale-thinking";
        const roleId = "Explorer";
        getOrCreateStreamBlock(firstContainer, instanceId, roleId, "Explorer", runId);
        startThinkingBlock(instanceId, 0, { container: firstContainer, runId, roleId, label: "Explorer" });
        appendThinkingChunk(instanceId, 0, "THINK_A", { container: firstContainer, runId, roleId, label: "Explorer" });
        appendToolCallBlock(firstContainer, instanceId, "read_file", { path: "a.py" }, "call-a", { runId, roleId, label: "Explorer" });
        appendStreamChunk(instanceId, "TEXT_A", runId, roleId, "Explorer");
        startThinkingBlock(instanceId, 1, { container: firstContainer, runId, roleId, label: "Explorer" });
        appendThinkingChunk(instanceId, 1, "THINK_B", { container: firstContainer, runId, roleId, label: "Explorer" });
        appendToolCallBlock(firstContainer, instanceId, "read_file", { path: "b.py" }, "call-b", { runId, roleId, label: "Explorer" });
        appendStreamChunk(instanceId, "TEXT_B", runId, roleId, "Explorer");
        startThinkingBlock(instanceId, 2, { container: firstContainer, runId, roleId, label: "Explorer" });
        appendThinkingChunk(instanceId, 2, "THINK_LIVE", { container: firstContainer, runId, roleId, label: "Explorer" });

        const beforeOverlay = getInstanceStreamOverlay(runId, instanceId);
        const rebound = makeContainer("subagent-stale-thinking-rebound");
        rebound.className = "subagent-session-body";
        rebound.dataset.runId = runId;
        rebound.dataset.instanceId = instanceId;
        renderHistory(rebound, [
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-a", args: { path: "a.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-a", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "TEXT_A" }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-b", args: { path: "b.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-b", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "TEXT_B" }] },
          },
        ], {
          runId,
          runStatus: "running",
          timelineView: "normal-child-session",
          streamOverlayEntry: beforeOverlay,
          canonicalStreamKey: instanceId,
          separateOverlayMessage: true,
        });
        bindStreamOverlayToContainer(rebound, { instanceId, roleId, label: "Explorer", runId });
        appendStreamChunk(instanceId, "_TAIL", runId, roleId, "Explorer");
        await new Promise(resolve => requestAnimationFrame(resolve));
        const content = rebound.querySelector(":scope > .message .msg-content");
        const parts = Array.from(content?.children || []).map(child => {
          if (child.classList.contains("thinking-block")) {
            return "thinking:" + (child.querySelector(".thinking-text")?.textContent.replace(/\\s+/g, " ").trim() || "");
          }
          if (child.classList.contains("tool-block")) {
            return "tool:" + (child.dataset.toolCallId || "");
          }
          if (child.classList.contains("msg-text")) {
            return "text:" + child.textContent.replace(/\\s+/g, " ").trim();
          }
          return child.className || child.tagName.toLowerCase();
        }).filter(Boolean);
        const afterOverlay = getInstanceStreamOverlay(runId, instanceId);
        return {
          beforeThinkingFinished: (beforeOverlay?.parts || [])
            .filter(part => part.kind === "thinking")
            .map(part => part.finished === true),
          beforeActiveThinkingParts: Array.from(beforeOverlay?.thinkingActiveByPart?.keys?.() || []),
          afterActiveThinkingParts: Array.from(afterOverlay?.thinkingActiveByPart?.keys?.() || []),
          parts,
          thinkingTexts: Array.from(rebound.querySelectorAll(".thinking-block .thinking-text"))
            .map(item => item.textContent.replace(/\\s+/g, " ").trim())
            .filter(Boolean),
          textInsideThinking: Array.from(rebound.querySelectorAll(".thinking-block .msg-text"))
            .map(item => item.textContent.replace(/\\s+/g, " ").trim())
            .filter(text => text.includes("TEXT") || text.includes("_TAIL")),
        };
      },

      renderRunningSubagentHistoryCompaction() {
        clearAllStreamState();
        const runId = "subagent_run_running_history_compaction";
        const instanceId = "inst-running-history";
        const roleId = "Writer";
        const container = makeContainer("subagent-running-history-compaction");
        container.className = "subagent-session-body";
        container.dataset.runId = runId;
        container.dataset.instanceId = instanceId;
        renderHistory(container, [
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "I'll systematically explore the plugin system." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-run-1", args: { path: "src/relay_teams/plugins" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-run-1", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "Excellent. Now let me read all the core plugin source files." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-run-2", args: { path: "src/relay_teams/plugins/__init__.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-run-2", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "text", content: "Let me read the remaining files." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-run-3", args: { path: "src/relay_teams/plugins/config_manager.py" } }] },
          },
          {
            role: "user",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-run-3", content: { ok: true } }] },
          },
        ], {
          runId,
          runStatus: "running",
          timelineView: "normal-child-session",
          canonicalStreamKey: instanceId,
          streamOverlayEntry: null,
        });
        const content = container.querySelector(":scope > .message .msg-content");
        const parts = Array.from(content?.children || []).map(child => {
          if (child.classList.contains("tool-block")) {
            return "tool:" + (child.dataset.toolName || "");
          }
          if (child.classList.contains("msg-text")) {
            return "text:" + child.textContent.replace(/\\s+/g, " ").trim();
          }
          return child.className || child.tagName.toLowerCase();
        });
        return {
          groupCount: container.querySelectorAll(".tool-group").length,
          messageCount: container.querySelectorAll(":scope > .message").length,
          parts,
        };
      },

      renderTerminalCollapseWithCompletedOverlay() {
        clearAllStreamState();
        const container = makeContainer("terminal-collapse");
        container.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        renderHistory(container, [{
          role: "assistant",
          role_id: "main-role",
          instance_id: "primary",
          created_at: "2026-04-25T12:00:02Z",
          message: {
            parts: [{ part_kind: "text", content: "planning complete" }],
          },
        }], {
          runId: "run-terminal-collapse",
          runStatus: "completed",
          hasFinalOutput: true,
          streamOverlayEntry: {
            roleId: "main-role",
            instanceId: "primary",
            streamKey: "primary",
            label: "Main Agent",
            parts: [{
              kind: "tool",
              tool_name: "write_file",
              tool_call_id: "call-final",
              args: { path: "page.svg" },
              status: "completed",
              result: { ok: true },
            }],
            textStreaming: false,
            idleCursor: false,
          },
        });
        return {
          groupCount: container.querySelectorAll(".tool-group").length,
          groupToolCount: container.querySelectorAll(".tool-group .tool-block").length,
        };
      },

      renderTerminalPayloadOutput() {
        clearAllStreamState();
        const runId = "run-terminal-payload-output";
        const container = makeContainer("terminal-payload-output");
        container.className = "session-round-section";
        container.dataset.runId = runId;
        routeEvent(
          "run_completed",
          {
            trace_id: runId,
            root_task_id: "task-terminal-output",
            output: [{ kind: "text", text: "terminal payload final answer" }],
          },
          {
            run_id: runId,
            trace_id: runId,
            event_id: "terminal-payload-output-event",
          },
        );
        const failedRunId = "run-terminal-payload-failed-output";
        const failedContainer = makeContainer("terminal-payload-failed-output");
        failedContainer.className = "session-round-section";
        failedContainer.dataset.runId = failedRunId;
        routeEvent(
          "run_failed",
          {
            trace_id: failedRunId,
            root_task_id: "task-terminal-failed-output",
            completion_reason: "assistant_response",
            output: [{ kind: "text", text: "failed assistant final answer" }],
          },
          {
            run_id: failedRunId,
            trace_id: failedRunId,
            event_id: "terminal-payload-failed-output-event",
          },
        );
        const stoppedRunId = "run-terminal-payload-stopped-output";
        const stoppedContainer = makeContainer("terminal-payload-stopped-output");
        stoppedContainer.className = "session-round-section";
        stoppedContainer.dataset.runId = stoppedRunId;
        routeEvent(
          "run_stopped",
          {
            trace_id: stoppedRunId,
            root_task_id: "task-terminal-stopped-output",
            status: "stopped",
            output: [{ kind: "text", text: "stopped diagnostic output" }],
          },
          {
            run_id: stoppedRunId,
            trace_id: stoppedRunId,
            event_id: "terminal-payload-stopped-output-event",
          },
        );
        return {
          text: container.textContent || "",
          failedText: failedContainer.textContent || "",
          stoppedText: stoppedContainer.textContent || "",
          occurrences: countSubstring(container.textContent || "", "terminal payload final answer"),
          cursorCount: container.querySelectorAll(".streaming-cursor").length,
        };
      },

      renderTerminalPayloadDedupesHydratedHistory() {
        clearAllStreamState();
        const runId = "run-terminal-payload-history-dedupe";
        const container = makeContainer("terminal-payload-history-dedupe");
        container.className = "session-round-section";
        container.dataset.runId = runId;
        const terminalText = [
          "codehub-mr-loop skill defines these available roles:",
          "| Role | File | Responsibility |",
          "| --- | --- | --- |",
          "| ci-analyzer | \`agents/ci-analyzer.md\` | Query CI pipeline status |",
          "The previous request could not be completed because of an API or execution error.",
        ].join("\\n\\n");
        renderHistory(container, [{
          role: "assistant",
          role_id: "Coordinator",
          instance_id: "primary",
          message: {
            parts: [{ part_kind: "text", content: terminalText }],
          },
        }], {
          runId,
          runStatus: "completed",
          timelineView: "main",
          canonicalStreamKey: "primary",
        });
        routeEvent(
          "run_completed",
          {
            trace_id: runId,
            root_task_id: "task-terminal-history-dedupe",
            output: [{ kind: "text", text: terminalText }],
          },
          {
            run_id: runId,
            trace_id: runId,
            event_id: "terminal-payload-history-dedupe-event",
          },
        );
        return {
          text: container.textContent || "",
          occurrences: countSubstring(container.textContent || "", "codehub-mr-loop skill"),
          messageCount: container.querySelectorAll(".message").length,
        };
      },

      renderTerminalHistoryWithToolAndFinalOutput() {
        clearAllStreamState();
        const runId = "run-terminal-history-tool-final";
        const container = makeContainer("terminal-history-tool-final");
        container.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        renderHistory(container, [
          {
            role: "assistant",
            role_id: "main-role",
            instance_id: "primary",
            created_at: "2026-04-25T12:00:02Z",
            message: {
              parts: [{
                part_kind: "tool-call",
                tool_name: "shell",
                tool_call_id: "call-history-final",
                args: { command: "date" },
              }],
            },
          },
          {
            role: "user",
            role_id: "main-role",
            instance_id: "primary",
            created_at: "2026-04-25T12:00:03Z",
            message: {
              parts: [{
                part_kind: "tool-return",
                tool_name: "shell",
                tool_call_id: "call-history-final",
                content: { ok: true, output: "tool completed" },
              }],
            },
          },
          {
            role: "assistant",
            role_id: "main-role",
            instance_id: "primary",
            created_at: "2026-04-25T12:00:04Z",
            reconstructed: true,
            message: {
              parts: [{ part_kind: "text", content: "terminal projected final answer" }],
            },
          },
        ], {
          runId,
          runStatus: "completed",
          hasFinalOutput: true,
          timelineView: "main",
          canonicalStreamKey: "primary",
          streamOverlayEntry: null,
        });
        return {
          text: container.textContent || "",
          occurrences: countSubstring(container.textContent || "", "terminal projected final answer"),
          groupCount: container.querySelectorAll(".tool-group").length,
          flowCount: container.querySelectorAll(".message-history-flow").length,
          groupBodyClass: container.querySelector(".tool-group-body")?.className || "",
          toolBlockCount: container.querySelectorAll(".tool-block").length,
          messageCount: container.querySelectorAll(".message").length,
        };
      },

      renderFinalMessageCollapseMatrix() {
        clearAllStreamState();
        const renderCase = (id, runStatus, hasFinalOutput, parts) => {
          const container = makeContainer(id);
          container.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
          renderHistory(container, [{
            role: "assistant",
            role_id: "main-role",
            instance_id: "primary",
            created_at: "2026-04-25T12:00:02Z",
            message: { parts },
          }], {
            runId: "run-" + id,
            runStatus,
            hasFinalOutput,
            streamOverlayEntry: null,
          });
          return {
            groupCount: container.querySelectorAll(".tool-group").length,
            text: container.textContent || "",
          };
        };
        const stoppedNoFinal = renderCase("stopped-no-final", "stopped", false, [
          { part_kind: "thinking", part_index: 0, content: "stopped thought" },
          {
            part_kind: "tool-call",
            tool_name: "shell",
            tool_call_id: "call-stopped",
            args: { command: "date" },
          },
        ]);
        const failedFinal = renderCase("failed-final", "failed", true, [
          { part_kind: "thinking", part_index: 0, content: "failed thought" },
          {
            part_kind: "tool-call",
            tool_name: "shell",
            tool_call_id: "call-failed",
            args: { command: "date" },
          },
          { part_kind: "text", content: "failed final answer" },
        ]);
        const cancelledFinal = renderCase("cancelled-final", "cancelled", true, [
          { part_kind: "thinking", part_index: 0, content: "cancelled thought" },
          { part_kind: "text", content: "cancelled final answer" },
        ]);
        const completedNoFinal = renderCase("completed-no-final", "completed", false, [
          { part_kind: "thinking", part_index: 0, content: "completed thought" },
          {
            part_kind: "tool-call",
            tool_name: "shell",
            tool_call_id: "call-completed",
            args: { command: "date" },
          },
          { part_kind: "text", content: "loop middle output" },
        ]);
        return {
          stoppedNoFinalGroupCount: stoppedNoFinal.groupCount,
          failedFinalGroupCount: failedFinal.groupCount,
          cancelledFinalGroupCount: cancelledFinal.groupCount,
          completedNoFinalGroupCount: completedNoFinal.groupCount,
          failedFinalText: failedFinal.text,
          cancelledFinalText: cancelledFinal.text,
          completedNoFinalText: completedNoFinal.text,
        };
      },

      renderLiveTerminalAndHistoryParity() {
        clearAllStreamState();
        const runId = "run-live-history-parity";
        const roleId = "main-role";
        const live = makeContainer("live-history-parity-live");
        live.className = "session-round-section";
        live.dataset.runId = runId;
        live.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        getOrCreateStreamBlock(live, "primary", roleId, "Main Agent", runId);
        appendToolCallBlock(live, "primary", "search", { q: "plugin" }, "call-1", {
          runId,
          roleId,
          label: "Main Agent",
        });
        updateToolResult("primary", "search", { ok: true }, false, "call-1", {
          runId,
          roleId,
          label: "Main Agent",
          container: live,
        });
        appendToolCallBlock(live, "primary", "read_file", { path: "src/a.py" }, "call-2", {
          runId,
          roleId,
          label: "Main Agent",
        });
        updateToolResult("primary", "read_file", { ok: true }, false, "call-2", {
          runId,
          roleId,
          label: "Main Agent",
          container: live,
        });
        appendStreamChunk(
          "primary",
          "Now let me read the remaining key files for the full picture.",
          runId,
          roleId,
          "Main Agent",
        );
        appendToolCallBlock(live, "primary", "read_file", { path: "src/b.py" }, "call-3", {
          runId,
          roleId,
          label: "Main Agent",
        });
        updateToolResult("primary", "read_file", { ok: true }, false, "call-3", {
          runId,
          roleId,
          label: "Main Agent",
          container: live,
        });
        appendStreamChunk("primary", "final answer", runId, roleId, "Main Agent");
        reconcileTerminalRunStreamState(runId);

        const history = makeContainer("live-history-parity-history");
        history.className = "session-round-section";
        history.dataset.runId = runId;
        history.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        renderHistory(history, [
          {
            role: "assistant",
            role_id: roleId,
            instance_id: "primary",
            created_at: "2026-04-25T12:00:01Z",
            message: { parts: [{ part_kind: "tool-call", tool_name: "search", tool_call_id: "call-1", args: { q: "plugin" } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:02Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "search", tool_call_id: "call-1", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: "primary",
            created_at: "2026-04-25T12:00:03Z",
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-2", args: { path: "src/a.py" } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:04Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-2", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: "primary",
            created_at: "2026-04-25T12:00:05Z",
            message: { parts: [{ part_kind: "text", content: "Now let me read the remaining key files for the full picture." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: "primary",
            created_at: "2026-04-25T12:00:06Z",
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-3", args: { path: "src/b.py" } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:07Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-3", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: "primary",
            created_at: "2026-04-25T12:00:08Z",
            message: { parts: [{ part_kind: "text", content: "final answer" }] },
          },
        ], {
          runId,
          runStatus: "completed",
          hasFinalOutput: true,
          timelineView: "main",
          canonicalStreamKey: "primary",
          streamOverlayEntry: null,
        });

        return {
          live: serializeProcessedTranscript(live),
          history: serializeProcessedTranscript(history),
        };
      },

      renderSubagentTerminalParity() {
        clearAllStreamState();
        const runId = "subagent_run_terminal_parity";
        const instanceId = "inst-terminal-parity";
        const roleId = "Writer";
        const live = makeContainer("subagent-terminal-parity-live");
        live.className = "subagent-session-body";
        live.dataset.runId = runId;
        live.dataset.instanceId = instanceId;
        live.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        getOrCreateStreamBlock(live, instanceId, roleId, "Writer", runId);
        appendToolCallBlock(live, instanceId, "read_file", { path: "src/a.py" }, "call-sub-1", {
          runId,
          roleId,
          label: "Writer",
        });
        updateToolResult(instanceId, "read_file", { ok: true }, false, "call-sub-1", {
          runId,
          roleId,
          label: "Writer",
          container: live,
        });
        appendStreamChunk(instanceId, "Let me read the remaining key files.", runId, roleId, "Writer");
        appendToolCallBlock(live, instanceId, "read_file", { path: "src/b.py" }, "call-sub-2", {
          runId,
          roleId,
          label: "Writer",
        });
        updateToolResult(instanceId, "read_file", { ok: true }, false, "call-sub-2", {
          runId,
          roleId,
          label: "Writer",
          container: live,
        });
        appendStreamChunk(instanceId, "subagent final answer", runId, roleId, "Writer");
        reconcileTerminalRunStreamState(runId);

        const history = makeContainer("subagent-terminal-parity-history");
        history.className = "subagent-session-body";
        history.dataset.runId = runId;
        history.dataset.instanceId = instanceId;
        history.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        renderHistory(history, [
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:01Z",
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-sub-1", args: { path: "src/a.py" } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:02Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-sub-1", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:03Z",
            message: { parts: [{ part_kind: "text", content: "Let me read the remaining key files." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:04Z",
            message: { parts: [{ part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-sub-2", args: { path: "src/b.py" } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:05Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-sub-2", content: { ok: true } }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:06Z",
            message: { parts: [{ part_kind: "text", content: "subagent final answer" }] },
          },
        ], {
          runId,
          runStatus: "idle",
          runPhase: "terminal",
          timelineView: "normal-child-session",
          canonicalStreamKey: instanceId,
          streamOverlayEntry: null,
        });

        return {
          live: serializeProcessedTranscript(live),
          history: serializeProcessedTranscript(history),
        };
      },

      renderCompletedSubagentStatusOnlyTranscript() {
        clearAllStreamState();
        const runId = "subagent_run_status_only";
        const instanceId = "inst-status-only";
        const roleId = "Explorer";
        const container = makeContainer("subagent-status-only");
        container.className = "subagent-session-body";
        container.dataset.runId = runId;
        container.dataset.instanceId = instanceId;
        container.dataset.roundCreatedAt = "2026-04-25T12:00:00Z";
        renderHistory(container, [
          {
            role: "user",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:00Z",
            message: { parts: [{ part_kind: "user-prompt", content: "Explore this area." }] },
          },
          {
            role: "assistant",
            role_id: roleId,
            instance_id: instanceId,
            created_at: "2026-04-25T12:00:01Z",
            message: {
              parts: [
                { part_kind: "thinking", content: "hidden thought" },
                { part_kind: "text", content: "Let me inspect first." },
                { part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-status-1", args: { path: "src/a.py" } },
                { part_kind: "text", content: "Next file." },
                { part_kind: "tool-call", tool_name: "read_file", tool_call_id: "call-status-2", args: { path: "src/b.py" } },
                { part_kind: "text", content: "final response" },
              ],
            },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:02Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-status-1", content: { ok: true } }] },
          },
          {
            role: "user",
            created_at: "2026-04-25T12:00:03Z",
            message: { parts: [{ part_kind: "tool-return", tool_name: "read_file", tool_call_id: "call-status-2", content: { ok: true } }] },
          },
        ], {
          runId,
          status: "completed",
          timelineView: "normal-child-session",
          canonicalStreamKey: instanceId,
          streamOverlayEntry: null,
        });
        return {
          ...serializeProcessedTranscript(container),
          containsLiveLabel: (container.textContent || "").includes("Live"),
        };
      },

      async renderSubagentRoundNavigatorSuppression() {
        const existingNav = document.getElementById("round-nav-float");
        existingNav?.remove?.();
        document.querySelectorAll(".chat-container").forEach(node => node.remove());

        const shell = document.createElement("main");
        shell.id = "chat-container";
        shell.className = "chat-container is-subagent-session-active";
        shell.style.width = "960px";
        shell.style.height = "420px";
        shell.style.display = "flex";
        shell.style.position = "relative";
        const scroll = document.createElement("div");
        scroll.className = "chat-scroll";
        scroll.style.width = "960px";
        scroll.style.height = "420px";
        const wrapper = document.createElement("section");
        wrapper.className = "subagent-session-view";
        const body = document.createElement("div");
        body.className = "subagent-session-body";
        wrapper.appendChild(body);
        scroll.appendChild(wrapper);
        shell.appendChild(scroll);
        document.body.appendChild(shell);

        const rounds = [
          {
            run_id: "round-suppressed-1",
            intent: "Suppressed round one",
            status: "completed",
            created_at: "2026-04-25T12:00:00Z",
          },
          {
            run_id: "round-suppressed-2",
            intent: "Suppressed round two",
            status: "running",
            created_at: "2026-04-25T12:02:00Z",
          },
        ];
        const nextFrame = () => new Promise(resolve => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        });
        const isVisible = element => {
          if (!element) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && Number(rect.width || 0) > 0
            && Number(rect.height || 0) > 0;
        };

        renderRoundNavigator(rounds, () => {}, { activeRunId: "round-suppressed-1" });
        await nextFrame();
        const subagentNav = document.getElementById("round-nav-float");
        const subagentNavVisible = isVisible(subagentNav);
        const subagentHasTimelineClass = shell.classList.contains("rounds-timeline-visible");
        const subagentDensity = shell.getAttribute("data-round-timeline-density") || "";

        const baselineWidth = Math.round(wrapper.getBoundingClientRect().width);
        const staleNav = subagentNav || document.createElement("aside");
        staleNav.id = "round-nav-float";
        staleNav.className = "round-nav-float round-nav-timeline";
        staleNav.style.display = "block";
        if (!staleNav.parentNode) {
          shell.appendChild(staleNav);
        }
        shell.classList.add("rounds-timeline-visible");
        shell.dataset.roundTimelineDensity = "full";
        await nextFrame();
        const staleWidth = Math.round(wrapper.getBoundingClientRect().width);
        const scrollWidth = Math.round(scroll.getBoundingClientRect().width);
        const staleNavVisible = isVisible(staleNav);

        shell.classList.remove("is-subagent-session-active");
        shell.classList.remove("rounds-timeline-visible");
        delete shell.dataset.roundTimelineDensity;
        wrapper.remove();
        renderRoundNavigator(rounds, () => {}, { activeRunId: "round-suppressed-1" });
        await nextFrame();
        const mainNav = document.getElementById("round-nav-float");
        return {
          subagentNavVisible,
          subagentHasTimelineClass,
          subagentDensity,
          staleNavVisible,
          baselineWidth,
          staleWidth,
          staleWithinScroll: staleWidth <= scrollWidth,
          mainNavVisible: isVisible(mainNav),
          mainHasTimelineClass: shell.classList.contains("rounds-timeline-visible"),
          mainNodeCount: mainNav?.querySelectorAll?.(".round-nav-node")?.length || 0,
        };
      },

      measureSubagentSessionWidth() {
        const shell = document.createElement("main");
        shell.id = "chat-container";
        shell.className = "chat-container";
        shell.style.width = "960px";
        shell.style.height = "400px";
        shell.style.display = "block";
        const scroll = document.createElement("div");
        scroll.className = "chat-scroll";
        scroll.style.width = "960px";
        scroll.style.height = "400px";
        const wrapper = document.createElement("section");
        wrapper.className = "subagent-session-view";
        const body = document.createElement("div");
        body.className = "subagent-session-body";
        wrapper.appendChild(body);
        scroll.appendChild(wrapper);
        shell.appendChild(scroll);
        document.body.appendChild(shell);
        const beforeWidth = Math.round(wrapper.getBoundingClientRect().width);
        body.appendChild(document.createElement("div"));
        const afterWidth = Math.round(wrapper.getBoundingClientRect().width);
        const scrollWidth = Math.round(scroll.getBoundingClientRect().width);
        return {
          beforeWidth,
          afterWidth,
          beforeWithinScroll: beforeWidth <= scrollWidth,
          afterWithinScroll: afterWidth <= scrollWidth,
        };
      },
    };
  </script>
</body>
</html>
`.trim();
}
