import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceFileContent,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listSshProfiles,
  listWorkspaces,
  openWorkspaceRoot,
  searchWorkspacePaths,
  updateWorkspace,
} from "../api/client";
import { WorkspaceProjectView } from "../features/workspaces/WorkspaceProjectView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  getWorkspaceDiffFile: vi.fn(),
  getWorkspaceDiffs: vi.fn(),
  getWorkspaceFileContent: vi.fn(),
  getWorkspaceSnapshot: vi.fn(),
  getWorkspaceTree: vi.fn(),
  listSshProfiles: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspaceRoot: vi.fn(),
  searchWorkspacePaths: vi.fn(),
  updateWorkspace: vi.fn(),
}));

const getWorkspaceDiffFileMock = vi.mocked(getWorkspaceDiffFile);
const getWorkspaceDiffsMock = vi.mocked(getWorkspaceDiffs);
const getWorkspaceFileContentMock = vi.mocked(getWorkspaceFileContent);
const getWorkspaceSnapshotMock = vi.mocked(getWorkspaceSnapshot);
const getWorkspaceTreeMock = vi.mocked(getWorkspaceTree);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const openWorkspaceRootMock = vi.mocked(openWorkspaceRoot);
const searchWorkspacePathsMock = vi.mocked(searchWorkspacePaths);
const updateWorkspaceMock = vi.mocked(updateWorkspace);

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
    getWorkspaceTreeMock.mockImplementation((_workspaceId, path = ".") =>
      Promise.resolve({
        workspace_id: "workspace-1",
        mount_name: "default",
        directory_path: path,
        children:
          path === "frontend"
            ? [
                {
                  name: "src",
                  path: "frontend/src",
                  kind: "directory",
                  has_children: true,
                },
              ]
            : [
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
      }),
    );
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
    getWorkspaceFileContentMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      path: "README.md",
      content: "# Agent Teams\n\nProject docs.",
      encoding: "utf-8",
      is_binary: false,
      truncated: false,
      size_bytes: 27,
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
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle directory frontend" }),
    );

    expect(await screen.findByText("src")).toBeVisible();
    expect(getWorkspaceTreeMock).toHaveBeenCalledWith(
      "workspace-1",
      "frontend",
      "default",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open file README.md" }));

    expect(await screen.findByText("# Agent Teams")).toBeVisible();
    expect(getWorkspaceFileContentMock).toHaveBeenCalledWith(
      "workspace-1",
      "README.md",
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

    expect(await screen.findByText("+changed")).toBeVisible();

    const filter = screen.getByLabelText("Filter files...");
    fireEvent.change(filter, { target: { value: "App" } });

    const result = await screen.findByRole("button", {
        name: "Open changed file frontend/app/src/App.tsx",
    });
    fireEvent.click(result);

    expect(await screen.findByText("+changed")).toBeVisible();
    expect(searchWorkspacePathsMock).toHaveBeenCalledWith(
      "workspace-1",
      "App",
      80,
      "default",
    );
  });

  it("adds a local mount through the workspace update endpoint", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        default_mount_name: "default",
        display_name: "Agent Teams",
        mounts: [
          {
            mount_name: "default",
            provider: "local",
            provider_config: { root_path: "C:/work/agent-teams" },
          },
        ],
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
    updateWorkspaceMock.mockResolvedValue({
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
      default_mount_name: "docs",
      mounts: [
        {
          mount_name: "default",
          provider: "local",
          provider_config: { root_path: "C:/work/agent-teams" },
        },
        {
          mount_name: "docs",
          provider: "local",
          provider_config: { root_path: "C:/work/agent-teams/docs" },
        },
      ],
    });

    renderProjectView();

    fireEvent.click(await screen.findByRole("button", { name: "Add mount" }));
    fireEvent.change(screen.getByLabelText("Mount name"), {
      target: { value: "docs" },
    });
    fireEvent.change(screen.getByLabelText("Local root"), {
      target: { value: "C:/work/agent-teams/docs" },
    });
    fireEvent.click(screen.getByLabelText("Use as default mount"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateWorkspaceMock).toHaveBeenCalledWith("workspace-1", {
        default_mount_name: "docs",
        mounts: [
          {
            mount_name: "default",
            provider: "local",
            provider_config: { root_path: "C:/work/agent-teams" },
          },
          {
            mount_name: "docs",
            provider: "local",
            provider_config: { root_path: "C:/work/agent-teams/docs" },
          },
        ],
      }),
    );
  });

  it("removes the active mount after confirmation", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        default_mount_name: "default",
        display_name: "Agent Teams",
        mounts: [
          {
            mount_name: "default",
            provider: "local",
            provider_config: { root_path: "C:/work/agent-teams" },
          },
          {
            mount_name: "wsl-home",
            provider: "ssh",
            provider_config: {
              ssh_profile_id: "devbox",
              remote_root: "/home/yex/agent-teams",
            },
          },
        ],
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
    updateWorkspaceMock.mockResolvedValue({
      workspace_id: "workspace-1",
      root_path: "C:/work/agent-teams",
      default_mount_name: "wsl-home",
      mounts: [
        {
          mount_name: "wsl-home",
          provider: "ssh",
          provider_config: {
            ssh_profile_id: "devbox",
            remote_root: "/home/yex/agent-teams",
          },
        },
      ],
    });

    renderProjectView();

    fireEvent.click(await screen.findByRole("button", { name: "Remove mount" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(updateWorkspaceMock).toHaveBeenCalledWith("workspace-1", {
        default_mount_name: "wsl-home",
        mounts: [
          {
            mount_name: "wsl-home",
            provider: "ssh",
            provider_config: {
              ssh_profile_id: "devbox",
              remote_root: "/home/yex/agent-teams",
            },
          },
        ],
      }),
    );
  });

  it("opens the SSH profiles surface with real profile data", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        default_mount_name: "default",
        display_name: "Agent Teams",
        mounts: [
          {
            mount_name: "default",
            provider: "local",
            provider_config: { root_path: "C:/work/agent-teams" },
          },
        ],
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
    listSshProfilesMock.mockResolvedValue([
      {
        ssh_profile_id: "devbox",
        host: "dev.example.com",
        username: "yex",
        port: 22,
        has_password: true,
      },
    ]);

    renderProjectView();

    fireEvent.click(await screen.findByRole("button", { name: "SSH profiles" }));

    expect(await screen.findByText("dev.example.com · yex:22 · Password")).toBeInTheDocument();
    expect(screen.getAllByText("devbox").length).toBeGreaterThan(0);
    expect(listSshProfilesMock).toHaveBeenCalledTimes(1);
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
