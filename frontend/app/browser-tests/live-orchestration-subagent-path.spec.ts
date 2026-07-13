import { writeFile } from "node:fs/promises";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  ensureScreenshotDir,
  screenshotPath,
  waitForAppShell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "live-orchestration-subagent-path";
const liveBaseUrl = process.env.LIVE_BASE_URL?.replace(/\/$/, "") ?? "";
const liveSessionId = process.env.LIVE_SESSION_ID?.trim() ?? "";
const liveWorkspaceId = process.env.LIVE_WORKSPACE_ID?.trim() || "default";
const liveSubagentTitle = process.env.LIVE_SUBAGENT_TITLE?.trim() ?? "";
const configuredInstanceId =
  process.env.LIVE_SUBAGENT_INSTANCE_ID?.trim() ?? "";
const configuredTaskId = process.env.LIVE_SUBAGENT_TASK_ID?.trim() ?? "";
const terminalTimeoutMs = positiveEnvironmentNumber(
  "LIVE_TERMINAL_TIMEOUT_MS",
  10 * 60_000,
);

interface LiveAcceptanceWindow extends Window {
  __agentTeamsActiveEventSources?: number;
  __agentTeamsLongTaskObserver?: PerformanceObserver;
  __agentTeamsLongTasks?: LongTaskSample[];
  __agentTeamsMaxEventSources?: number;
}

interface LongTaskSample {
  duration: number;
  startTime: number;
}

interface SessionRecord {
  active_run_id?: string | null;
  latest_terminal_run_id?: string | null;
  latest_terminal_run_status?: string | null;
  session_id: string;
}

interface SessionSubagentRecord {
  instance_id?: string;
  role_id?: string;
  run_id?: string;
  status?: string;
  subagent_instance_id?: string;
  subagent_kind?: string;
  subagent_run_id?: string;
  title?: string;
}

interface TimelineMessageRecord {
  content?: unknown;
  instance_id?: string;
  message?: {
    content?: unknown;
    parts?: unknown[];
  };
  parts?: unknown[];
  role?: string;
  task_id?: string;
}

interface SubagentIdentity {
  instanceId: string;
  parentRunId: string;
  taskId: string;
  title: string;
}

interface ActionMetric {
  durationMs: number;
  label: string;
}

test.setTimeout(terminalTimeoutMs + 120_000);

