import { expect, test } from "@playwright/test";

import type {
  MemorySkillDraft,
  MemorySkillDraftStatus,
  MemorySkillDraftSummary,
} from "../src/api/contracts";
import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-memory";

test("filters, searches, selects, and rebuilds the Memory surface", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = memoryViewState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleMemoryApi(context, state),
      sessionTitle: "TS memory view",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Memory" })
      .click();

    const memoryView = page.getByTestId("memory-view");
    await expect(memoryView).toBeVisible();
    await expect(memoryView.getByText(`Workspace ${WORKSPACE_ID}`)).toBeVisible();
    await expect(memoryView.getByText("2 memories")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-role-routing")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-superseded")).toHaveCount(0);

    const shellRow = page.getByTestId("memory-row-memory-shell-frame");
    await expect(shellRow).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("memory-detail")).toContainText("Fixed shell frame");
    await expect(page.getByTestId("memory-detail")).toContainText(
      "Keep the app viewport locked while chat scrolls independently.",
    );
    await expect(page.getByTestId("memory-detail")).toContainText("owner");

    await page.getByTestId("memory-row-memory-role-routing").click();
    await expect(page.getByTestId("memory-row-memory-role-routing"))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("memory-detail")).toContainText(
      "Role routing decision",
    );
    await expect(page.getByTestId("memory-detail")).toContainText("orchestration");
    await page.screenshot({
      path: screenshotPath("v2-memory-selected-detail.png", SCREENSHOT_FOLDER),
    });

    await memoryView.getByRole("searchbox", { name: "Search memories" })
      .fill("subagent");
    await expect(memoryView.getByText("1 search hits")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-search-hit")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toHaveCount(0);
    await expect(page.getByTestId("memory-detail")).toContainText(
      "Subagent stream isolation",
    );
    await expect(page.getByTestId("memory-detail")).toContainText(
      "Matched snippet",
    );
    await expect(page.getByText("score 0.93")).toBeVisible();
    expect(state.searchPayloads).toEqual([
      {
        kind: null,
        limit: 40,
        min_confidence: 0,
        scope: null,
        status: "active",
        text_query: "subagent",
        tier: null,
        workspace_id: WORKSPACE_ID,
      },
    ]);
    await page.screenshot({
      path: screenshotPath("v2-memory-search-hit.png", SCREENSHOT_FOLDER),
    });

    await memoryView.getByRole("searchbox", { name: "Search memories" }).fill("");
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toBeVisible();
    await memoryView.getByText("Superseded", { exact: true }).click();
    await expect(page.getByTestId("memory-row-memory-superseded")).toBeVisible();
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toHaveCount(0);
    await expect(page.getByTestId("memory-detail")).toContainText(
      "Superseded prompt note",
    );
    await expect
      .poll(() => state.listRequests)
      .toContain(
        `/memories?workspace_id=${WORKSPACE_ID}&status=superseded&limit=40&offset=0`,
      );

    await memoryView.getByRole("searchbox", { name: "Search memories" })
      .fill("missing-memory");
    await expect(memoryView.getByText("No matching memories.")).toBeVisible();
    await expect(page.getByTestId("memory-detail")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-memory-empty-search.png", SCREENSHOT_FOLDER),
    });

    await memoryView.getByRole("searchbox", { name: "Search memories" }).fill("");
    await memoryView.getByText("Active", { exact: true }).click();
    await expect(page.getByTestId("memory-row-memory-shell-frame")).toBeVisible();
    await page.getByRole("button", { name: "Rebuild memory index" }).click();
    await expect(
      page.getByText("Index rebuilt: 3 rebuilt, 1 skipped, 0 failed out of 4."),
    ).toBeVisible();
    expect(state.rebuildPayloads).toEqual([{ workspace_id: WORKSPACE_ID }]);
    await page.screenshot({
      path: screenshotPath("v2-memory-rebuild-result.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 memory list, filters, detail, and rebuild result should stay framed",
    );
  } finally {
    await appServer.close();
  }
});

