import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { waitForAppShell } from "./support/frontend-app";
import {
  type ManagedRealBackend,
  startManagedRealBackend,
} from "./support/managed-real-backend";

const ENABLED = process.env.AGENT_TEAMS_MANAGED_REAL_CONCURRENCY === "1";
const SESSION_COUNT = boundedSessionCount(
  process.env.AGENT_TEAMS_REAL_CONCURRENCY_SESSIONS,
);
const STREAM_HOLD_MS = boundedStreamHoldMs(
  process.env.AGENT_TEAMS_REAL_CONCURRENCY_HOLD_MS,
);
const EDGE_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ?? "";
const PROVIDER_SLOT_COUNT = 4;
const SLOW_PROVIDER_CALL_BUDGET_MS = 70_000;
const SUBAGENT_PROVIDER_CALL_COUNT = 3;
const SUBAGENT_CHUNK_SIZE = 8;
const SUBAGENT_CHUNK_DELAY_MS = 80;
const SUBAGENT_LINE_EVERY = 2;
const SUBAGENT_TOKEN_COUNT = 192;

interface SessionRecord {
  active_run_id?: string | null;
  latest_terminal_run_id?: string | null;
  latest_terminal_run_status?: string | null;
  metadata?: { title?: string | null } | null;
  session_id: string;
  workspace_id?: string | null;
}

interface RunCreateResponse {
  run_id?: string | null;
}

interface StartedRun {
  expectedFinalToken: string;
  expectedPrefix: string;
  isReloadProbe: boolean;
  isSubagent: boolean;
  runId: string;
  session: SessionRecord;
  slowTokenCount: number;
  tag: string;
  title: string;
}

interface BrowserProbeSnapshot {
  currentEventSources: number;
  finalHeapBytes: number | null;
  initialHeapBytes: number | null;
  interactionDurations: number[];
  longTasks: number[];
  peakEventSources: number;
}

interface QueueStageObservation {
  expectedProviderStartUpperBoundMs: number;
  firstIncrementObservedAtMs: number | null;
  phase: "streaming" | "waiting";
  providerCallCount: number;
  runId: string;
  sessionId: string;
  title: string;
  userPromptVisibleAtMs: number;
}

interface SubagentScrollGrowthEvidence {
  cardObservedAtMs: number;
  cardObservedProviderWave: number;
  firstSampleHeight: number;
  firstSampleTokenIndex: number;
  secondSampleHeight: number;
  secondSampleTokenIndex: number;
  overflowHeight: number;
  tokenIndexAtOverflow: number;
}

interface RunningSubagentVerification {
  concurrencyOverlap: ConcurrencyOverlapEvidence;
  firstIncrementObservedAtMs: number;
  scrollGrowth: SubagentScrollGrowthEvidence;
}

interface ConcurrencyOverlapEvidence {
  childBadgeStatus: "running";
  childRunningObservedAtMs: number;
  initialNormalParentActiveCount: number;
  initialNormalParentObservedAtMs: number;
  initialNormalParentRunIds: string[];
  normalParentActiveCountAtChildRunning: number;
  normalParentRunIdsAtChildRunning: string[];
}

interface FailureCollection {
  beginExpectedEventAbortWindow: () => void;
  consoleErrors: string[];
  crashes: string[];
  endExpectedEventAbortWindow: () => void;
  httpFailures: string[];
  networkFailures: string[];
  pageErrors: string[];
}

test.skip(
  !ENABLED,
  "Set AGENT_TEAMS_MANAGED_REAL_CONCURRENCY=1 to run the real concurrency gate.",
);

test.setTimeout(480_000);

let managedBackend: ManagedRealBackend;

test.beforeAll(async () => {
  expect(
    EDGE_EXECUTABLE.toLowerCase(),
    "The real concurrency gate must use the Microsoft Edge executable.",
  ).toContain("msedge");
  managedBackend = await startManagedRealBackend();
});

test.afterAll(async () => {
  await managedBackend?.close();
});

