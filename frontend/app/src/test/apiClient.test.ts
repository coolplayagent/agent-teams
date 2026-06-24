import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteSession,
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceFileContent,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listSshProfiles,
  listSessionRounds,
  listWorkspaces,
  openWorkspaceRoot,
  probeWebConnectivity,
  reloadProxyConfig,
  saveNotificationConfig,
  saveProxyConfig,
  saveWebConfig,
  searchWorkspacePaths,
  stopBackgroundTask,
  updateSession,
  updateWorkspace,
} from "../api/client";
import { saveSpeechConfig } from "../api/speech";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("normalizes paginated workspace responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              workspace_id: "workspace-1",
              root_path: "C:/work/agent-teams",
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listWorkspaces()).resolves.toEqual([
      {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces?limit=200",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("updates and deletes sessions through the session metadata endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateSession("session-1", { title: "Readable name" }),
    ).resolves.toEqual({ status: "ok" });
    await expect(deleteSession("session-1")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/sessions/session-1",
      expect.objectContaining({
        body: JSON.stringify({ title: "Readable name" }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/session-1",
      expect.objectContaining({
        body: JSON.stringify({ cascade: true, force: true }),
        method: "DELETE",
      }),
    );
  });

  it("stops background tasks through the run background task endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          background_task: {
            background_task_id: "background-task-1",
            run_id: "run-1",
            command: "npm test",
            cwd: "C:/work/agent-teams",
            status: "stopped",
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      stopBackgroundTask("run-1", "background-task-1"),
    ).resolves.toMatchObject({
      background_task: {
        background_task_id: "background-task-1",
        status: "stopped",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs/run-1/background-tasks/background-task-1:stop",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
  });

  it("lists session rounds through the paginated rounds endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          has_more: false,
          items: [{ run_id: "run-1" }],
          next_cursor: null,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listSessionRounds("session-1", { cursorRunId: "run-2", limit: 50 }),
    ).resolves.toMatchObject({
      items: [{ run_id: "run-1" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/rounds?limit=50&cursor_run_id=run-2",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("reads and updates workspace project view data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace_id: "workspace-1",
            default_mount_name: "default",
            default_mount_root: "C:/work/agent-teams",
            tree: {
              name: ".",
              path: ".",
              kind: "directory",
              children: [],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace_id: "workspace-1",
            query: "file",
            results: [
              {
                name: "file.ts",
                path: "src/file.ts",
                kind: "file",
                mount_name: "default",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace_id: "workspace-1",
            mount_name: "default",
            root_path: "C:/work/agent-teams",
            diff_files: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mount_name: "default",
            path: "src/file.ts",
            change_type: "modified",
            diff: "+changed",
            is_binary: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace_id: "workspace-1",
            mount_name: "default",
            path: "src/file.ts",
            content: "export const value = 1;\n",
            encoding: "utf-8",
            is_binary: false,
            truncated: false,
            size_bytes: 24,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspace_id: "workspace-1",
            root_path: "C:/work/agent-teams",
            default_mount_name: "docs",
            mounts: [
              {
                mount_name: "docs",
                provider: "local",
                provider_config: {
                  root_path: "C:/work/agent-teams/docs",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceSnapshot("workspace-1")).resolves.toMatchObject({
      workspace_id: "workspace-1",
    });
    await expect(
      getWorkspaceTree("workspace-1", ".", "default"),
    ).resolves.toMatchObject({
      children: [expect.objectContaining({ path: "src" })],
    });
    await expect(
      searchWorkspacePaths("workspace-1", "file", 40, "default"),
    ).resolves.toMatchObject({
      results: [expect.objectContaining({ path: "src/file.ts" })],
    });
    await expect(getWorkspaceDiffs("workspace-1", "default")).resolves.toMatchObject({
      root_path: "C:/work/agent-teams",
    });
    await expect(
      getWorkspaceDiffFile("workspace-1", "src/file.ts", "default"),
    ).resolves.toMatchObject({
      diff: "+changed",
      path: "src/file.ts",
    });
    await expect(
      getWorkspaceFileContent("workspace-1", "src/file.ts", "default"),
    ).resolves.toMatchObject({
      content: "export const value = 1;\n",
      path: "src/file.ts",
    });
    await expect(openWorkspaceRoot("workspace-1", "default")).resolves.toEqual({
      status: "ok",
    });
    await expect(
      updateWorkspace("workspace-1", {
        default_mount_name: "docs",
        mounts: [
          {
            mount_name: "docs",
            provider: "local",
            provider_config: {
              root_path: "C:/work/agent-teams/docs",
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      default_mount_name: "docs",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace-1/snapshot",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace-1/tree?path=.&mount=default",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/workspaces/workspace-1/search?query=file&limit=40&mount=default",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/workspaces/workspace-1/diffs?mount=default",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/workspaces/workspace-1/diff?path=src%2Ffile.ts&mount=default",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/workspaces/workspace-1/file?path=src%2Ffile.ts&mount=default",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/workspaces/workspace-1:open-root?mount=default",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/workspaces/workspace-1",
      expect.objectContaining({
        body: JSON.stringify({
          default_mount_name: "docs",
          mounts: [
            {
              mount_name: "docs",
              provider: "local",
              provider_config: {
                root_path: "C:/work/agent-teams/docs",
              },
            },
          ],
        }),
        method: "PUT",
        headers: expect.any(Headers),
      }),
    );
  });

  it("lists SSH profiles through the workspace settings endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ssh_profile_id: "devbox",
            host: "dev.example.com",
            username: "yex",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listSshProfiles()).resolves.toEqual([
      {
        ssh_profile_id: "devbox",
        host: "dev.example.com",
        username: "yex",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/system/configs/workspace/ssh-profiles",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("saves Web, notification, proxy, and speech settings through their config endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveWebConfig({
        exa_api_key: "secret",
        fallback_provider: "searxng",
        provider: "exa",
        searxng_instance_url: "https://search.example/",
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(
      saveNotificationConfig({
        monitor_triggered: {
          channels: ["browser", "toast"],
          enabled: true,
        },
        run_completed: {
          channels: ["feishu", "toast"],
          enabled: true,
        },
        run_failed: {
          channels: ["browser", "toast"],
          enabled: true,
        },
        run_stopped: {
          channels: ["toast"],
          enabled: false,
        },
        tool_approval_requested: {
          channels: ["browser", "toast"],
          enabled: true,
        },
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(
      saveProxyConfig({
        all_proxy: "socks5://proxy.example:1080",
        http_proxy: "http://proxy.example:8080",
        https_proxy: "http://proxy.example:8443",
        no_proxy: "localhost,127.0.0.1",
        proxy_password: "secret",
        proxy_username: "alice",
        ssl_verify: false,
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(reloadProxyConfig()).resolves.toEqual({ status: "ok" });
    await expect(
      probeWebConnectivity({
        proxy_override: {
          http_proxy: "http://proxy.example:8080",
          proxy_password: "secret",
          proxy_username: "alice",
          ssl_verify: false,
        },
        timeout_ms: 2500,
        url: "https://example.com",
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(
      saveSpeechConfig({
        language: "zh-CN",
        prompt: "domain terms",
        stt_profile_name: "alibaba-cn-qwen3-omni-flash",
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/web",
      expect.objectContaining({
        body: JSON.stringify({
          exa_api_key: "secret",
          fallback_provider: "searxng",
          provider: "exa",
          searxng_instance_url: "https://search.example/",
        }),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/notifications",
      expect.objectContaining({
        body: expect.stringContaining('"config"'),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/proxy",
      expect.objectContaining({
        body: JSON.stringify({
          all_proxy: "socks5://proxy.example:1080",
          http_proxy: "http://proxy.example:8080",
          https_proxy: "http://proxy.example:8443",
          no_proxy: "localhost,127.0.0.1",
          proxy_password: "secret",
          proxy_username: "alice",
          ssl_verify: false,
        }),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/proxy:reload",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/configs/web:probe",
      expect.objectContaining({
        body: JSON.stringify({
          proxy_override: {
            http_proxy: "http://proxy.example:8080",
            proxy_password: "secret",
            proxy_username: "alice",
            ssl_verify: false,
          },
          timeout_ms: 2500,
          url: "https://example.com",
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/speech/config",
      expect.objectContaining({
        body: JSON.stringify({
          language: "zh-CN",
          prompt: "domain terms",
          stt_profile_name: "alibaba-cn-qwen3-omni-flash",
        }),
        method: "PUT",
      }),
    );
  });
});
