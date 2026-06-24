import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMemory,
  listMemories,
  rebuildMemoryIndex,
  searchMemories,
} from "../api/client";
import type { MemoryEntry, MemoryEntrySummary } from "../api/contracts";
import { MemoryView } from "../features/memory/MemoryView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getMemory: vi.fn(),
  listMemories: vi.fn(),
  rebuildMemoryIndex: vi.fn(),
  searchMemories: vi.fn(),
}));

const getMemoryMock = vi.mocked(getMemory);
const listMemoriesMock = vi.mocked(listMemories);
const rebuildMemoryIndexMock = vi.mocked(rebuildMemoryIndex);
const searchMemoriesMock = vi.mocked(searchMemories);

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
    context: "V2 shell rewrite",
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