test("real UI keeps concurrent session streams isolated, responsive, and bounded", async ({
  page,
}) => {
  const gateStartedAt = Date.now();
  const failures = installFailureCollection(page);
  const stamp = Date.now();
  const sessions = await Promise.all(
    Array.from({ length: SESSION_COUNT }, (_, index) =>
      createSession(
        `real-concurrency-${stamp}-${String(index + 1).padStart(2, "0")}`,
      ),
    ),
  );
  const startedRuns: StartedRun[] = [];
  const queueStageObservations: QueueStageObservation[] = [];
  let concurrencyOverlapEvidence: ConcurrencyOverlapEvidence | null = null;
  let subagentFirstIncrementObservedAtMs: number | null = null;
  let subagentScrollGrowthEvidence: SubagentScrollGrowthEvidence | null = null;

  try {
    await installBrowserProbe(page, sessions[0]);
    await page.goto(`${apiBaseUrl()}/?real_concurrency=${stamp}`, {
      waitUntil: "domcontentloaded",
    });
    await expectShellReady(page);
    await page.evaluate(() => {
      const probe = window.__managedRealConcurrencyProbe;
      if (probe !== undefined && performance.memory !== undefined) {
        probe.initialHeapBytes = performance.memory.usedJSHeapSize;
      }
    });

    for (let index = 0; index < sessions.length; index += 1) {
      const session = sessions[index];
      if (session === undefined) {
        throw new Error(`Missing managed session at index ${index}.`);
      }
      const title = session.metadata?.title ?? "";
      await selectSession(page, title, failures);
      const tag = title.replace(/[^A-Za-z0-9_-]/g, "_").replace(/-/g, "_");
      const isSubagentRun = index === sessions.length - 1;
      const isReloadProbe = index === sessions.length - 2;
      const repeat = isReloadProbe ? 80 : 72;
      const delayMs = isReloadProbe ? 200 : 90;
      const promptText = isSubagentRun
        ? [
            `${title}: [hook-subagent-lifecycle tag=${tag} worker_repeat=${SUBAGENT_TOKEN_COUNT} worker_delay=${SUBAGENT_CHUNK_DELAY_MS} worker_line_every=${SUBAGENT_LINE_EVERY} background=true]`,
            "通过 spawn_subagent 启动 Explorer，并让子代理流式输出确定性 token。",
            "主代理完成后只输出 fake LLM 的最终完成句。",
          ].join("\n")
        : [
            `${title}: [slow-stream tag=${tag} repeat=${repeat} delay=${delayMs} chunk=8 hold=${STREAM_HOLD_MS}]`,
            "只输出 fake LLM 返回的确定性慢速文本。",
          ].join("\n");
      const runResponse = waitForRunCreateResponse(page);
      const textbox = page.getByRole("textbox", { name: /提示词|Prompt/ });
      await textbox.click();
      await page.keyboard.insertText(promptText);
      const send = page.getByRole("button", { name: /^发送$|^Send$/ });
      await expect(send).toBeEnabled();
      await send.click();
      const runId = await runIdFromResponse(await runResponse);
      startedRuns.push({
        expectedFinalToken: isSubagentRun
          ? "[fake-llm] subagent lifecycle completed"
          : slowStreamToken(tag, repeat - 1),
        expectedPrefix: isSubagentRun
          ? `SUBAGENT_STREAM_${tag}_`
          : `SLOW_STREAM_${tag}_`,
        isReloadProbe,
        isSubagent: isSubagentRun,
        runId,
        session,
        slowTokenCount: isSubagentRun ? 0 : repeat,
        tag,
        title,
      });
      if (!isSubagentRun) {
        await expect
          .poll(() => activeRunId(session.session_id), { timeout: 20_000 })
          .toBe(runId);
      }
    }

    const normalRuns = startedRuns.filter((run) => !run.isSubagent);
    await expect
      .poll(
        () =>
          Promise.all(
            normalRuns.map((run) => activeRunId(run.session.session_id)),
          ),
        { timeout: 20_000 },
      )
      .toEqual(normalRuns.map((run) => run.runId));
    const initialNormalParentObservedAtMs = Date.now() - gateStartedAt;
    const initialNormalParentRunIds = normalRuns.map((run) => run.runId);
    const subagentRun = startedRuns.find((run) => run.isSubagent);
    if (subagentRun === undefined) {
      throw new Error("Expected a subagent run.");
    }
    await stableScreenshot(
      page,
      test.info().outputPath("managed-real-concurrency-active.jpg"),
    );

    const subagentVerification = await verifyRunningSubagent(
      page,
      failures,
      subagentRun,
      startedRuns,
      gateStartedAt,
      initialNormalParentObservedAtMs,
      initialNormalParentRunIds,
    );
    subagentFirstIncrementObservedAtMs =
      subagentVerification.firstIncrementObservedAtMs;
    concurrencyOverlapEvidence = subagentVerification.concurrencyOverlap;
    subagentScrollGrowthEvidence = subagentVerification.scrollGrowth;

    for (const [index, run] of startedRuns.entries()) {
      await selectSession(page, run.title, failures);
      await expect
        .poll(() => persistedUserPromptText(page), { timeout: 10_000 })
        .toContain(run.title);
      const visibleText = await mainTimelineText(page);
      for (const other of startedRuns) {
        if (other.runId !== run.runId) {
          expect(visibleText).not.toContain(other.expectedPrefix);
        }
      }
      const phase = visibleText.includes(run.expectedPrefix)
        ? "streaming"
        : "waiting";
      const providerCallCount = run.isSubagent
        ? SUBAGENT_PROVIDER_CALL_COUNT
        : 1;
      queueStageObservations.push({
        expectedProviderStartUpperBoundMs: providerQueueUpperBoundMs(
          index,
          providerCallCount,
        ),
        firstIncrementObservedAtMs:
          run.isSubagent && subagentFirstIncrementObservedAtMs !== null
            ? subagentFirstIncrementObservedAtMs
            : phase === "streaming"
              ? Date.now() - gateStartedAt
              : null,
        phase,
        providerCallCount,
        runId: run.runId,
        sessionId: run.session.session_id,
        title: run.title,
        userPromptVisibleAtMs: Date.now() - gateStartedAt,
      });
    }
    expect(
      queueStageObservations.some(({ phase }) => phase === "waiting"),
    ).toBe(true);
    expect(
      queueStageObservations.some(
        ({ expectedProviderStartUpperBoundMs, phase }) =>
          phase === "waiting" &&
          expectedProviderStartUpperBoundMs >= SLOW_PROVIDER_CALL_BUDGET_MS * 3,
      ),
      "the 12-run fixture must retain a third provider wave in waiting state",
    ).toBe(true);

    const reloadRun = startedRuns.find((run) => run.isReloadProbe);
    if (reloadRun === undefined) {
      throw new Error("Expected a normal stream for reload recovery.");
    }
    await selectSession(page, reloadRun.title, failures);
    await expect
      .poll(() => mainTimelineText(page), {
        timeout: remainingProviderQueueBudgetMs(
          gateStartedAt,
          startedRuns.indexOf(reloadRun),
          1,
        ),
      })
      .toContain(reloadRun.expectedPrefix);
    markFirstIncrementObserved(
      queueStageObservations,
      reloadRun.runId,
      gateStartedAt,
    );
    const beforeReloadIndex = await highestSlowStreamTokenIndex(
      page,
      reloadRun,
    );
    expect(beforeReloadIndex).toBeGreaterThanOrEqual(0);
    expect(beforeReloadIndex).toBeLessThan(reloadRun.slowTokenCount - 1);
    expect(await activeRunId(reloadRun.session.session_id)).toBe(
      reloadRun.runId,
    );
    const storedSelectionBeforeReload = await page.evaluate(() =>
      window.localStorage.getItem("agentTeams.selectedSessionId"),
    );
    expect(storedSelectionBeforeReload).toBe(reloadRun.session.session_id);
    const beforeReloadProbe = await browserProbeSnapshot(page);
    failures.beginExpectedEventAbortWindow();
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      expect(
        await page.evaluate(() =>
          window.localStorage.getItem("agentTeams.selectedSessionId"),
        ),
        "the init script must not overwrite an existing session selection",
      ).toBe(storedSelectionBeforeReload);
      await expectShellReady(page);
      const restoredTitle =
        (await page.locator(".at-session-item.is-selected").textContent()) ??
        "";
      expect
        .soft(
          restoredTitle,
          "reload must restore the session that was selected before navigation",
        )
        .toContain(reloadRun.title);
      if (!restoredTitle.includes(reloadRun.title)) {
        await selectSession(page, reloadRun.title, failures);
      }
    } finally {
      failures.endExpectedEventAbortWindow();
    }
    await expect
      .poll(() => highestSlowStreamTokenIndex(page, reloadRun), {
        timeout: 45_000,
      })
      .toBeGreaterThan(beforeReloadIndex);
    await expect
      .poll(() => messageArticleCount(page, reloadRun.expectedPrefix))
      .toBe(1);
    await stableScreenshot(
      page,
      test.info().outputPath("managed-real-concurrency-post-reload.jpg"),
    );

    const anchor = [...startedRuns].reverse().find((run) => !run.isSubagent);
    if (anchor === undefined) {
      throw new Error("Expected an anchor run.");
    }
    await selectSession(page, anchor.title, failures);
    const timeline = page.locator(".at-chat-view .at-timeline");
    await expect
      .poll(
        () =>
          timeline.evaluate(
            (element) => element.scrollHeight - element.clientHeight,
          ),
        { timeout: 90_000 },
      )
      .toBeGreaterThan(300);
    await timeline.hover();
    await page.mouse.wheel(0, -700);
    const away = await timelineMetrics(timeline);
    expect(away.distanceFromBottom).toBeGreaterThan(120);
    await page.waitForTimeout(1_500);
    const afterStreaming = await timelineMetrics(timeline);
    expect(afterStreaming.distanceFromBottom).toBeGreaterThan(100);
    expect(afterStreaming.scrollTop).toBeLessThanOrEqual(away.scrollTop + 24);
    await stableScreenshot(
      page,
      test.info().outputPath("managed-real-concurrency-away-scroll.jpg"),
    );

    for (const run of [...startedRuns].reverse()) {
      await selectSession(page, run.title, failures);
      await expect(page.locator(".at-session-item.is-selected")).toContainText(
        run.title,
      );
      if (run.runId === subagentRun.runId) {
        await expect
          .poll(() =>
            page
              .locator(".at-chat-view .at-message-tool.is-openable-subagent")
              .count(),
          )
          .toBeGreaterThan(0);
      } else {
        await expect
          .poll(() => mainTimelineText(page), {
            timeout: remainingProviderQueueBudgetMs(
              gateStartedAt,
              startedRuns.indexOf(run),
              1,
            ),
          })
          .toContain(run.expectedPrefix);
        markFirstIncrementObserved(
          queueStageObservations,
          run.runId,
          gateStartedAt,
        );
      }
      const visibleText = await mainTimelineText(page);
      for (const other of startedRuns) {
        if (other.runId !== run.runId) {
          expect(visibleText).not.toContain(other.expectedPrefix);
        }
      }
    }

    await Promise.all(
      startedRuns.map((run) => waitForRunToLeaveActive(run, 180_000)),
    );
    for (const run of startedRuns) {
      await selectSession(page, run.title, failures);
      await expect
        .poll(() => mainTimelineText(page), { timeout: 45_000 })
        .toContain(run.expectedFinalToken);
      await expect
        .poll(() => messageArticleCount(page, run.expectedFinalToken))
        .toBe(1);
      const visibleText = await mainTimelineText(page);
      for (const other of startedRuns) {
        if (other.runId !== run.runId) {
          expect(visibleText).not.toContain(other.expectedPrefix);
        }
      }
    }

    await page.evaluate(() => {
      const probe = window.__managedRealConcurrencyProbe;
      if (probe !== undefined && performance.memory !== undefined) {
        probe.finalHeapBytes = performance.memory.usedJSHeapSize;
      }
    });
    const afterReloadProbe = await browserProbeSnapshot(page);
    const probe: BrowserProbeSnapshot = {
      currentEventSources: afterReloadProbe.currentEventSources,
      finalHeapBytes: afterReloadProbe.finalHeapBytes,
      initialHeapBytes: beforeReloadProbe.initialHeapBytes,
      interactionDurations: [
        ...beforeReloadProbe.interactionDurations,
        ...afterReloadProbe.interactionDurations,
      ],
      longTasks: [
        ...beforeReloadProbe.longTasks,
        ...afterReloadProbe.longTasks,
      ],
      peakEventSources: Math.max(
        beforeReloadProbe.peakEventSources,
        afterReloadProbe.peakEventSources,
      ),
    };
    const evidence = {
      concurrencyOverlapEvidence,
      edgeExecutable: EDGE_EXECUTABLE,
      elapsedMs: Date.now() - gateStartedAt,
      failures,
      heapGrowthBytes:
        probe.initialHeapBytes === null || probe.finalHeapBytes === null
          ? null
          : probe.finalHeapBytes - probe.initialHeapBytes,
      probe,
      queueStageObservations,
      sessionCount: SESSION_COUNT,
      subagentScrollGrowthEvidence,
      subagentFixtureEstimatedDurationMs:
        estimatedSubagentStreamDurationMs(subagentRun),
      streamHoldMs: STREAM_HOLD_MS,
    };
    const evidencePath = test
      .info()
      .outputPath("managed-real-concurrency-evidence.json");
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
    await test.info().attach("managed-real-concurrency-evidence", {
      contentType: "application/json",
      path: evidencePath,
    });
    await stableScreenshot(
      page,
      test.info().outputPath("managed-real-concurrency-final.jpg"),
    );

    expect.soft(probe.peakEventSources).toBeLessThanOrEqual(2);
    expect.soft(probe.currentEventSources).toBeLessThanOrEqual(1);
    expect.soft(probe.longTasks.length).toBeLessThanOrEqual(15);
    expect.soft(Math.max(0, ...probe.longTasks)).toBeLessThanOrEqual(250);
    expect
      .soft(probe.longTasks.reduce((sum, duration) => sum + duration, 0))
      .toBeLessThanOrEqual(1_000);
    expect
      .soft(percentile95(probe.interactionDurations))
      .toBeLessThanOrEqual(750);
    expect
      .soft(Math.max(0, ...probe.interactionDurations))
      .toBeLessThanOrEqual(1_500);
    expect.soft(probe.initialHeapBytes).not.toBeNull();
    expect.soft(probe.finalHeapBytes).not.toBeNull();
    if (probe.initialHeapBytes !== null && probe.finalHeapBytes !== null) {
      expect.soft(probe.finalHeapBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
      expect
        .soft(probe.finalHeapBytes - probe.initialHeapBytes)
        .toBeLessThanOrEqual(64 * 1024 * 1024);
    }

    expect.soft(failures.crashes).toEqual([]);
    expect.soft(failures.pageErrors).toEqual([]);
    expect.soft(failures.consoleErrors).toEqual([]);
    expect.soft(failures.httpFailures).toEqual([]);
    expect.soft(failures.networkFailures).toEqual([]);
  } finally {
    await Promise.all(startedRuns.map((run) => stopRun(run.runId)));
    await Promise.all(
      sessions.map((session) => deleteSession(session.session_id)),
    );
  }
});