test("opens Memory architecture and skill draft secondary pages", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = memoryViewState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleMemoryApi(context, state),
      sessionTitle: "TS memory secondary pages",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Memory" })
      .click();

    const memoryView = page.getByTestId("memory-view");
    await expect(memoryView).toBeVisible();
    await memoryView.getByText("Architecture", { exact: true }).click();
    await expect(page.getByTestId("memory-architecture-map")).toBeVisible();
    await expect(memoryView.getByText("Lifecycle")).toBeVisible();
    await expect(memoryView.getByText("Working memory")).toHaveCount(2);
    await expect(memoryView.getByText("Skill draft flow")).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-memory-architecture.png", SCREENSHOT_FOLDER),
    });

    await memoryView.getByText("Skill Drafts", { exact: true }).click();
    await expect(page.getByTestId("memory-skill-drafts")).toBeVisible();
    await expect(page.getByTestId("memory-draft-row-draft-1")).toBeVisible();
    await expect(page.getByTestId("memory-draft-editor")).toContainText(
      "workspace-frame",
    );
    await expect(page.getByTestId("memory-draft-editor")).toContainText(
      "Add one usage example before applying.",
    );
    await expect(page.getByTestId("memory-draft-editor")).toContainText("SKILL.md");
    await page.screenshot({
      path: screenshotPath("v2-memory-skill-drafts.png", SCREENSHOT_FOLDER),
    });
    await expect
      .poll(() => state.skillDraftListRequests)
      .toContain(
        `/memories/skill-drafts?scope_kind=workspace&workspace_id=${WORKSPACE_ID}&limit=30&offset=0`,
      );

    await memoryView
      .getByRole("searchbox", { name: "Search skill drafts" })
      .fill("frame");
    await expect
      .poll(() => state.skillDraftListRequests)
      .toContain(
        `/memories/skill-drafts?scope_kind=workspace&workspace_id=${WORKSPACE_ID}&text_query=frame&limit=30&offset=0`,
      );

    await memoryView.getByRole("button", { name: "Generate" }).click();
    await expect
      .poll(() =>
        state.skillDraftGeneratePayloads.some(
          (payload) =>
            payload.draft_kind === "auto" &&
            payload.scope_kind === "workspace" &&
            payload.text_query === "frame" &&
            payload.workspace_id === WORKSPACE_ID,
        ),
      )
      .toBe(true);

    await page.getByLabel("Runtime name").fill("workspace-frame-v2");
    await memoryView.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(() =>
        state.skillDraftUpdatePayloads.some(
          (payload) => payload.runtime_name === "workspace-frame-v2",
        ),
      )
      .toBe(true);

    await memoryView.getByRole("button", { name: "Validate" }).click();
    await expect
      .poll(() => state.skillDraftValidateCalls.includes("draft-1"))
      .toBe(true);
    await expect(page.getByTestId("memory-draft-editor")).toContainText("Validated");

    await memoryView.getByRole("button", { name: "Apply" }).click();
    await expect
      .poll(() => state.skillDraftApplyCalls.includes("draft-1"))
      .toBe(true);
    await expect(
      memoryView.getByText("Applied skill draft: app:workspace-frame-v2"),
    ).toBeVisible();
    await page.getByTestId("memory-draft-editor").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: screenshotPath("v2-memory-skill-drafts-applied.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 memory architecture and skill drafts should stay in the fixed shell",
    );
  } finally {
    await appServer.close();
  }
});

interface MemoryViewState {
  draft: MemorySkillDraft;
  listRequests: string[];
  rebuildPayloads: Record<string, unknown>[];
  searchPayloads: Record<string, unknown>[];
  skillDraftApplyCalls: string[];
  skillDraftGeneratePayloads: Record<string, unknown>[];
  skillDraftListRequests: string[];
  skillDraftUpdatePayloads: Record<string, unknown>[];
  skillDraftValidateCalls: string[];
}

interface MemorySummary {
  confidence_score: number;
  content_body_preview: string;
  content_title: string;
  created_at: string;
  expires_at: string | null;
  id: string;
  kind: string;
  role_id: string | null;
  scope: string;
  session_id: string | null;
  source: string;
  status: string;
  tags: string[];
  tier: string;
  updated_at: string;
  version: number;
  workspace_id: string;
}

