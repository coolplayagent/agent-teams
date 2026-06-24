import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listWorkspaces,
  openWorkspaceRoot,
  searchWorkspacePaths,
} from "../api/client";
import { WorkspaceProjectView } from "../features/workspaces/WorkspaceProjectView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getWorkspaceDiffFile: vi.fn(),
  getWorkspaceDiffs: vi.fn(),
  getWorkspaceSnapshot: vi.fn(),
  getWorkspaceTree: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspaceRoot: vi.fn(),
  searchWorkspacePaths: vi.fn(),
}));

const getWorkspaceDiffFileMock = vi.mocked(getWorkspaceDiffFile);
const getWorkspaceDiffsMock = vi.mocked(getWorkspaceDiffs);
const getWorkspaceSnapshotMock = vi.mocked(getWorkspaceSnapshot);
const getWorkspaceTreeMock = vi.mocked(getWorkspaceTree);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const openWorkspaceRootMock = vi.mocked(openWorkspaceRoot);
const searchWorkspacePathsMock = vi.mocked(searchWorkspacePaths);

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
  it("renders a V1-shaped workspace workbench with real file and diff data", async () => {
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
            name: "default",
            path: "default",
            kind: "directory",
            has_children: true,
          },
          {
            name: "wsl-home",
            path: "wsl-home",
            kind: "directory",
            has_children: true,
          },
        ],
      },
    });
    getWorkspaceTreeMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      directory_path: ".",
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
    getWorkspaceDiffFileMock.mockResolvedValue({
      mount_name: "default",
      path: "frontend/app/src/App.tsx",
      change_type: "modified",
      diff: "--- a/frontend/app/src/App.tsx\n+++ b/frontend/app/src/App.tsx\n@@ -1 +1 @@\n-old\n+new",
      is_binary: false,
    });
    openWorkspaceRootMock.mockResolvedValue({ status: "ok" });

    renderProjectView();

    expect(await screen.findByText("Agent Teams")).toBeVisible();
    expect(screen.getByText("Mount")).toBeVisible();
    expect(screen.getByRole("button", { name: "wsl-home" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Changes 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("frontend/app/src/App.tsx")).toBeVisible();
    expect(await screen.findByText("+new")).toBeVisible();
    expect(screen.getByText("-old")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    expect(await screen.findByText("frontend")).toBeVisible();
    expect(screen.getByText("README.md")).toBeVisible();
    expect(getWorkspaceTreeMock).toHaveBeenCalledWith(
      "workspace-1",
      ".",
      "default",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Open folder" })[0]);

    await waitFor(() =>
      expect(openWorkspaceRootMock).toHaveBeenCalledWith("workspace-1", "default"),
    );
  });

  it("loads the selected changed file diff", async () => {
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
            name: "default",
            path: "default",
            kind: "directory",
            has_children: true,
          },
        ],
      },
    });
    getWorkspaceTreeMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      directory_path: ".",
      children: [
        {
          name: "src",
          path: "src",
          kind: "directory",
          has_children: true,
        },
      ],
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: [
        {
          path: "src/file-1.ts",
          change_type: "modified",
        },
        {
          path: "src/file-2.ts",
          change_type: "added",
        },
      ],
    });
    getWorkspaceDiffFileMock
      .mockResolvedValueOnce({
        mount_name: "default",
        path: "src/file-1.ts",
        change_type: "modified",
        diff: "--- a/src/file-1.ts\n+++ b/src/file-1.ts\n+first",
        is_binary: false,
      })
      .mockResolvedValueOnce({
        mount_name: "default",
        path: "src/file-2.ts",
        change_type: "added",
        diff: "--- a/src/file-2.ts\n+++ b/src/file-2.ts\n+second",
        is_binary: false,
      });

    renderProjectView();

    expect(await screen.findByText("src/file-1.ts")).toBeVisible();
    expect(await screen.findByText("+first")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "added src/file-2.ts" }));

    expect(await screen.findByText("+second")).toBeVisible();
    expect(getWorkspaceDiffFileMock).toHaveBeenLastCalledWith(
      "workspace-1",
      "src/file-2.ts",
      "default",
    );
  });

  it("filters the workspace file tree and opens a changed result", async () => {
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
            name: "default",
            path: "default",
            kind: "directory",
            has_children: true,
          },
        ],
      },
    });
    getWorkspaceTreeMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      directory_path: ".",
      children: [
        {
          name: "src",
          path: "src",
          kind: "directory",
          has_children: true,
        },
      ],
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
    getWorkspaceDiffFileMock.mockResolvedValue({
      mount_name: "default",
      path: "frontend/app/src/App.tsx",
      change_type: "modified",
      diff: "--- a/frontend/app/src/App.tsx\n+++ b/frontend/app/src/App.tsx\n+changed",
      is_binary: false,
    });
    searchWorkspacePathsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      query: "App",
      results: [
        {
          name: "App.tsx",
          path: "frontend/app/src/App.tsx",
          kind: "file",
          mount_name: "default",
        },
      ],
    });

    renderProjectView();

    const filter = await screen.findByLabelText("Filter files...");
    fireEvent.change(filter, { target: { value: "App" } });

    expect(await screen.findByText("App.tsx")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open changed file frontend/app/src/App.tsx",
      }),
    );

    expect(await screen.findByText("+changed")).toBeVisible();
    expect(searchWorkspacePathsMock).toHaveBeenCalledWith(
      "workspace-1",
      "App",
      80,
      "default",
    );
  });

  it("localizes the project workbench shell actions in Chinese", async () => {
    useUiStore.setState({ language: "zh-CN" });
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
            name: "default",
            path: "default",
            kind: "directory",
            has_children: true,
          },
        ],
      },
    });
    getWorkspaceTreeMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      directory_path: ".",
      children: [],
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: [],
    });

    renderProjectView();

    expect(await screen.findAllByRole("button", { name: "打开文件夹" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "刷新工作区视图" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "文件" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "变更 0" })).toBeVisible();
    expect(screen.getByText("挂载")).toBeVisible();
  });
});

function renderProjectView() {
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
            onBack={vi.fn()}
            selectedWorkspaceId="workspace-1"
          />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
