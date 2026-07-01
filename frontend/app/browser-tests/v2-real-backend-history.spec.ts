import { expect, test, type Page } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectComposerControlsDoNotOverlap,
  expectNoDocumentScroll,
  screenshotPath,
  waitForV2Shell,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-real-backend";
const DEFAULT_REAL_BACKEND_URL = "http://127.0.0.1:8000";

interface SessionListRecord {
  latest_terminal_run_status?: string | null;
  metadata?: {
    title?: string | null;
  } | null;
  session_id: string;
  session_mode?: string | null;
  subagent_session_count?: number | null;
  title?: string | null;
  workspace_id?: string | null;
}

interface SessionRoundsPage {
  items?: unknown[];
}

interface SessionSubagentRecord {
  instance_id?: string | null;
  role_id?: string | null;
  run_id?: string | null;
  status?: string | null;
  title?: string | null;
}

interface ScoredSession {
  messages: unknown[];
  rounds: unknown[];
  score: number;
  session: SessionListRecord;
  subagents: SessionSubagentRecord[];
}

interface RealBackendSample {
  name: string;
  sessionId: string;
  screenshotName: string;
  workspaceId: string;
}

test.setTimeout(60_000);

test("renders real backend subagent tool history without layout leaks", async ({
  page,
}) => {
  const sample = await selectRealBackendSample("subagent");
  if (sample === null) {
    test.skip(true, "No real backend subagent history sample is available.");
    return;
  }

  await openRealBackendSession(page, sample);
  await expectRealBackendShell(page, sample);

  await expandProcessedGroups(page);
  await expect(page.locator(".at-message-tool.is-openable-subagent")).not.toHaveCount(0);
  await page.locator(".at-message-tool.is-openable-subagent").nth(0).click();
  await expect(page.locator(".at-subagent-side-panel")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = document.querySelector(".at-subagent-side-panel");
        return (
          (panel?.querySelectorAll(".at-message").length ?? 0) +
          (panel?.querySelectorAll(".at-message-tool").length ?? 0)
        );
      }),
      { message: "subagent panel should hydrate real backend history" },
    )
    .toBeGreaterThan(0);

  const panelState = await page.evaluate(() => {
    const panel = document.querySelector(".at-subagent-side-panel");
    const rect = panel?.getBoundingClientRect();
    return {
      messageCount: panel?.querySelectorAll(".at-message").length ?? 0,
      panelWidth: rect?.width ?? 0,
      promptLength:
        document
          .querySelector(".at-subagent-session-prompt")
          ?.textContent?.trim().length ?? 0,
      roleOnlyLines: (panel?.textContent ?? "")
        .split("\n")
        .filter((line) => ["Explorer", "Crafter"].includes(line.trim())).length,
      toolCount: panel?.querySelectorAll(".at-message-tool").length ?? 0,
    };
  });
  expect(panelState).toMatchObject({
    roleOnlyLines: 0,
  });
  expect(panelState.panelWidth).toBeGreaterThanOrEqual(420);
  expect(panelState.promptLength).toBeGreaterThan(20);
  expect(panelState.messageCount + panelState.toolCount).toBeGreaterThan(0);

  await page.screenshot({
    fullPage: false,
    path: screenshotPath("real-backend-subagent-panel.png", SCREENSHOT_FOLDER),
  });
});

test("renders real backend orchestration history without duplicated role labels", async ({
  page,
}) => {
  const sample = await selectRealBackendSample("orchestration");
  if (sample === null) {
    test.skip(
      true,
      "No real backend orchestration history sample is available.",
    );
    return;
  }

  await openRealBackendSession(page, sample);
  await expectRealBackendShell(page, sample);
});

async function openRealBackendSession(
  page: Page,
  sample: RealBackendSample,
): Promise<void> {
  await ensureScreenshotDir(SCREENSHOT_FOLDER);
  await page.addInitScript(({ sessionId, workspaceId }) => {
    window.localStorage.setItem("agentTeams.language", "zh");
    window.localStorage.setItem("agentTeams.themeMode", "light");
    window.localStorage.setItem("agent_teams_theme", "light");
    window.localStorage.setItem("agentTeams.selectedSessionId", sessionId);
    window.localStorage.setItem("agentTeams.selectedWorkspaceId", workspaceId);
    window.localStorage.setItem("agentTeams.shellView", "chat");
    window.localStorage.setItem("agentTeams.subagentPanelWidth", "760");
    window.localStorage.removeItem("agentTeams.activeSubagentPanel");
  }, sample);
  await page.goto(`${realBackendUrl()}/app/?codex_verify=${sample.name}`, {
    waitUntil: "domcontentloaded",
  });
}