interface MemoryEntry extends MemorySummary {
  access_count: number;
  content: {
    body: string;
    context: string;
    outcome: string;
    title: string;
  };
  last_accessed_at: string | null;
  metadata: Record<string, string>;
  parent_entry_id: string | null;
  run_id: string | null;
  source_ref: string;
  superseded_by_id: string | null;
}

function memoryViewState(): MemoryViewState {
  return {
    draft: memorySkillDraft(),
    listRequests: [],
    rebuildPayloads: [],
    searchPayloads: [],
    skillDraftApplyCalls: [],
    skillDraftGeneratePayloads: [],
    skillDraftListRequests: [],
    skillDraftUpdatePayloads: [],
    skillDraftValidateCalls: [],
  };
}

async function handleMemoryApi(
  context: MockApiRouteContext,
  state: MemoryViewState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === "/memories/skill-drafts") {
    const requestKey = `${context.path}${context.url.search}`;
    state.skillDraftListRequests.push(requestKey);
    await context.fulfillJson({
      items: [memorySkillDraftSummary(state.draft)],
      limit: Number(context.url.searchParams.get("limit") ?? 30),
      offset: Number(context.url.searchParams.get("offset") ?? 0),
      total_count: 1,
    });
    return true;
  }
  if (
    context.method === "POST"
    && context.path === "/memories/skill-drafts:generate"
  ) {
    state.skillDraftGeneratePayloads.push(
      readRecordPayload(context.route.request().postData()),
    );
    await context.fulfillJson({
      error_message: "",
      items: [memorySkillDraftSummary(state.draft)],
      source_memory_count: state.draft.source_memory_ids.length,
    });
    return true;
  }
  if (
    context.method === "GET"
    && context.path.startsWith("/memories/skill-drafts/")
    && !context.path.includes(":")
  ) {
    await context.fulfillJson(state.draft);
    return true;
  }
  if (
    context.method === "PUT"
    && context.path.startsWith("/memories/skill-drafts/")
  ) {
    const payload = readRecordPayload(context.route.request().postData());
    state.skillDraftUpdatePayloads.push(payload);
    state.draft = updateMemorySkillDraftRecord(state.draft, payload);
    await context.fulfillJson(state.draft);
    return true;
  }
  if (
    context.method === "POST"
    && context.path.endsWith(":validate")
    && context.path.startsWith("/memories/skill-drafts/")
  ) {
    state.skillDraftValidateCalls.push(skillDraftIdFromPath(context.path));
    state.draft = {
      ...state.draft,
      status: "validated",
      updated_at: "2026-06-25T09:10:00Z",
      validated_at: "2026-06-25T09:10:00Z",
    };
    await context.fulfillJson(state.draft);
    return true;
  }
  if (
    context.method === "POST"
    && context.path.endsWith(":apply")
    && context.path.startsWith("/memories/skill-drafts/")
  ) {
    state.skillDraftApplyCalls.push(skillDraftIdFromPath(context.path));
    state.draft = {
      ...state.draft,
      applied_at: "2026-06-25T09:12:00Z",
      applied_ref: `app:${state.draft.runtime_name}`,
      applied_skill_id: state.draft.runtime_name,
      status: "applied",
      updated_at: "2026-06-25T09:12:00Z",
    };
    await context.fulfillJson({
      draft: state.draft,
      ref: state.draft.applied_ref,
      skill_id: state.draft.applied_skill_id,
    });
    return true;
  }
  if (context.method === "GET" && context.path === "/memories") {
    const requestKey = `${context.path}${context.url.search}`;
    state.listRequests.push(requestKey);
    await context.fulfillJson(memoryQueryResponse(context.url.searchParams));
    return true;
  }
  if (
    context.method === "GET"
    && context.path.startsWith(`/workspaces/${WORKSPACE_ID}/memories/`)
  ) {
    const memoryId = decodeURIComponent(context.path.split("/").at(-1) ?? "");
    await context.fulfillJson(memoryEntry(memoryId));
    return true;
  }
  if (context.method === "POST" && context.path === "/memories/search") {
    const payload = readRecordPayload(context.route.request().postData());
    state.searchPayloads.push(payload);
    await context.fulfillJson(memorySearchResponse(payload));
    return true;
  }
  if (context.method === "POST" && context.path === "/memories/rebuild-index") {
    state.rebuildPayloads.push(readRecordPayload(context.route.request().postData()));
    await context.fulfillJson({
      failed_count: 0,
      rebuilt_count: 3,
      scanned_count: 4,
      skipped_count: 1,
    });
    return true;
  }
  return false;
}

