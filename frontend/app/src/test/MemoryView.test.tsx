import { existsSync, readFileSync } from "node:fs";

import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyMemorySkillDraft,
  generateMemorySkillDrafts,
  getMemory,
  getMemorySkillDraft,
  listMemorySkillDrafts,
  listMemories,
  rebuildMemoryIndex,
  searchMemories,
  updateMemorySkillDraft,
  validateMemorySkillDraft,
} from "../api/client";
import type {
  MemoryEntry,
  MemoryEntrySummary,
  MemorySkillDraft,
  MemorySkillDraftSummary,
} from "../api/contracts";
import { MemoryView } from "../features/memory/MemoryView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  applyMemorySkillDraft: vi.fn(),
  generateMemorySkillDrafts: vi.fn(),
  getMemory: vi.fn(),
  getMemorySkillDraft: vi.fn(),
  listMemorySkillDrafts: vi.fn(),
  listMemories: vi.fn(),
  rebuildMemoryIndex: vi.fn(),
  searchMemories: vi.fn(),
  updateMemorySkillDraft: vi.fn(),
  validateMemorySkillDraft: vi.fn(),
}));

const applyMemorySkillDraftMock = vi.mocked(applyMemorySkillDraft);
const generateMemorySkillDraftsMock = vi.mocked(generateMemorySkillDrafts);
const getMemoryMock = vi.mocked(getMemory);
const getMemorySkillDraftMock = vi.mocked(getMemorySkillDraft);
const listMemorySkillDraftsMock = vi.mocked(listMemorySkillDrafts);
const listMemoriesMock = vi.mocked(listMemories);
const rebuildMemoryIndexMock = vi.mocked(rebuildMemoryIndex);
const searchMemoriesMock = vi.mocked(searchMemories);
const updateMemorySkillDraftMock = vi.mocked(updateMemorySkillDraft);
const validateMemorySkillDraftMock = vi.mocked(validateMemorySkillDraft);

const memorySummary: MemoryEntrySummary = {
  confidence_score: 0.91,
  content_body_preview: "Keep workspace pages fixed height.",
  content_title: "Fixed workspace frame",
  created_at: "2026-06-24T00:00:00Z",
  expires_at: null,
  id: "memory-1",
  kind: "constraint",
  role_id: null,
  scope: "workspace",
  session_id: null,
  source: "manual",
  status: "active",
  tags: ["frontend"],
  tier: "persistent",
  updated_at: "2026-06-24T00:10:00Z",
  version: 1,
  workspace_id: "workspace-1",
};

const memoryEntry: MemoryEntry = {
  access_count: 3,
  confidence_score: 0.91,
  content: {
    body: "Keep workspace pages fixed height.",
    context: "React shell rewrite",
    outcome: "Avoid body scroll",
    title: "Fixed workspace frame",
  },
  created_at: "2026-06-24T00:00:00Z",
  expires_at: null,
  id: "memory-1",
  kind: "constraint",
  last_accessed_at: null,
  metadata: {
    owner: "frontend",
  },
  parent_entry_id: null,
  role_id: null,
  run_id: null,
  scope: "workspace",
  session_id: null,
  source: "manual",
  source_ref: "",
  status: "active",
  superseded_by_id: null,
  tags: ["frontend"],
  tier: "persistent",
  updated_at: "2026-06-24T00:10:00Z",
  version: 1,
  workspace_id: "workspace-1",
};

const skillDraftSummary: MemorySkillDraftSummary = {
  applied_ref: null,
  created_at: "2026-06-24T00:15:00Z",
  description: "Turn stable workspace frame memories into a skill.",
  draft_kind: "skill",
  id: "draft-1",
  runtime_name: "workspace-frame",
  scope_kind: "workspace",
  source_memory_count: 2,
  status: "draft",
  updated_at: "2026-06-24T00:20:00Z",
  validation_error_count: 0,
  validation_warning_count: 1,
  workspace_id: "workspace-1",
  workspace_ids: ["workspace-1"],
};