declare global {
  interface Performance {
    memory?: { usedJSHeapSize: number };
  }

  interface Window {
    __managedRealConcurrencyProbe?: {
      currentEventSources: number;
      finalHeapBytes: number | null;
      initialHeapBytes: number | null;
      interactionDurations: number[];
      longTasks: number[];
      peakEventSources: number;
    };
  }
}

function installFailureCollection(page: Page): FailureCollection {
  let expectedEventAbortWindowDepth = 0;
  const failures = {
    beginExpectedEventAbortWindow: () => {
      expectedEventAbortWindowDepth += 1;
    },
    consoleErrors: [] as string[],
    crashes: [] as string[],
    endExpectedEventAbortWindow: () => {
      expectedEventAbortWindowDepth = Math.max(
        0,
        expectedEventAbortWindowDepth - 1,
      );
    },
    httpFailures: [] as string[],
    networkFailures: [] as string[],
    pageErrors: [] as string[],
  };
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      failures.consoleErrors.push(
        `${message.text()} (${location.url || "unknown"}:${location.lineNumber ?? 0})`,
      );
    }
  });
  page.on("crash", () => failures.crashes.push("page crashed"));
  page.on("pageerror", (error) => failures.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (
      expectedEventAbortWindowDepth > 0 &&
      request.url().includes("/events") &&
      errorText.includes("ERR_ABORTED")
    ) {
      return;
    }
    failures.networkFailures.push(
      `${request.method()} ${request.url()} ${errorText}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.httpFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  return failures;
}

async function installBrowserProbe(
  page: Page,
  initialSession: SessionRecord | undefined,
): Promise<void> {
  if (initialSession === undefined) {
    throw new Error("Expected at least one managed session.");
  }
  await page.addInitScript(
    ({ sessionId, workspaceId }) => {
      const probe = {
        currentEventSources: 0,
        finalHeapBytes: null,
        initialHeapBytes: null,
        interactionDurations: [] as number[],
        longTasks: [] as number[],
        peakEventSources: 0,
      };
      window.__managedRealConcurrencyProbe = probe;
      const NativeEventSource = window.EventSource;
      window.EventSource = new Proxy(NativeEventSource, {
        construct(target, args, newTarget) {
          const source = Reflect.construct(
            target,
            args,
            newTarget,
          ) as EventSource;
          probe.currentEventSources += 1;
          probe.peakEventSources = Math.max(
            probe.peakEventSources,
            probe.currentEventSources,
          );
          let closed = false;
          const nativeClose = source.close.bind(source);
          source.close = () => {
            if (!closed) {
              closed = true;
              probe.currentEventSources -= 1;
            }
            nativeClose();
          };
          return source;
        },
      });
      if ("PerformanceObserver" in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              probe.longTasks.push(entry.duration);
            }
          });
          observer.observe({ entryTypes: ["longtask"] });
        } catch {
          // A missing long-task entry type is represented by an empty sample set.
        }
      }
      const seedLocalStorage = (key: string, value: string) => {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, value);
        }
      };
      seedLocalStorage("agentTeams.language", "zh");
      seedLocalStorage("agentTeams.themeMode", "light");
      seedLocalStorage("agent_teams_theme", "light");
      seedLocalStorage("agentTeams.selectedSessionId", sessionId);
      seedLocalStorage("agentTeams.selectedWorkspaceId", workspaceId);
      seedLocalStorage("agentTeams.shellView", "chat");
    },
    {
      sessionId: initialSession.session_id,
      workspaceId: initialSession.workspace_id ?? "default",
    },
  );
}

async function expectShellReady(page: Page): Promise<void> {
  await waitForAppShell(page);
  await expect(page.locator(".at-chat-view")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /提示词|Prompt/ }),
  ).toBeEnabled();
}

async function verifyRunningSubagent(
  page: Page,
  failures: FailureCollection,
  run: StartedRun,
  startedRuns: StartedRun[],
  gateStartedAt: number,
  initialNormalParentObservedAtMs: number,
  initialNormalParentRunIds: string[],
): Promise<RunningSubagentVerification> {
  expect(
    estimatedSubagentStreamDurationMs(run),
    "the deterministic subagent stream must cover running panel interactions",
  ).toBeGreaterThan(30_000);
  await selectSession(page, run.title, failures);
  const card = page
    .locator(".at-chat-view .at-message-tool.is-openable-subagent")
    .first();
  await expect
    .poll(() => card.count(), {
      timeout: remainingProviderQueueBudgetMs(
        gateStartedAt,
        startedRuns.length - 1,
        1,
      ),
    })
    .toBeGreaterThan(0);
  const cardObservedAtMs = Date.now() - gateStartedAt;
  await expandProcessedGroupsUntilCardIsVisible(page, card);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toHaveAttribute("data-status", "completed");
  await recordInteraction(page, () => card.click());
  const panel = page.locator(".at-subagent-session-view");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        panel.locator(".at-subagent-session-badge").getAttribute("data-status"),
      { timeout: 20_000 },
    )
    .toBe("running");
  const normalRuns = startedRuns.filter((candidate) => !candidate.isSubagent);
  await expect
    .poll(
      async () =>
        (
          await Promise.all(
            normalRuns.map((candidate) =>
              activeRunId(candidate.session.session_id),
            ),
          )
        ).filter((runId): runId is string => runId !== null).length,
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
  const normalParentRunIdsAtChildRunning = (
    await Promise.all(
      normalRuns.map((candidate) => activeRunId(candidate.session.session_id)),
    )
  ).filter((runId): runId is string => runId !== null);
  const concurrencyOverlap: ConcurrencyOverlapEvidence = {
    childBadgeStatus: "running",
    childRunningObservedAtMs: Date.now() - gateStartedAt,
    initialNormalParentActiveCount: initialNormalParentRunIds.length,
    initialNormalParentObservedAtMs,
    initialNormalParentRunIds,
    normalParentActiveCountAtChildRunning:
      normalParentRunIdsAtChildRunning.length,
    normalParentRunIdsAtChildRunning,
  };
  await expect(panel.locator(".at-subagent-session-prompt")).toContainText(
    run.tag,
  );
  const timeline = panel.locator(
    ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
  );
  await expect
    .poll(() => latestSubagentPanelRuntimeText(panel), {
      timeout: remainingProviderQueueBudgetMs(
        gateStartedAt,
        startedRuns.length - 1,
        SUBAGENT_PROVIDER_CALL_COUNT,
      ),
    })
    .toContain(run.expectedPrefix);
  const firstIncrementObservedAtMs = Date.now() - gateStartedAt;
  await expect
    .poll(() => highestSubagentTokenIndex(panel, run), { timeout: 45_000 })
    .toBeGreaterThanOrEqual(23);
  const firstSampleTokenIndex = await highestSubagentTokenIndex(panel, run);
  expect(
    firstSampleTokenIndex,
    "the first sample must leave 24 growth tokens plus half the stream",
  ).toBeLessThanOrEqual(SUBAGENT_TOKEN_COUNT / 2 - 25);
  const firstSampleHeight = await timeline.evaluate(
    (element) => element.scrollHeight,
  );
  await expect
    .poll(() => highestSubagentTokenIndex(panel, run), { timeout: 45_000 })
    .toBeGreaterThanOrEqual(firstSampleTokenIndex + 24);
  const secondSampleTokenIndex = await highestSubagentTokenIndex(panel, run);
  const secondSampleHeight = await timeline.evaluate(
    (element) => element.scrollHeight,
  );
  expect(secondSampleTokenIndex).toBeGreaterThanOrEqual(
    firstSampleTokenIndex + 24,
  );
  expect(
    secondSampleHeight,
    "visible subagent scrollHeight must grow across 24 additional tokens",
  ).toBeGreaterThan(firstSampleHeight);
  await expect
    .poll(
      () =>
        timeline.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      { timeout: 45_000 },
    )
    .toBeGreaterThan(200);
  const tokenIndexAtOverflow = await highestSubagentTokenIndex(panel, run);
  expect(
    tokenIndexAtOverflow,
    "the subagent fixture must retain at least half its tokens after overflow begins",
  ).toBeLessThanOrEqual(SUBAGENT_TOKEN_COUNT / 2 - 1);
  const scrollGrowth: SubagentScrollGrowthEvidence = {
    cardObservedAtMs,
    cardObservedProviderWave: Math.ceil(
      cardObservedAtMs / SLOW_PROVIDER_CALL_BUDGET_MS,
    ),
    firstSampleHeight,
    firstSampleTokenIndex,
    overflowHeight: await timeline.evaluate((element) => element.scrollHeight),
    secondSampleHeight,
    secondSampleTokenIndex,
    tokenIndexAtOverflow,
  };
  expect(
    estimatedRemainingSubagentStreamMs(run, tokenIndexAtOverflow),
    "the running subagent must retain enough fixture time for wheel and growth",
  ).toBeGreaterThan(5_000);
  await timeline.hover();
  await recordInteraction(page, () => page.mouse.wheel(0, -700));
  const away = await timelineMetrics(timeline);
  expect(away.distanceFromBottom).toBeGreaterThan(100);
  await expect
    .poll(() => highestSubagentTokenIndex(panel, run), { timeout: 45_000 })
    .toBeGreaterThan(tokenIndexAtOverflow);
  const afterGrowth = await timelineMetrics(timeline);
  expect(afterGrowth.distanceFromBottom).toBeGreaterThan(80);
  expect(afterGrowth.scrollTop).toBeLessThanOrEqual(away.scrollTop + 24);
  await stableScreenshot(
    page,
    test.info().outputPath("managed-real-concurrency-running-subagent.jpg"),
  );
  await withExpectedEventAbortWindow(failures, () =>
    recordInteraction(page, () =>
      page.getByRole("button", { name: /主会话|Main session/ }).click(),
    ),
  );
  await expect(panel).toBeHidden();
  await expandProcessedGroupsUntilCardIsVisible(page, card);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await recordInteraction(page, () => card.click({ timeout: 20_000 }));
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".at-subagent-session-prompt")).toContainText(
    run.tag,
  );
  await expect
    .poll(() => highestSubagentTokenIndex(panel, run))
    .toBeGreaterThanOrEqual(tokenIndexAtOverflow);
  await withExpectedEventAbortWindow(failures, () =>
    recordInteraction(page, () =>
      page.getByRole("button", { name: /主会话|Main session/ }).click(),
    ),
  );
  return { concurrencyOverlap, firstIncrementObservedAtMs, scrollGrowth };
}

async function selectSession(
  page: Page,
  title: string,
  failures: FailureCollection,
): Promise<void> {
  const item = page
    .locator(".at-session-item")
    .filter({ hasText: title })
    .first();
  for (
    let pageIndex = 0;
    pageIndex < 4 && (await item.count()) === 0;
    pageIndex += 1
  ) {
    const showMore = page.locator(".at-workspace-group-more").first();
    if ((await showMore.count()) === 0) {
      break;
    }
    await showMore.click();
  }
  await expect(item).toBeVisible({ timeout: 30_000 });
  await withExpectedEventAbortWindow(failures, () =>
    recordInteraction(page, async () => {
      await item.click();
      await expect(page.locator(".at-session-item.is-selected")).toContainText(
        title,
      );
    }),
  );
}

async function expandProcessedGroupsUntilCardIsVisible(
  page: Page,
  card: Locator,
): Promise<void> {
  const closedGroups = page.locator(
    "details.at-processed-group:not([open]) > .at-processed-group-summary",
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await card.isVisible()) {
      return;
    }
    const groupCount = await closedGroups.count();
    for (let index = 0; index < groupCount; index += 1) {
      const summary = closedGroups.nth(index);
      if (await summary.isVisible()) {
        await recordInteraction(page, () => summary.click());
        break;
      }
    }
    await page.waitForTimeout(100);
  }
}

async function withExpectedEventAbortWindow<T>(
  failures: FailureCollection,
  action: () => Promise<T>,
): Promise<T> {
  failures.beginExpectedEventAbortWindow();
  try {
    return await action();
  } finally {
    failures.endExpectedEventAbortWindow();
  }
}

async function recordInteraction<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await action();
  } finally {
    const duration = performance.now() - startedAt;
    await page.evaluate((value) => {
      window.__managedRealConcurrencyProbe?.interactionDurations.push(value);
    }, duration);
  }
}

async function timelineMetrics(timeline: ReturnType<Page["locator"]>): Promise<{
  distanceFromBottom: number;
  scrollTop: number;
}> {
  return timeline.evaluate((element) => ({
    distanceFromBottom: Math.round(
      element.scrollHeight - element.clientHeight - element.scrollTop,
    ),
    scrollTop: Math.round(element.scrollTop),
  }));
}

async function browserProbeSnapshot(page: Page): Promise<BrowserProbeSnapshot> {
  return page.evaluate(() => {
    const probe = window.__managedRealConcurrencyProbe;
    if (probe === undefined) {
      throw new Error("Managed real concurrency probe was not installed.");
    }
    return {
      currentEventSources: probe.currentEventSources,
      finalHeapBytes: probe.finalHeapBytes,
      initialHeapBytes: probe.initialHeapBytes,
      interactionDurations: [...probe.interactionDurations],
      longTasks: [...probe.longTasks],
      peakEventSources: probe.peakEventSources,
    };
  });
}

async function stableScreenshot(page: Page, path: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePaint) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolvePaint()),
        );
      }),
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path,
    quality: 82,
    type: "jpeg",
  });
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

async function mainTimelineText(page: Page): Promise<string> {
  return page
    .locator(".at-chat-view article.at-message")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? "").join("\n"),
    );
}

async function persistedUserPromptText(page: Page): Promise<string> {
  return page
    .locator(
      '.at-chat-view .at-round-marker, .at-chat-view article.at-message[data-role-id="user"]',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? "").join("\n"),
    );
}

async function messageArticleCount(page: Page, text: string): Promise<number> {
  return page
    .locator(".at-chat-view article.at-message")
    .filter({ hasText: text })
    .count();
}

async function highestSlowStreamTokenIndex(
  page: Page,
  run: StartedRun,
): Promise<number> {
  const text = await mainTimelineText(page);
  let highest = -1;
  for (let index = 0; index < run.slowTokenCount; index += 1) {
    if (text.includes(slowStreamToken(run.tag, index))) {
      highest = index;
    }
  }
  return highest;
}

async function latestSubagentPanelRuntimeText(panel: Locator): Promise<string> {
  return panel
    .locator(
      ".at-message-streaming-text, .at-message-plain-stream, article.at-message",
    )
    .evaluateAll((nodes) => {
      const visibleTexts = nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((candidate) => candidate.length > 0);
      return visibleTexts.at(-1) ?? "";
    });
}

async function highestSubagentTokenIndex(
  panel: Locator,
  run: StartedRun,
): Promise<number> {
  const text = await latestSubagentPanelRuntimeText(panel);
  let highest = -1;
  for (let index = 0; index < SUBAGENT_TOKEN_COUNT; index += 1) {
    if (text.includes(subagentStreamToken(run.tag, index))) {
      highest = index;
    }
  }
  return highest;
}

function estimatedSubagentStreamDurationMs(run: StartedRun): number {
  const tokens = Array.from({ length: SUBAGENT_TOKEN_COUNT }, (_, index) =>
    subagentStreamToken(run.tag, index),
  );
  const content = formatSubagentStreamTokens(tokens);
  return (
    Math.ceil(content.length / SUBAGENT_CHUNK_SIZE) * SUBAGENT_CHUNK_DELAY_MS
  );
}

function estimatedRemainingSubagentStreamMs(
  run: StartedRun,
  highestObservedIndex: number,
): number {
  const tokens = Array.from(
    { length: SUBAGENT_TOKEN_COUNT - highestObservedIndex - 1 },
    (_, offset) =>
      subagentStreamToken(run.tag, highestObservedIndex + offset + 1),
  );
  const content = formatSubagentStreamTokens(tokens);
  return (
    Math.ceil(content.length / SUBAGENT_CHUNK_SIZE) * SUBAGENT_CHUNK_DELAY_MS
  );
}

function formatSubagentStreamTokens(tokens: string[]): string {
  const groups: string[] = [];
  for (let index = 0; index < tokens.length; index += SUBAGENT_LINE_EVERY) {
    groups.push(tokens.slice(index, index + SUBAGENT_LINE_EVERY).join(" "));
  }
  return groups.join("\n\n");
}

function subagentStreamToken(tag: string, index: number): string {
  return `SUBAGENT_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function providerQueueUpperBoundMs(
  runIndex: number,
  providerCallCount: number,
): number {
  const lastProviderCallIndex = runIndex + providerCallCount - 1;
  const providerWaveCount =
    Math.floor(lastProviderCallIndex / PROVIDER_SLOT_COUNT) + 1;
  return providerWaveCount * SLOW_PROVIDER_CALL_BUDGET_MS;
}

function remainingProviderQueueBudgetMs(
  gateStartedAt: number,
  runIndex: number,
  providerCallCount: number,
): number {
  const elapsedMs = Date.now() - gateStartedAt;
  return Math.max(
    45_000,
    providerQueueUpperBoundMs(runIndex, providerCallCount) - elapsedMs + 15_000,
  );
}

function markFirstIncrementObserved(
  observations: QueueStageObservation[],
  runId: string,
  gateStartedAt: number,
): void {
  const observation = observations.find(
    (candidate) => candidate.runId === runId,
  );
  if (
    observation !== undefined &&
    observation.firstIncrementObservedAtMs === null
  ) {
    observation.firstIncrementObservedAtMs = Date.now() - gateStartedAt;
  }
}

function waitForRunCreateResponse(page: Page): Promise<RunCreateResponse> {
  return page
    .waitForResponse(
      (response) =>
        response.url() === `${apiBaseUrl()}/api/ag-ui/runs` &&
        response.request().method() === "POST" &&
        response.ok(),
    )
    .then((response) => response.json() as Promise<RunCreateResponse>);
}

async function runIdFromResponse(response: RunCreateResponse): Promise<string> {
  const runId = response.run_id?.trim() ?? "";
  expect(runId.length).toBeGreaterThan(0);
  return runId;
}

async function waitForRunToLeaveActive(
  run: StartedRun,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const sessions = await fetchJson<SessionRecord[]>(
          "/api/sessions?workspace_id=default",
        );
        const session = sessions.find(
          (item) => item.session_id === run.session.session_id,
        );
        if (session?.active_run_id === run.runId) {
          return "active";
        }
        if (session?.latest_terminal_run_id === run.runId) {
          return session.latest_terminal_run_status ?? "terminal";
        }
        return "unknown";
      },
      { timeout: timeoutMs },
    )
    .not.toBe("active");
}