function memoryQueryResponse(searchParams: URLSearchParams): Record<string, unknown> {
  const status = searchParams.get("status") ?? "active";
  const items = memorySummaries().filter((entry) => entry.status === status);
  return {
    items,
    limit: 40,
    offset: 0,
    total_count: items.length,
  };
}

function memorySearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.text_query !== "subagent") {
    return {
      items: [],
      total_count: 0,
    };
  }
  return {
    items: [
      {
        entry: memorySummary("memory-search-hit"),
        rank: 1,
        score: 0.93,
        snippet: "subagent stream stays isolated from the parent timeline",
      },
    ],
    total_count: 1,
  };
}

function memorySkillDraft(): MemorySkillDraft {
  return {
    applied_at: null,
    applied_ref: null,
    applied_skill_id: null,
    created_at: "2026-06-25T08:45:00Z",
    description: "Turn stable workspace-frame memories into a reusable skill.",
    draft_kind: "skill",
    files: [
      {
        content: "# Workspace frame skill",
        encoding: "utf-8",
        path: "SKILL.md",
      },
    ],
    generation_error: "",
    id: "draft-1",
    instructions: "Keep workspace pages fixed-height and locally scrollable.",
    runtime_name: "workspace-frame",
    scope_kind: "workspace",
    source_memory_ids: ["memory-shell-frame", "memory-search-hit"],
    status: "draft",
    updated_at: "2026-06-25T08:50:00Z",
    validated_at: null,
    validation_messages: [
      {
        code: "missing-example",
        message: "Add one usage example before applying.",
        path: "SKILL.md",
        severity: "warning",
      },
    ],
    workspace_id: WORKSPACE_ID,
    workspace_ids: [WORKSPACE_ID],
  };
}

function memorySkillDraftSummary(
  draft: MemorySkillDraft,
): MemorySkillDraftSummary {
  return {
    applied_ref: draft.applied_ref,
    created_at: draft.created_at,
    description: draft.description,
    draft_kind: draft.draft_kind,
    id: draft.id,
    runtime_name: draft.runtime_name,
    scope_kind: draft.scope_kind,
    source_memory_count: draft.source_memory_ids.length,
    status: draft.status,
    updated_at: draft.updated_at,
    validation_error_count: draft.validation_messages.filter(
      (message) => message.severity === "error",
    ).length,
    validation_warning_count: draft.validation_messages.filter(
      (message) => message.severity === "warning",
    ).length,
    workspace_id: draft.workspace_id,
    workspace_ids: draft.workspace_ids,
  };
}

function updateMemorySkillDraftRecord(
  draft: MemorySkillDraft,
  payload: Record<string, unknown>,
): MemorySkillDraft {
  return {
    ...draft,
    description:
      typeof payload.description === "string" ? payload.description : draft.description,
    instructions:
      typeof payload.instructions === "string" ? payload.instructions : draft.instructions,
    runtime_name:
      typeof payload.runtime_name === "string" ? payload.runtime_name : draft.runtime_name,
    status: isMemorySkillDraftStatus(payload.status)
      ? payload.status
      : draft.status,
    updated_at: "2026-06-25T09:00:00Z",
  };
}

function isMemorySkillDraftStatus(
  value: unknown,
): value is MemorySkillDraftStatus {
  return (
    value === "applied" ||
    value === "applying" ||
    value === "draft" ||
    value === "rejected" ||
    value === "validated"
  );
}

