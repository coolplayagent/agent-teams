import { afterEach, describe, expect, it, vi } from "vitest";

import { listSessionRounds, listWorkspaces, stopBackgroundTask } from "../api/client";

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
});
