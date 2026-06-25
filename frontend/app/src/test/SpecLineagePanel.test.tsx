import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  getTaskSpecArtifactDiff,
  listRunTasks,
  listSessionRounds,
  listSpecCheckpointEvaluations,
  listTaskSpecArtifacts,
} from "../api/client";
import { SpecLineagePanel } from "../features/shell/SpecLineagePanel";

vi.mock("../api/client", () => ({
  getTaskSpecArtifactDiff: vi.fn(),
  listRunTasks: vi.fn(),
  listSessionRounds: vi.fn(),
  listSpecCheckpointEvaluations: vi.fn(),
  listTaskSpecArtifacts: vi.fn(),
}));

const getTaskSpecArtifactDiffMock = vi.mocked(getTaskSpecArtifactDiff);
const listRunTasksMock = vi.mocked(listRunTasks);
const listSessionRoundsMock = vi.mocked(listSessionRounds);
const listSpecCheckpointEvaluationsMock = vi.mocked(
  listSpecCheckpointEvaluations,
);
const listTaskSpecArtifactsMock = vi.mocked(listTaskSpecArtifacts);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpecLineagePanel", () => {
  it("loads the latest run task spec timeline and diff viewer", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          created_at: "2026-06-25T08:00:00Z",
          run_id: "run-old",
          run_updated_at: "2026-06-25T08:10:00Z",
        },
        {
          created_at: "2026-06-25T09:00:00Z",
          run_id: "run-new",
          run_updated_at: "2026-06-25T09:20:00Z",
        },
      ],
      next_cursor: null,
    });
    listRunTasksMock.mockResolvedValue({
      tasks: [
        {
          spec: null,
          task_id: "task-plain",
          title: "No spec",
        },
        {
          spec_artifact_id: "spec-2",
          task_id: "task-spec",
          title: "Implement checkout",
        },
      ],
    });
    listTaskSpecArtifactsMock.mockResolvedValue({
      task_id: "task-spec",
      versions: [
        {
          artifact_id: "spec-1",
          created_at: "2026-06-25T09:05:00Z",
          session_id: "session-1",
          task_id: "task-spec",
          trace_id: "run-new",
          updated_at: "2026-06-25T09:05:00Z",
          version: 1,
        },
        {
          artifact_id: "spec-2",
          created_at: "2026-06-25T09:12:00Z",
          session_id: "session-1",
          task_id: "task-spec",
          trace_id: "run-new",
          updated_at: "2026-06-25T09:12:00Z",
          version: 2,
        },
      ],
    });
    listSpecCheckpointEvaluationsMock.mockResolvedValue({
      evaluations: [
        {
          artifact_id: "spec-2",
          checkpoint_seq: 3,
          created_at: "2026-06-25T09:18:00Z",
          drift_detected: false,
          evaluation_id: "eval-1",
          evaluator: "reviewer",
          overall_score: 4.25,
          session_id: "session-1",
          summary: "Still aligned",
          task_id: "task-spec",
          trace_id: "run-new",
        },
      ],
      task_id: "task-spec",
    });
    getTaskSpecArtifactDiffMock.mockResolvedValue({
      field_changes: [
        {
          added_items: ["Keep checkout stable"],
          change_type: "modified",
          field_label: "Requirements",
          field_name: "requirements",
          removed_items: ["Draft checkout"],
        },
      ],
      from_artifact_id: "spec-1",
      from_version: 1,
      has_changes: true,
      summary: "Scope tightened",
      task_id: "task-spec",
      to_artifact_id: "spec-2",
      to_version: 2,
    });

    renderPanel("session-1");

    expect(await screen.findByText("Spec lineage")).toBeVisible();
    expect(await screen.findByText("Implement checkout (task-spec)")).toBeVisible();
    expect(screen.queryByText("No spec (task-plain)")).not.toBeInTheDocument();

    expect(await screen.findByRole("button", { name: /v2/ })).toBeVisible();
    expect(await screen.findByText("Still aligned")).toBeVisible();
    expect(await screen.findByText("Requirements")).toBeVisible();
    const diff = screen.getByText((_content, element) => {
      return (
        element?.tagName === "PRE" &&
        element.textContent?.includes("+ Keep checkout stable") === true &&
        element.textContent.includes("- Draft checkout")
      );
    });
    expect(diff).toBeVisible();

    await waitFor(() => {
      expect(listRunTasksMock).toHaveBeenCalledWith("run-new", true);
      expect(listTaskSpecArtifactsMock).toHaveBeenCalledWith("task-spec");
      expect(listSpecCheckpointEvaluationsMock).toHaveBeenCalledWith("task-spec");
      expect(getTaskSpecArtifactDiffMock).toHaveBeenCalledWith("task-spec", 2, 1);
    });
  });

  it("keeps empty session state inside the panel", () => {
    renderPanel(null);

    expect(screen.getByText("Select a session to inspect spec lineage")).toBeVisible();
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
  });
});

function renderPanel(sessionId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <TestProviders queryClient={queryClient}>
      <SpecLineagePanel sessionId={sessionId} />
    </TestProviders>,
  );
}

function TestProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