test("operates one live orchestration child without freezing or leaking sibling output", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    liveBaseUrl.length === 0 ||
      liveSessionId.length === 0 ||
      liveSubagentTitle.length === 0,
    "Set LIVE_BASE_URL, LIVE_SESSION_ID, and LIVE_SUBAGENT_TITLE to run this live acceptance.",
  );
  assertLocalDeployment(liveBaseUrl);

  const actionMetrics: ActionMetric[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  const panelAgentMessageInstanceIds = new Set<string>();
  const pageErrors: string[] = [];
  let pageCrashed = false;
  page.on("crash", () => {
    pageCrashed = true;
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("request", (requestRecord) => {
    const instanceId = agentMessageInstanceId(requestRecord.url());
    if (instanceId !== null) {
      panelAgentMessageInstanceIds.add(instanceId);
    }
  });

  await ensureScreenshotDir(SCREENSHOT_FOLDER);
  await installEventSourceProbe(page);
  await installLiveSessionState(page);
  await page.goto(`${liveBaseUrl}/?live_orchestration_subagent_path=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForAppShell(page);
  await resetLongTaskObserver(page);
  await expectResponsive(page, "initial live orchestration session");

  const activeSession = await readSession(request);
  const parentRunId = activeSession.active_run_id?.trim() ?? "";
  expect(
    parentRunId,
    "The live fixture must still have an active parent run when the browser test starts.",
  ).not.toBe("");
  const records = await waitForOrchestrationSiblings(request, parentRunId);
  const selectedRecord = selectSubagentRecord(records, parentRunId);
  const recordInstanceId = subagentInstanceId(selectedRecord);
  expect(recordInstanceId).not.toBe("");
  const siblingRecord = selectSiblingRecord(
    records,
    parentRunId,
    recordInstanceId,
  );
  const siblingRecordInstanceId = subagentInstanceId(siblingRecord);

  const selectedCard = await waitForSelectedSubagentCard(
    page,
    parentRunId,
    recordInstanceId,
  );
  const selectedIdentity = await cardIdentity(selectedCard);
  expect(selectedIdentity.parentRunId).toBe(parentRunId);
  expect(selectedIdentity.instanceId).toBe(recordInstanceId);
  if (configuredTaskId.length > 0) {
    expect(selectedIdentity.taskId).toBe(configuredTaskId);
  }
  expect(
    selectedIdentity.taskId,
    "The live tool card must carry the orchestration task_id used to scope replay.",
  ).not.toBe("");
  await expectSubagentStillNonTerminal(request, selectedIdentity);

  const siblingCard = await waitForSiblingCard(
    page,
    selectedIdentity.parentRunId,
    siblingRecordInstanceId,
  );
  const siblingIdentity = await cardIdentity(siblingCard);
  expect(siblingIdentity.parentRunId).toBe(parentRunId);
  expect(siblingIdentity.instanceId).not.toBe(selectedIdentity.instanceId);
  expect(siblingIdentity.taskId).not.toBe("");

  await measuredAction(actionMetrics, "open-running-child", async () => {
    await selectedCard.locator(".at-message-tool-summary").click();
    await expect(page.locator(".at-subagent-session-view")).toBeVisible();
  });
  await expectResponsive(page, "open running child panel");

  const panel = page.locator(".at-subagent-session-view");
  const prompt = panel.locator(".at-subagent-session-prompt");
  const timeline = panel.locator(
    ".at-subagent-session-body > .at-timeline-frame > .at-timeline",
  );
  await expect(prompt).toBeVisible();
  await expect(timeline).toBeVisible();
  await expectScrollable(prompt, "live orchestration child prompt");
  await expectScrollable(timeline, "live orchestration child timeline");

  await measuredAction(actionMetrics, "scroll-running-prompt", async () => {
    await wheelRoundTrip(page, prompt);
  });
  await measuredAction(actionMetrics, "scroll-running-timeline", async () => {
    await wheelRoundTrip(page, timeline);
  });
  await expectResponsive(page, "scroll running child panel");
  const runningMessages = messagesForTask(
    await readAgentMessages(request, selectedIdentity.instanceId),
    selectedIdentity.taskId,
  );
  const runningToolMarker = optionalUniqueToolOutputMarker(runningMessages);
  if (runningToolMarker !== null) {
    expect(normalizeForContainment(await mainTimelineText(page)))
      .not.toContain(runningToolMarker);
  }
  await captureStableScreenshot(page, "01-running-child-scrolled.jpg");

  await measuredAction(actionMetrics, "back-to-main", async () => {
    await closeSubagentPanel(panel);
  });
  await expectResponsive(page, "return to main session");
  await measuredAction(actionMetrics, "switch-session-round-trip", async () => {
    await switchAwayAndBack(page);
  });
  await expectResponsive(page, "switch session and return");

  const cardAfterSwitch = await waitForSelectedSubagentCard(
    page,
    parentRunId,
    selectedIdentity.instanceId,
    selectedIdentity.taskId,
  );
  await measuredAction(actionMetrics, "reopen-running-child", async () => {
    await cardAfterSwitch.locator(".at-message-tool-summary").click();
    await expect(panel).toBeVisible();
  });
  await expectResponsive(page, "reopen child after session switch");
  await expect(panel.locator(".at-subagent-session-prompt")).toBeVisible();
  await closeSubagentPanel(panel);

  await waitForTerminalReplay(request, page, selectedIdentity);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppShell(page);
  await expectResponsive(page, "terminal replay reload");

  const terminalCard = await waitForSelectedSubagentCard(
    page,
    parentRunId,
    selectedIdentity.instanceId,
    selectedIdentity.taskId,
  );
  await measuredAction(actionMetrics, "open-terminal-replay", async () => {
    await terminalCard.locator(".at-message-tool-summary").click();
    await expect(panel).toBeVisible();
  });
  await expectResponsive(page, "open terminal child replay");

  const selectedMessages = await readAgentMessages(
    request,
    selectedIdentity.instanceId,
  );
  const siblingMessages = await readAgentMessages(
    request,
    siblingIdentity.instanceId,
  );
  const selectedTaskMessages = messagesForTask(
    selectedMessages,
    selectedIdentity.taskId,
  );
  const selectedInstanceOtherTaskMessages = messagesForOtherTasks(
    selectedMessages,
    selectedIdentity.taskId,
  );
  const siblingTaskMessages = messagesForTask(
    siblingMessages,
    siblingIdentity.taskId,
  );
  expect(selectedTaskMessages.length).toBeGreaterThan(0);
  expect(
    selectedInstanceOtherTaskMessages.length,
    "The selected instance must have another task so task_id isolation is exercised.",
  ).toBeGreaterThan(0);
  expect(siblingTaskMessages.length).toBeGreaterThan(0);
  expect(selectedTaskMessages.every((message) =>
    message.instance_id?.trim() === selectedIdentity.instanceId
  )).toBe(true);
  expect(siblingTaskMessages.every((message) =>
    message.instance_id?.trim() === siblingIdentity.instanceId
  )).toBe(true);
  const selectedAllText = normalizedMessageText(selectedTaskMessages);
  const siblingAllText = normalizedMessageText(siblingTaskMessages);
  const selectedNonToolText = normalizedNonToolText(selectedTaskMessages);
  const selectedToolMarker = uniqueToolOutputMarker(
    selectedTaskMessages,
    `${siblingAllText} ${selectedNonToolText}`,
  );
  const siblingMarker = uniqueMessageMarker(
    siblingTaskMessages,
    selectedAllText,
  );
  const sameInstanceOtherTaskMarker = uniqueMessageMarker(
    selectedInstanceOtherTaskMessages,
    selectedAllText,
  );

  const panelReplayText = await scanScrollableText(panel, timeline);
  expect(panelReplayText).toContain(selectedToolMarker);
  expect(panelReplayText).not.toContain(siblingMarker);
  expect(panelReplayText).not.toContain(sameInstanceOtherTaskMarker);
  await captureStableScreenshot(page, "02-terminal-child-replay.jpg");
  await closeSubagentPanel(panel);

  const mainReplayText = await scanMainTimelineText(page);
  expect(
    mainReplayText,
    "Child tool/stdout content must remain inside the selected child panel.",
  ).not.toContain(selectedToolMarker);
  expect(mainReplayText).not.toContain(siblingMarker);
  expect([...panelAgentMessageInstanceIds]).toEqual([
    selectedIdentity.instanceId,
  ]);
  await expect(page.locator(".streaming-cursor")).toHaveCount(0);
  await expectResponsive(page, "terminal main-session replay");

  const eventSourceCounts = await page.evaluate(() => ({
    active: (window as LiveAcceptanceWindow).__agentTeamsActiveEventSources ?? 0,
    max: (window as LiveAcceptanceWindow).__agentTeamsMaxEventSources ?? 0,
  }));
  const longTasks = await readLongTasks(page);
  const unexpectedFailedResponses = failedResponses.filter(
    (response) => !response.endsWith("/favicon.ico"),
  );
  const unexpectedConsoleErrors = consoleErrors.filter((message) =>
    message !== "Failed to load resource: the server responded with a status of 404 (Not Found)" ||
    unexpectedFailedResponses.length > 0
  );
  const metrics = {
    actionMetrics,
    consoleErrors,
    eventSourceCounts,
    failedResponses,
    longTaskCount: longTasks.length,
    maxLongTaskMs: Math.max(0, ...longTasks.map((task) => task.duration)),
    pageCrashed,
    pageErrors,
    panelAgentMessageInstanceIds: [...panelAgentMessageInstanceIds],
    selectedIdentity,
    siblingIdentity,
    totalLongTaskMs: longTasks.reduce(
      (total, task) => total + task.duration,
      0,
    ),
    unexpectedConsoleErrors,
    unexpectedFailedResponses,
  };
  const metricsPath = testInfo.outputPath(
    "live-orchestration-subagent-path-metrics.json",
  );
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await testInfo.attach("live-orchestration-subagent-path-metrics", {
    contentType: "application/json",
    path: metricsPath,
  });

  expect(actionDuration(actionMetrics, "open-running-child")).toBeLessThan(1_500);
  expect(actionDuration(actionMetrics, "scroll-running-prompt")).toBeLessThan(500);
  expect(actionDuration(actionMetrics, "scroll-running-timeline")).toBeLessThan(500);
  expect(actionDuration(actionMetrics, "back-to-main")).toBeLessThan(750);
  expect(actionDuration(actionMetrics, "switch-session-round-trip")).toBeLessThan(1_500);
  expect(actionDuration(actionMetrics, "reopen-running-child")).toBeLessThan(1_500);
  expect(actionDuration(actionMetrics, "open-terminal-replay")).toBeLessThan(1_500);
  expect(metrics.maxLongTaskMs).toBeLessThan(300);
  expect(metrics.totalLongTaskMs).toBeLessThan(2_000);
  expect(eventSourceCounts.max).toBeLessThanOrEqual(2);
  expect(eventSourceCounts.active).toBeLessThanOrEqual(1);
  expect(unexpectedFailedResponses).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(pageCrashed).toBe(false);
});

function assertLocalDeployment(baseUrl: string): void {
  const hostname = new URL(baseUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`LIVE_BASE_URL must target localhost, received ${hostname}`);
  }
}

function positiveEnvironmentNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function installLiveSessionState(page: Page): Promise<void> {
  await page.addInitScript(({ sessionId, workspaceId }) => {
    window.localStorage.setItem("agentTeams.language", "zh");
    window.localStorage.setItem("agentTeams.themeMode", "light");
    window.localStorage.setItem("agent_teams_theme", "light");
    window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
    window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    window.localStorage.setItem("agentTeams.shellView", "chat");
    window.localStorage.setItem("agentTeams.subagentPanelWidth", "760");
    window.localStorage.removeItem("agentTeams.activeSubagentPanel");
  }, { sessionId: liveSessionId, workspaceId: liveWorkspaceId });
}

async function installEventSourceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    const NativeEventSource = window.EventSource;
    acceptanceWindow.__agentTeamsActiveEventSources = 0;
    acceptanceWindow.__agentTeamsMaxEventSources = 0;
    class TrackedEventSource extends NativeEventSource {
      private acceptanceClosed = false;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        acceptanceWindow.__agentTeamsActiveEventSources =
          (acceptanceWindow.__agentTeamsActiveEventSources ?? 0) + 1;
        acceptanceWindow.__agentTeamsMaxEventSources = Math.max(
          acceptanceWindow.__agentTeamsMaxEventSources ?? 0,
          acceptanceWindow.__agentTeamsActiveEventSources,
        );
      }

      override close(): void {
        if (!this.acceptanceClosed) {
          this.acceptanceClosed = true;
          acceptanceWindow.__agentTeamsActiveEventSources = Math.max(
            0,
            (acceptanceWindow.__agentTeamsActiveEventSources ?? 0) - 1,
          );
        }
        super.close();
      }
    }
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: TrackedEventSource,
      writable: true,
    });
  });
}

async function resetLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    acceptanceWindow.__agentTeamsLongTasks = [];
    acceptanceWindow.__agentTeamsLongTaskObserver?.disconnect();
    const observer = new PerformanceObserver((list) => {
      acceptanceWindow.__agentTeamsLongTasks?.push(
        ...list.getEntries().map((entry) => ({
          duration: entry.duration,
          startTime: entry.startTime,
        })),
      );
    });
    observer.observe({ entryTypes: ["longtask"] });
    acceptanceWindow.__agentTeamsLongTaskObserver = observer;
  });
}

async function readLongTasks(page: Page): Promise<LongTaskSample[]> {
  return page.evaluate(() => {
    const acceptanceWindow = window as LiveAcceptanceWindow;
    acceptanceWindow.__agentTeamsLongTaskObserver?.disconnect();
    return acceptanceWindow.__agentTeamsLongTasks ?? [];
  });
}

async function readSession(request: APIRequestContext): Promise<SessionRecord> {
  return readLiveJson<SessionRecord>(
    request,
    `/api/sessions/${encodeURIComponent(liveSessionId)}`,
  );
}

async function readSubagents(
  request: APIRequestContext,
): Promise<SessionSubagentRecord[]> {
  return readLiveJson<SessionSubagentRecord[]>(
    request,
    `/api/sessions/${encodeURIComponent(liveSessionId)}/subagents?force_refresh=true`,
  );
}

async function readAgentMessages(
  request: APIRequestContext,
  instanceId: string,
): Promise<TimelineMessageRecord[]> {
  return readLiveJson<TimelineMessageRecord[]>(
    request,
    `/api/sessions/${encodeURIComponent(liveSessionId)}/agents/${encodeURIComponent(instanceId)}/messages`,
  );
}

async function readLiveJson<T>(
  request: APIRequestContext,
  path: string,
): Promise<T> {
  const response = await request.get(`${liveBaseUrl}${path}`);
  expect(response.ok(), `${response.status()} ${response.url()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function waitForOrchestrationSiblings(
  request: APIRequestContext,
  parentRunId: string,
): Promise<SessionSubagentRecord[]> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const records = await readSubagents(request);
    const sameParent = records.filter((record) =>
      subagentRunId(record) === parentRunId &&
      record.subagent_kind?.trim().toLowerCase() === "orchestration"
    );
    if (sameParent.length >= 2) {
      return sameParent;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `The live fixture did not expose two orchestration children for parent run ${parentRunId}.`,
  );
}

function selectSubagentRecord(
  records: SessionSubagentRecord[],
  parentRunId: string,
): SessionSubagentRecord {
  const matches = records.filter((record) => {
    const titleMatches = record.title?.trim() === liveSubagentTitle ||
      record.role_id?.trim() === liveSubagentTitle;
    const instanceMatches = configuredInstanceId.length === 0 ||
      subagentInstanceId(record) === configuredInstanceId;
    return subagentRunId(record) === parentRunId && titleMatches && instanceMatches;
  });
  expect(
    matches.length,
    "LIVE_SUBAGENT_TITLE (and optional LIVE_SUBAGENT_INSTANCE_ID) must identify exactly one child.",
  ).toBe(1);
  const selected = matches[0];
  if (selected === undefined) {
    throw new Error("The selected live subagent record is missing.");
  }
  return selected;
}

function selectSiblingRecord(
  records: SessionSubagentRecord[],
  parentRunId: string,
  selectedInstanceId: string,
): SessionSubagentRecord {
  const sibling = records.find((record) =>
    subagentRunId(record) === parentRunId &&
    subagentInstanceId(record).length > 0 &&
    subagentInstanceId(record) !== selectedInstanceId
  );
  if (sibling === undefined) {
    throw new Error(
      "The live parent run must expose another orchestration child with a distinct instance_id.",
    );
  }
  return sibling;
}

function subagentInstanceId(record: SessionSubagentRecord): string {
  return record.instance_id?.trim() || record.subagent_instance_id?.trim() || "";
}

function subagentRunId(record: SessionSubagentRecord): string {
  return record.run_id?.trim() || record.subagent_run_id?.trim() || "";
}

async function waitForSelectedSubagentCard(
  page: Page,
  parentRunId: string,
  instanceId: string,
  taskId = configuredTaskId,
): Promise<Locator> {
  const selector = [
    ".at-message-tool.is-openable-subagent",
    `[data-subagent-run-id="${parentRunId}"]`,
    `[data-subagent-instance-id="${instanceId}"]`,
    taskId.length > 0 ? `[data-subagent-task-id="${taskId}"]` : "",
  ].join("");
  let card = page.locator(selector);
  card = card.filter({ hasText: liveSubagentTitle }).first();
  await expandProcessedGroupsUntilVisible(page, card);
  await expect(card).toBeVisible({ timeout: 60_000 });
  return card;
}

async function waitForSiblingCard(
  page: Page,
  parentRunId: string,
  siblingInstanceId: string,
): Promise<Locator> {
  const card = page.locator(
    `.at-message-tool.is-openable-subagent[data-subagent-run-id="${parentRunId}"][data-subagent-instance-id="${siblingInstanceId}"]`,
  ).last();
  await expandProcessedGroupsUntilVisible(page, card);
  await expect(card).toBeAttached({ timeout: 60_000 });
  return card;
}

function normalizedNonToolText(messages: TimelineMessageRecord[]): string {
  const values = messages.flatMap((message) => [
    ...textValues(message.content),
    ...textValues(message.message?.content),
    ...(message.message?.parts ?? []).flatMap(nonToolPartTextValues),
    ...(message.parts ?? []).flatMap(nonToolPartTextValues),
  ]);
  return normalizeForContainment(values.join("\n"));
}

function nonToolPartTextValues(value: unknown): string[] {
  if (!isRecord(value)) {
    return textValues(value);
  }
  const kind = typeof value.kind === "string" ? value.kind : value.part_kind;
  return kind === "tool-return" ? [] : textValues(value);
}

async function cardIdentity(card: Locator): Promise<SubagentIdentity> {
  const attributes = await card.evaluate((element) => ({
    instanceId: element.getAttribute("data-subagent-instance-id") ?? "",
    parentRunId: element.getAttribute("data-subagent-run-id") ?? "",
    taskId: element.getAttribute("data-subagent-task-id") ?? "",
    title: element.textContent?.trim() ?? "",
  }));
  return attributes;
}

async function expandProcessedGroupsUntilVisible(
  page: Page,
  target: Locator,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await target.isVisible()) {
      return;
    }
    const closed = page.locator(
      "details.at-processed-group:not([open]) > .at-processed-group-summary:visible",
    );
    if (await closed.count() > 0) {
      await closed.first().click();
    }
    await page.waitForTimeout(100);
  }
}

async function expectSubagentStillNonTerminal(
  request: APIRequestContext,
  identity: SubagentIdentity,
): Promise<void> {
  const records = await readSubagents(request);
  const record = records.find((candidate) =>
    subagentInstanceId(candidate) === identity.instanceId &&
    subagentRunId(candidate) === identity.parentRunId
  );
  expect(record).toBeDefined();
  expect((record?.status ?? "").trim().toLowerCase()).not.toMatch(
    /^(completed|failed|stopped|cancelled|canceled)$/,
  );
}

async function expectScrollable(locator: Locator, label: string): Promise<void> {
  const geometry = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.clientHeight, `${label} must retain visible height`).toBeGreaterThan(80);
  expect(
    geometry.scrollHeight,
    `${label} must overflow; a short fixture does not exercise the reported bug.`,
  ).toBeGreaterThan(geometry.clientHeight + 80);
}

async function wheelRoundTrip(page: Page, locator: Locator): Promise<void> {
  await locator.hover();
  const initialTop = await locator.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => locator.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialTop + 20);
  await page.mouse.wheel(0, -900);
  await expect.poll(() => locator.evaluate((element) => element.scrollTop))
    .toBeLessThanOrEqual(initialTop + 1);
}