async function activeRunId(sessionId: string): Promise<string | null> {
  const sessions = await fetchJson<SessionRecord[]>(
    "/api/sessions?workspace_id=default",
  );
  return (
    sessions.find((item) => item.session_id === sessionId)?.active_run_id ??
    null
  );
}

async function createSession(title: string): Promise<SessionRecord> {
  return fetchJson<SessionRecord>("/api/sessions", {
    body: JSON.stringify({ metadata: { title }, workspace_id: "default" }),
    method: "POST",
  });
}

async function stopRun(runId: string): Promise<void> {
  await fetchJson<Record<string, unknown>>(
    `/api/ag-ui/runs/${encodeURIComponent(runId)}:stop`,
    { body: JSON.stringify({ scope: "main" }), method: "POST" },
  ).catch(() => null);
}

async function deleteSession(sessionId: string): Promise<void> {
  await fetchJson<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    {
      body: JSON.stringify({ cascade: true, force: true }),
      method: "DELETE",
    },
  ).catch(() => null);
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function slowStreamToken(tag: string, index: number): string {
  return `SLOW_STREAM_${tag}_${String(index).padStart(2, "0")}`;
}

function boundedSessionCount(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "8");
  if (!Number.isInteger(parsed)) {
    return 8;
  }
  return Math.min(12, Math.max(8, parsed));
}

function boundedStreamHoldMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "0");
  if (!Number.isInteger(parsed)) {
    return 0;
  }
  return Math.min(15_000, Math.max(0, parsed));
}

function apiBaseUrl(): string {
  return managedBackend.apiBaseUrl;
}
