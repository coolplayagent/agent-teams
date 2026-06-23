import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getWorkspaceDiffs,
  getWorkspaceSnapshot,
  listSessionRounds,
  listWorkspaces,
  openWorkspaceRoot,
  saveNotificationConfig,
  saveWebConfig,
  stopBackgroundTask,
} from "../api/client";

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

  it("reads workspace project view data and opens the workspace root", async () => {
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
            root_path: "C:/work/agent-teams",
            diff_files: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceSnapshot("workspace-1")).resolves.toMatchObject({
      workspace_id: "workspace-1",
    });
    await expect(getWorkspaceDiffs("workspace-1")).resolves.toMatchObject({
      root_path: "C:/work/agent-teams",
    });
    await expect(openWorkspaceRoot("workspace-1")).resolves.toEqual({
      status: "ok",
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
      "/api/workspaces/workspace-1/diffs",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/workspaces/workspace-1:open-root",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
  });

  it("saves Web and notification settings through their system config endpoints", async () => {
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
  });
});