async function closeSubagentPanel(panel: Locator): Promise<void> {
  const back = panel.getByRole("button", { name: /主会话|Main session/ });
  await expect(back).toBeVisible();
  await back.click();
  await expect(panel).toBeHidden();
}

async function switchAwayAndBack(page: Page): Promise<void> {
  const selected = page.locator(
    `.at-session-item[data-session-id="${liveSessionId}"] .at-session-select`,
  );
  const other = page.locator(
    `.at-session-item:not([data-session-id="${liveSessionId}"]) .at-session-select:visible`,
  ).first();
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(other).toBeVisible();
  await other.click();
  await expect(other).toHaveAttribute("aria-current", "page");
  await selected.click();
  await expect(selected).toHaveAttribute("aria-current", "page");
}

async function waitForTerminalReplay(
  request: APIRequestContext,
  page: Page,
  identity: SubagentIdentity,
): Promise<void> {
  const deadline = Date.now() + terminalTimeoutMs;
  while (Date.now() < deadline) {
    await expectResponsive(page, "wait for terminal replay");
    const [session, records] = await Promise.all([
      readSession(request),
      readSubagents(request),
    ]);
    const record = records.find((candidate) =>
      subagentInstanceId(candidate) === identity.instanceId &&
      subagentRunId(candidate) === identity.parentRunId
    );
    const status = (record?.status ?? "").trim().toLowerCase();
    const runIsTerminal = session.latest_terminal_run_id === identity.parentRunId &&
      /^(completed|failed|stopped|cancelled|canceled)$/.test(
        (session.latest_terminal_run_status ?? "").trim().toLowerCase(),
      );
    if (
      runIsTerminal &&
      /^(completed|failed|stopped|cancelled|canceled)$/.test(status)
    ) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Parent run ${identity.parentRunId} did not reach terminal replay within ${terminalTimeoutMs} ms.`,
  );
}

async function expectResponsive(page: Page, label: string): Promise<void> {
  const timeoutMs = 2_000;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`${label}: renderer did not answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([
      page.evaluate(() => ({ now: performance.now(), title: document.title })),
      timeout,
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function measuredAction(
  metrics: ActionMetric[],
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  const startedAt = performance.now();
  await action();
  metrics.push({ durationMs: performance.now() - startedAt, label });
}

function actionDuration(metrics: ActionMetric[], label: string): number {
  const metric = metrics.find((candidate) => candidate.label === label);
  if (metric === undefined) {
    throw new Error(`Missing action metric: ${label}`);
  }
  return metric.durationMs;
}

function messagesForTask(
  messages: TimelineMessageRecord[],
  taskId: string,
): TimelineMessageRecord[] {
  return messages.filter((message) => message.task_id?.trim() === taskId);
}

function messagesForOtherTasks(
  messages: TimelineMessageRecord[],
  taskId: string,
): TimelineMessageRecord[] {
  return messages.filter((message) => {
    const candidateTaskId = message.task_id?.trim() ?? "";
    return candidateTaskId.length > 0 && candidateTaskId !== taskId;
  });
}

function agentMessageInstanceId(url: string): string | null {
  const path = new URL(url).pathname;
  const match = /^\/api\/sessions\/[^/]+\/agents\/([^/]+)\/messages$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizedMessageText(messages: TimelineMessageRecord[]): string {
  return normalizeForContainment(
    messages.flatMap((message) => textValues(message)).join("\n"),
  );
}

function uniqueToolOutputMarker(
  messages: TimelineMessageRecord[],
  excludedText: string,
): string {
  const candidates = messages.flatMap((message) => [
    ...(message.message?.parts ?? []),
    ...(message.parts ?? []),
  ]).flatMap((part) => toolReturnTextValues(part));
  return uniqueMarker(candidates, excludedText, "selected child tool/stdout");
}

function optionalUniqueToolOutputMarker(
  messages: TimelineMessageRecord[],
): string | null {
  const candidates = messages.flatMap((message) => [
    ...(message.message?.parts ?? []),
    ...(message.parts ?? []),
  ]).flatMap((part) => toolReturnTextValues(part));
  const markers = candidates
    .flatMap((candidate) => candidate.split(/\r?\n/))
    .map(normalizeForContainment)
    .filter((candidate) => candidate.length >= 24)
    .map((candidate) => candidate.slice(0, 120))
    .sort((left, right) => right.length - left.length);
  return markers[0] ?? null;
}

function uniqueMessageMarker(
  messages: TimelineMessageRecord[],
  excludedText: string,
): string {
  const candidates = messages.flatMap((message) => textValues(message));
  return uniqueMarker(candidates, excludedText, "sibling child output");
}

function uniqueMarker(
  candidates: string[],
  excludedText: string,
  label: string,
): string {
  const markers = candidates
    .flatMap((candidate) => candidate.split(/\r?\n/))
    .map(normalizeForContainment)
    .filter((candidate) => candidate.length >= 24)
    .map((candidate) => candidate.slice(0, 120))
    .filter((candidate) => !excludedText.includes(candidate))
    .sort((left, right) => right.length - left.length);
  const marker = markers[0] ?? "";
  expect(
    marker,
    `The live fixture must provide a unique ${label} marker of at least 24 characters.`,
  ).not.toBe("");
  return marker;
}

function toolReturnTextValues(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const kind = typeof value.kind === "string" ? value.kind : value.part_kind;
  if (kind !== "tool-return") {
    return [];
  }
  return textValues(value.content);
}

function textValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(textValues);
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap(textValues);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForContainment(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function mainTimelineText(page: Page): Promise<string> {
  return page.locator(".at-chat-view").evaluate((node) => node.textContent ?? "");
}

async function scanMainTimelineText(page: Page): Promise<string> {
  const timeline = page.locator(".at-chat-view .at-timeline").first();
  return scanScrollableText(page.locator(".at-chat-view"), timeline);
}

async function scanScrollableText(root: Locator, scroller: Locator): Promise<string> {
  const originalTop = await scroller.evaluate((element) => element.scrollTop);
  const geometry = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const snapshots: string[] = [];
  const step = Math.max(1, Math.floor(geometry.clientHeight * 0.8));
  for (
    let top = 0, sample = 0;
    top <= geometry.scrollHeight && sample < 80;
    top += step, sample += 1
  ) {
    await scroller.evaluate((element, nextTop) => {
      element.scrollTop = nextTop;
    }, top);
    await root.page().waitForTimeout(16);
    snapshots.push(await root.evaluate((element) => element.textContent ?? ""));
  }
  await scroller.evaluate((element, top) => {
    element.scrollTop = top;
  }, originalTop);
  return normalizeForContainment(snapshots.join("\n"));
}

async function captureStableScreenshot(page: Page, fileName: string): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.screenshot({
    animations: "disabled",
    path: screenshotPath(fileName, SCREENSHOT_FOLDER),
    quality: 92,
    type: "jpeg",
  });
}
