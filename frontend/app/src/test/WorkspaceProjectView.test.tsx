import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(await screen.findByRole("button", { name: "wsl-home" })).toBeVisible();
    expect(await screen.findByRole("tab", { name: "Changes 1" })).toHaveAttribute(
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

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() =>
      expect(openWorkspaceRootMock).toHaveBeenCalledWith("workspace-1", "default"),
    );
  });

  it("announces directory loading and keeps disclosure state accessible", async () => {
    type WorkspaceTreeResult = Awaited<ReturnType<typeof getWorkspaceTree>>;
    let resolveDirectory: (value: WorkspaceTreeResult) => void = () => undefined;
    const directoryPromise = new Promise<WorkspaceTreeResult>((resolve) => {
      resolveDirectory = resolve;
    });
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
    getWorkspaceTreeMock.mockImplementation((_workspaceId, path = ".") => {
      if (path === "src") {
        return directoryPromise;
      }
      return Promise.resolve({
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
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      diff_files: [],
    });

    renderProjectView();

    const directoryButton = await screen.findByRole("button", {
      name: "Toggle directory src",
    });
    expect(directoryButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(directoryButton);

    expect(directoryButton).toHaveAttribute("aria-expanded", "true");
    expect(directoryButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading directory...");
    expect(directoryButton.nextElementSibling).toHaveAttribute("aria-hidden", "false");
    expect(directoryButton.nextElementSibling).toHaveClass("is-expanded");

    await act(async () => {
      resolveDirectory({
        workspace_id: "workspace-1",
        mount_name: "default",
        directory_path: "src",
        children: [
          {
            name: "index.ts",
            path: "src/index.ts",
            kind: "file",
            has_children: false,
          },
        ],
      });
    });

    expect(await screen.findByText("index.ts")).toBeVisible();
    expect(directoryButton).toHaveAttribute("aria-busy", "false");

    fireEvent.click(directoryButton);
    expect(directoryButton).toHaveAttribute("aria-expanded", "false");
    expect(directoryButton.nextElementSibling).toHaveAttribute("aria-hidden", "true");
    expect(directoryButton.nextElementSibling).not.toHaveClass("is-expanded");
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

  it("shows a friendly non-git changes empty state", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/Users/yex/Desktop",
        display_name: "Desktop",
      },
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      workspace_id: "workspace-1",
      default_mount_name: "default",
      default_mount_root: "C:/Users/yex/Desktop",
      tree: {
        name: ".",
        path: ".",
        kind: "directory",
        children: [
          {
            name: "Firefox.exe",
            path: "Firefox.exe",
            kind: "file",
            has_children: false,
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
          name: "Firefox.exe",
          path: "Firefox.exe",
          kind: "file",
          has_children: false,
        },
      ],
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/Users/yex/Desktop",
      is_git_repository: false,
      git_root_path: null,
      diff_message: null,
      diff_files: [],
    });
    getWorkspaceFileContentMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      path: "Firefox.exe",
      content: "",
      encoding: "binary",
      is_binary: true,
      truncated: false,
      size_bytes: 100,
    });

    renderProjectView();

    fireEvent.click(await screen.findByRole("button", { name: "Open file Firefox.exe" }));
    expect(await screen.findByText("Binary file preview unavailable")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Changes 0" }));

    expect(await screen.findByText("This mount is not a Git repository.")).toBeVisible();
    expect(screen.queryByText("No workspace changes.")).not.toBeInTheDocument();
    expect(screen.getByText("No changed file selected.")).toBeVisible();
  });

  it("prefers the backend non-git diff message", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/alpha-project",
        display_name: "Alpha",
      },
    ]);
    getWorkspaceSnapshotMock.mockResolvedValue({
      workspace_id: "workspace-1",
      default_mount_name: "default",
      default_mount_root: "C:/work/alpha-project",
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
      root_path: "C:/work/alpha-project",
      is_git_repository: false,
      git_root_path: null,
      diff_message: "Git command timed out while inspecting changes.",
      diff_files: [],
    });

    renderProjectView();

    fireEvent.click(await screen.findByRole("tab", { name: "Changes 0" }));

    expect(
      await screen.findByText("Git command timed out while inspecting changes."),
    ).toBeVisible();
    expect(screen.queryByText("This mount is not a Git repository.")).not.toBeInTheDocument();
  });

  it("reloads the selected file preview", async () => {
    let snapshotRequests = 0;
    let fileRequests = 0;
    listWorkspacesMock.mockResolvedValue([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
        display_name: "Agent Teams",
      },
    ]);
    getWorkspaceSnapshotMock.mockImplementation(() => {
      snapshotRequests += 1;
      return Promise.resolve({
        workspace_id: "workspace-1",
        default_mount_name: "default",
        default_mount_root: "C:/work/agent-teams",
        tree: {
          name: ".",
          path: ".",
          kind: "directory",
          children: [
            {
              name: "README.md",
              path: "README.md",
              kind: "file",
              has_children: false,
            },
          ],
        },
      });
    });
    getWorkspaceTreeMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      directory_path: ".",
      children: [
        {
          name: "README.md",
          path: "README.md",
          kind: "file",
          has_children: false,
        },
      ],
    });
    getWorkspaceDiffsMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      root_path: "C:/work/agent-teams",
      is_git_repository: true,
      git_root_path: "C:/work/agent-teams",
      diff_message: null,
      diff_files: [],
    });
    getWorkspaceFileContentMock.mockImplementation((_workspaceId, path, mountName) => {
      fileRequests += 1;
      return Promise.resolve({
        workspace_id: "workspace-1",
        mount_name: mountName ?? "default",
        path,
        content: `file version ${fileRequests}`,
        encoding: "utf-8",
        is_binary: false,
        truncated: false,
        size_bytes: 14,
      });
    });

    renderProjectView();

    fireEvent.click(await screen.findByRole("button", { name: "Open file README.md" }));

    expect(await screen.findByText("file version 1")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reload workspace view" }));

    await waitFor(() => {
      expect(fileRequests).toBeGreaterThanOrEqual(2);
    });
    expect(await screen.findByText(`file version ${fileRequests}`)).toBeVisible();
    expect(snapshotRequests).toBeGreaterThanOrEqual(2);
    expect(getWorkspaceFileContentMock).toHaveBeenLastCalledWith(
      "workspace-1",
      "README.md",
      "default",
    );
  });

  it("reserves the changes view for change navigation and keeps browsing in files", async () => {
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
    getWorkspaceFileContentMock.mockResolvedValue({
      workspace_id: "workspace-1",
      mount_name: "default",
      path: "frontend/app/src/App.tsx",
      content: "export function App() {}",
      encoding: "utf-8",
      is_binary: false,
      truncated: false,
      size_bytes: 24,
    });

    renderProjectView();

    expect(await screen.findByText("+changed")).toBeVisible();
    const diffLine = screen.getByText("+changed").closest(".at-workspace-diff-line");
    expect(diffLine).not.toBeNull();
    expect(diffLine?.parentElement).toHaveClass("at-workspace-diff-canvas");
    expect(screen.getByRole("region", { name: "changes" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Diff preview" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "File tree" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter files...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    const filter = await screen.findByLabelText("Filter files...");
    fireEvent.change(filter, { target: { value: "App" } });

    const result = await screen.findByRole("button", {
      name: "Open file frontend/app/src/App.tsx",
    });
    fireEvent.click(result);

    expect(await screen.findByText("export function App() {}")).toBeVisible();
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

    expect(await screen.findByRole("button", { name: "打开文件夹" })).toBeVisible();
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