function skillDraftIdFromPath(path: string): string {
  return decodeURIComponent(
    path.replace("/memories/skill-drafts/", "").split(":")[0] ?? "",
  );
}

function memoryEntry(memoryId: string): MemoryEntry {
  const summary = memorySummary(memoryId);
  if (summary.id === "memory-role-routing") {
    return {
      ...entryFromSummary(summary),
      content: {
        body: "Use the selected orchestration role only for routed work.",
        context: "Composer run controls",
        outcome: "Normal mode remains Main Agent unless the user changes it.",
        title: "Role routing decision",
      },
      metadata: {
        area: "orchestration",
        owner: "runtime",
      },
    };
  }
  if (summary.id === "memory-superseded") {
    return {
      ...entryFromSummary(summary),
      content: {
        body: "This prompt instruction was replaced by the processed group rule.",
        context: "Timeline replay cleanup",
        outcome: "Superseded rows remain inspectable but are filtered by default.",
        title: "Superseded prompt note",
      },
      metadata: {
        owner: "memory",
      },
    };
  }
  if (summary.id === "memory-search-hit") {
    return {
      ...entryFromSummary(summary),
      content: {
        body: "Subagent stream rows must stay in the right panel and never leak into the parent timeline.",
        context: "Runtime stream recovery",
        outcome: "Parent replay and live streaming remain ordered.",
        title: "Subagent stream isolation",
      },
      metadata: {
        owner: "stream",
      },
    };
  }
  return {
    ...entryFromSummary(summary),
    content: {
      body: "Keep the app viewport locked while chat scrolls independently.",
      context: "Frontend rewrite shell parity",
      outcome: "Sidebar, timeline, and composer keep fixed-page behavior.",
      title: "Fixed shell frame",
    },
    metadata: {
      owner: "frontend",
    },
  };
}

function entryFromSummary(summary: MemorySummary): MemoryEntry {
  return {
    ...summary,
    access_count: 4,
    content: {
      body: summary.content_body_preview,
      context: "",
      outcome: "",
      title: summary.content_title,
    },
    last_accessed_at: null,
    metadata: {},
    parent_entry_id: null,
    run_id: null,
    source_ref: "",
    superseded_by_id: null,
  };
}

function memorySummaries(): MemorySummary[] {
  return [
    memorySummary("memory-shell-frame"),
    memorySummary("memory-role-routing"),
    memorySummary("memory-superseded"),
  ];
}

function memorySummary(memoryId: string): MemorySummary {
  const base = {
    confidence_score: 0.91,
    created_at: "2026-06-25T08:00:00Z",
    expires_at: null,
    id: memoryId,
    role_id: null,
    scope: "workspace",
    session_id: null,
    source: "manual",
    status: "active",
    tags: ["frontend"],
    tier: "persistent",
    updated_at: "2026-06-25T08:20:00Z",
    version: 1,
    workspace_id: WORKSPACE_ID,
  };
  if (memoryId === "memory-role-routing") {
    return {
      ...base,
      content_body_preview: "Keep orchestration role routing explicit.",
      content_title: "Role routing decision",
      kind: "decision",
      tags: ["runtime", "orchestration"],
      tier: "medium_term",
    };
  }
  if (memoryId === "memory-superseded") {
    return {
      ...base,
      confidence_score: 0.71,
      content_body_preview: "Older prompt display rule retained for audit.",
      content_title: "Superseded prompt note",
      kind: "summary",
      status: "superseded",
      tags: ["timeline"],
      tier: "working",
    };
  }
  if (memoryId === "memory-search-hit") {
    return {
      ...base,
      confidence_score: 0.94,
      content_body_preview: "Subagent stream rows stay out of the parent timeline.",
      content_title: "Subagent stream isolation",
      kind: "constraint",
      tags: ["subagent", "stream"],
    };
  }
  return {
    ...base,
    content_body_preview: "Keep the app viewport locked while chat scrolls independently.",
    content_title: "Fixed shell frame",
    kind: "constraint",
  };
}

function readRecordPayload(body: string | null): Record<string, unknown> {
  if (body === null || body.trim() === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object payload.");
  }
  return parsed as Record<string, unknown>;
}