const skillDraft: MemorySkillDraft = {
  applied_at: null,
  applied_ref: null,
  applied_skill_id: null,
  created_at: "2026-06-24T00:15:00Z",
  description: "Turn stable workspace frame memories into a skill.",
  draft_kind: "skill",
  files: [
    {
      content: "# Skill",
      encoding: "utf-8",
      path: "SKILL.md",
    },
  ],
  generation_error: "",
  id: "draft-1",
  instructions: "Keep workspace pages fixed-height and locally scrollable.",
  runtime_name: "workspace-frame",
  scope_kind: "workspace",
  source_memory_ids: ["memory-1", "memory-2"],
  status: "draft",
  updated_at: "2026-06-24T00:20:00Z",
  validated_at: null,
  validation_messages: [
    {
      code: "missing-example",
      message: "Add one usage example before applying.",
      path: "SKILL.md",
      severity: "warning",
    },
  ],
  workspace_id: "workspace-1",
  workspace_ids: ["workspace-1"],
};

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  listMemoriesMock.mockResolvedValue({
    items: [memorySummary],
    limit: 40,
    offset: 0,
    total_count: 1,
  });
  getMemoryMock.mockResolvedValue(memoryEntry);
  searchMemoriesMock.mockResolvedValue({
    items: [
      {
        entry: memorySummary,
        rank: 1,
        score: 0.87,
        snippet: "workspace pages fixed height",
      },
    ],
    total_count: 1,
  });
  rebuildMemoryIndexMock.mockResolvedValue({
    failed_count: 0,
    rebuilt_count: 1,
    scanned_count: 1,
    skipped_count: 0,
  });
  listMemorySkillDraftsMock.mockResolvedValue({
    items: [skillDraftSummary],
    limit: 30,
    offset: 0,
    total_count: 1,
  });
  getMemorySkillDraftMock.mockResolvedValue(skillDraft);
  generateMemorySkillDraftsMock.mockResolvedValue({
    error_message: "",
    items: [skillDraftSummary],
    source_memory_count: 2,
  });
  updateMemorySkillDraftMock.mockResolvedValue(skillDraft);
  validateMemorySkillDraftMock.mockResolvedValue({
    ...skillDraft,
    status: "validated",
    validated_at: "2026-06-24T00:22:00Z",
  });
  applyMemorySkillDraftMock.mockResolvedValue({
    draft: {
      ...skillDraft,
      applied_at: "2026-06-24T00:24:00Z",
      applied_ref: "app:workspace-frame",
      applied_skill_id: "workspace-frame",
      status: "applied",
    },
    ref: "app:workspace-frame",
    skill_id: "workspace-frame",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MemoryView", () => {
  it("renders memory rows and the selected memory detail", async () => {
    renderView();

    expect(await screen.findByTestId("memory-view")).toBeVisible();
    expect(await screen.findByTestId("memory-row-memory-1")).toBeVisible();
    expect(await screen.findByText("Avoid body scroll")).toBeVisible();
    expect(screen.getByText("Source")).toBeVisible();
    expect(screen.getByText("Expires")).toBeVisible();
    expect(screen.getByText("Accesses")).toBeVisible();
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.getByText("owner")).toBeVisible();
    expect(getMemoryMock).toHaveBeenCalledWith("workspace-1", "memory-1");
  });

  it("searches memories with the current workspace and filters", async () => {
    renderView();

    fireEvent.change(await screen.findByRole("searchbox", { name: "Search memories" }), {
      target: { value: "fixed" },
    });

    await waitFor(() =>
      expect(searchMemoriesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          min_confidence: 0,
          status: "active",
          text_query: "fixed",
          workspace_id: "workspace-1",
        }),
      ),
    );
    expect(await screen.findByText("workspace pages fixed height")).toBeVisible();
    expect(screen.getByText("score 0.87")).toBeVisible();
  });

  it("preserves the explicit all-status search payload and keeps search after tab switches", async () => {
    renderView();

    fireEvent.click((await screen.findAllByText("All"))[0]);
    fireEvent.click(screen.getByText("Architecture"));
    expect(await screen.findByTestId("memory-architecture-map")).toBeVisible();
    fireEvent.click(screen.getByText("Entries"));
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search memories" }), {
      target: { value: "fixed" },
    });

    await waitFor(() =>
      expect(searchMemoriesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: null,
          text_query: "fixed",
          workspace_id: "workspace-1",
        }),
      ),
    );
    expect(await screen.findByDisplayValue("fixed")).toBeVisible();
  });

  it("renders the memory architecture map from the React page", async () => {
    renderView();

    fireEvent.click(await screen.findByText("Architecture"));

    expect(await screen.findByTestId("memory-architecture-map")).toBeVisible();
    expect(screen.getAllByText("Working memory")).toHaveLength(2);
    expect(screen.getByText("Medium-term memory")).toBeVisible();
    expect(screen.getByText("Persistent memory")).toBeVisible();
    expect(screen.getByText("Skill draft flow")).toBeVisible();
  });

  it("runs the memory skill draft workflow through typed API calls", async () => {
    renderView();

    fireEvent.click(await screen.findByText("Skill Drafts"));

    expect(await screen.findByTestId("memory-skill-drafts")).toBeVisible();
    fireEvent.click(await screen.findByTestId("memory-draft-row-draft-1"));
    await waitFor(() =>
      expect(getMemorySkillDraftMock).toHaveBeenCalledWith("draft-1"),
    );
    expect(await screen.findByText(/Add one usage example/)).toBeVisible();
    expect(listMemorySkillDraftsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        draftKind: "all",
        scopeKind: "workspace",
        status: "all",
        workspaceId: "workspace-1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() =>
      expect(generateMemorySkillDraftsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          draft_kind: "auto",
          scope_kind: "workspace",
          workspace_id: "workspace-1",
        }),
      ),
    );

    fireEvent.change(screen.getByDisplayValue("workspace-frame"), {
      target: { value: "workspace-frame-react" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateMemorySkillDraftMock).toHaveBeenCalledWith(
        "draft-1",
        expect.objectContaining({
          runtime_name: "workspace-frame-react",
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() =>
      expect(validateMemorySkillDraftMock).toHaveBeenCalledWith("draft-1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(updateMemorySkillDraftMock).toHaveBeenCalledWith("draft-1", {
        status: "rejected",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(applyMemorySkillDraftMock).toHaveBeenCalledWith("draft-1"),
    );
    expect(await screen.findByText("Applied skill draft: app:workspace-frame")).toBeVisible();
  }, 10_000);

  it("rebuilds the memory index and reports the result", async () => {
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Rebuild memory index" }));

    await waitFor(() =>
      expect(rebuildMemoryIndexMock).toHaveBeenCalledWith("workspace-1"),
    );
    expect(
      await screen.findByText(
        "Index rebuilt: 1 rebuilt, 0 skipped, 0 failed out of 1.",
      ),
    ).toBeVisible();
  });

  it("keeps Chinese memory copy on the React page", async () => {
    useUiStore.setState({ language: "zh-CN" });

    renderView();

    expect(await screen.findByText("记忆")).toBeVisible();
    expect(await screen.findByPlaceholderText("搜索记忆")).toBeVisible();
    expect(screen.queryByText(/Memory Bank/)).not.toBeInTheDocument();
  });

  it("keeps the memory architecture document on the renamed path", () => {
    const newPath = "../../docs/modules/memory/memory-bank-architecture.md";
    const oldPath = "../../docs/design/fe1-memory-bank.md";
    const source = readFileSync(newPath, "utf-8");

    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(oldPath)).toBe(false);
    expect(source.startsWith("# Memory Bank Architecture")).toBe(true);
  });
});

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <MemoryView selectedWorkspaceId="workspace-1" />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
