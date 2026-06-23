import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceDiffs,
  getWorkspaceSnapshot,
  listWorkspaces,
  openWorkspaceRoot,
} from "../api/client";
import type { SessionSidebarRecord } from "../api/contracts";
import { WorkspaceProjectView } from "../features/workspaces/WorkspaceProjectView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getWorkspaceDiffs: vi.fn(),
  getWorkspaceSnapshot: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspaceRoot: vi.fn(),
}));

const getWorkspaceDiffsMock = vi.mocked(getWorkspaceDiffs);
const getWorkspaceSnapshotMock = vi.mocked(getWorkspaceSnapshot);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const openWorkspaceRootMock = vi.mocked(openWorkspaceRoot);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useUiStore.setState({
    language: "en",
    selectedSessionId: null,
    selectedWorkspaceId: null,
  });
  vi.clearAllMocks();
});

describe("WorkspaceProjectView", () => {
  it("renders real workspace snapshot, changes, sessions, and actions", async () => {
    const onBack = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      workspace_id: "workspace-1",
      default_mount_name: "default",
      default_mount_root: "C:/work/agent-teams",
      tree: {
        name: ".",
        path: ".",
        kind: "directory",
        children: [
          {
            name: "frontend",
            path: "frontend",
            kind: "directory",
            has_children: true,
          },
          {
            name: "README.md",
            path: "README.md",
            kind: "file",
          },
        ],
      },
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: [
        {
          path: "frontend/app/src/App.tsx",
          change_type: "modified",
        },
      ],
    });
    openWorkspaceRootMock.mockResolvedValue({ status: "ok" });

    renderProjectView(onBack);

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.getAllByText("C:/work/agent-teams")).toHaveLength(2);
    expect(await screen.findByText("frontend")).toBeVisible();
    expect(screen.getByText("README.md")).toBeVisible();
    expect(screen.getByText("modified")).toBeVisible();
    expect(screen.getByText("frontend/app/src/App.tsx")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() =>
      expect(openWorkspaceRootMock).toHaveBeenCalledWith("workspace-1"),
    );

    fireEvent.click(screen.getByText("Workspace session"));

    expect(useUiStore.getState().selectedSessionId).toBe("session-1");
    expect(useUiStore.getState().selectedWorkspaceId).toBe("workspace-1");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows capped counts and reveals later changes and sessions", async () => {
    const onBack = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      workspace_id: "workspace-1",
      default_mount_name: "default",
      default_mount_root: "C:/work/agent-teams",
      tree: {
        name: ".",
        path: ".",
        kind: "directory",
        children: [],
      },
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: Array.from({ length: 14 }, (_, index) => ({
        path: `src/file-${index + 1}.ts`,
        change_type: "modified" as const,
      })),
    });

    renderProjectView(
      onBack,
      Array.from({ length: 14 }, (_, index) => ({
        session_id: `session-${index + 1}`,
        title: `Workspace session ${index + 1}`,
        updated_at: "2026-06-23T10:00:00Z",
        workspace_id: "workspace-1",
      })),
    );

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(await screen.findByText("src/file-1.ts")).toBeVisible();
    expect(screen.getAllByText("12/14")).toHaveLength(2);
    expect(screen.queryByText("src/file-14.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace session 14")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Show all sessions" }));

    expect(screen.getByText("src/file-14.ts")).toBeVisible();
    fireEvent.click(screen.getByText("Workspace session 14"));

    expect(useUiStore.getState().selectedSessionId).toBe("session-14");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("localizes the project view shell actions in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
    const onBack = vi.fn();
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      workspace_id: "workspace-1",
      default_mount_name: "default",
      default_mount_root: "C:/work/agent-teams",
      tree: {
        name: ".",
        path: ".",
        kind: "directory",
        children: [],
      },
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: [],
    });

    renderProjectView(onBack);

    expect(await screen.findByRole("button", { name: "打开文件夹" })).toBeVisible();
    expect(screen.getByRole("button", { name: "刷新工作区视图" })).toBeVisible();
    expect(screen.getByText("工作区")).toBeVisible();
    expect(screen.getByText("文件")).toBeVisible();
    expect(screen.getByText("变更")).toBeVisible();
    expect(screen.getByText("会话")).toBeVisible();
  });
});

function renderProjectView(
  onBack: () => void,
  sessions: SessionSidebarRecord[] = [
    {
      session_id: "session-1",
      title: "Workspace session",
      updated_at: "2026-06-23T10:00:00Z",
      workspace_id: "workspace-1",
    },
  ],
) {
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
      <ConfigProvider>
        <AntApp>
          <WorkspaceProjectView
            onBack={onBack}
            selectedWorkspaceId="workspace-1"
            sessions={sessions}
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