async function expectRealBackendShell(
  page: Page,
  sample: RealBackendSample,
): Promise<void> {
  await waitForV2Shell(page);
  await expect(page.locator(".at-chat-view")).toBeVisible();
  await expect(page.locator(".at-message")).not.toHaveCount(0);
  await expectNoDocumentScroll(
    page,
    `${sample.name} should stay inside the fixed V2 workspace frame`,
  );
  await expectComposerControlsDoNotOverlap(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.querySelector(".at-chat-view")?.textContent ?? "";
        return {
          chatViewCount: document.querySelectorAll(".at-chat-view").length,
          emptyThinkingCount: countEmptyThinkingBlocks(),
          roleOnlyLines: countRoleOnlyLines(main),
          toolCount: document.querySelectorAll(".at-message-tool").length,
        };

        function countEmptyThinkingBlocks(): number {
          return Array.from(document.querySelectorAll(".at-message-thinking")).filter(
            (node) => {
              const text = (node.textContent ?? "").trim();
              return text === "思考" || text === "Thinking";
            },
          ).length;
        }

        function countRoleOnlyLines(text: string): number {
          return text
            .split("\n")
            .filter((line) => ["Explorer", "Crafter"].includes(line.trim()))
            .length;
        }
      }),
    )
    .toMatchObject({
      chatViewCount: 1,
      emptyThinkingCount: 0,
      roleOnlyLines: 0,
    });
  await page.screenshot({
    fullPage: false,
    path: screenshotPath(sample.screenshotName, SCREENSHOT_FOLDER),
  });
}

async function expandProcessedGroups(page: Page): Promise<void> {
  await page
    .locator("details.at-processed-group > summary, .at-processed-group-summary")
    .evaluateAll((nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLElement) {
          node.click();
        }
      }
    });
}

async function selectRealBackendSample(
  kind: "orchestration" | "subagent",
): Promise<RealBackendSample | null> {
  const sessions = await fetchSessions();
  const prelim = sessions
    .filter((session) => session.workspace_id === "default")
    .map((session) => ({
      score: preliminaryScore(session, kind),
      session,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);

  const scored: ScoredSession[] = [];
  for (const candidate of prelim) {
    const [messages, rounds, subagents] = await Promise.all([
      fetchJson<unknown[]>(
        `/api/sessions/${encodeURIComponent(candidate.session.session_id)}/messages`,
      ).catch(() => []),
      fetchRounds(candidate.session.session_id),
      fetchJson<SessionSubagentRecord[]>(
        `/api/sessions/${encodeURIComponent(candidate.session.session_id)}/subagents`,
      ).catch(() => []),
    ]);
    scored.push({
      messages,
      rounds,
      score:
        candidate.score +
        detailedScore({
          messages,
          rounds,
          session: candidate.session,
          subagents,
        }),
      session: candidate.session,
      subagents,
    });
  }

  const selected = scored
    .filter((candidate) =>
      kind === "subagent"
        ? candidate.subagents.length > 0
        : candidate.session.session_mode === "orchestration",
    )
    .sort((left, right) => right.score - left.score)[0];
  if (!selected) {
    return null;
  }
  return {
    name: `real_backend_${kind}_${selected.session.session_id}`,
    screenshotName: `real-backend-${kind}-history.png`,
    sessionId: selected.session.session_id,
    workspaceId: selected.session.workspace_id ?? "default",
  };
}

async function fetchRounds(sessionId: string): Promise<unknown[]> {
  const payload = await fetchJson<unknown[] | SessionRoundsPage>(
    `/api/sessions/${encodeURIComponent(sessionId)}/rounds?limit=20`,
  ).catch(() => []);
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

async function fetchSessions(): Promise<SessionListRecord[]> {
  const payload = await fetchJson<SessionListRecord[]>(
    "/api/sessions?workspace_id=default",
  ).catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${realBackendUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

function preliminaryScore(
  session: SessionListRecord,
  kind: "orchestration" | "subagent",
): number {
  let score = 0;
  const title = sessionTitle(session).toLowerCase();
  if (kind === "subagent" && (session.subagent_session_count ?? 0) > 0) {
    score += 40;
  }
  if (kind === "orchestration" && session.session_mode === "orchestration") {
    score += 40;
  }
  if (
    title.includes("流式") ||
    title.includes("subagent") ||
    title.includes("子代理") ||
    title.includes("工具") ||
    title.includes("问我")
  ) {
    score += 15;
  }
  if (session.latest_terminal_run_status === "completed") {
    score += 4;
  }
  return score;
}

function detailedScore(candidate: Omit<ScoredSession, "score">): number {
  const text = JSON.stringify({
    messages: candidate.messages,
    rounds: candidate.rounds,
    subagents: candidate.subagents,
  }).toLowerCase();
  let score = 0;
  if (candidate.rounds.length > 1) {
    score += 8;
  }
  if (candidate.subagents.length > 0) {
    score += 30;
  }
  if (
    text.includes("tool_call") ||
    text.includes("tool_result") ||
    text.includes("shell") ||
    text.includes("read") ||
    text.includes("grep") ||
    text.includes("glob")
  ) {
    score += 25;
  }
  if (
    text.includes("spawn_subagent") ||
    text.includes("subagent") ||
    text.includes("explorer") ||
    text.includes("crafter")
  ) {
    score += 25;
  }
  if (text.includes("ask_question") || text.includes("manual_action")) {
    score += 15;
  }
  return score;
}

function sessionTitle(session: SessionListRecord): string {
  return session.metadata?.title ?? session.title ?? session.session_id;
}

function realBackendUrl(): string {
  return (
    process.env.AGENT_TEAMS_REAL_BACKEND_URL?.replace(/\/$/, "") ??
    DEFAULT_REAL_BACKEND_URL
  );
}
