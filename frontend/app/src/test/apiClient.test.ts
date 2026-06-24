import { afterEach, describe, expect, it, vi } from "vitest";

import {
  disableAutomationProject,
  deleteEnvironmentVariable,
  deleteSshProfile,
  enableAutomationProject,
  getAutomationProject,
  getEnvironmentVariables,
  getMemory,
  deleteSession,
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceFileContent,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  listAutomationProjectSessions,
  listAutomationProjects,
  listBoardTodos,
  listConnectors,
  listMemories,
  listSshProfiles,
  listSessionRounds,
  listWorkspaces,
  openWorkspaceRoot,
  probeSshProfileConnection,
  probeWebConnectivity,
  revealSshProfilePassword,
  reloadProxyConfig,
  saveEnvironmentVariable,
  saveNotificationConfig,
  saveProxyConfig,
  saveSshProfile,
  saveWebConfig,
  searchMemories,
  searchWorkspacePaths,
  stopBackgroundTask,
  rebuildMemoryIndex,
  runAutomationProject,
  syncBoardTodos,
  testConnector,
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

  it("lists and syncs board TODOs through board endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            board_workspace_id: "workspace-1",
            diagnostics: [],
            is_fork_view: false,
            items: [],
            repository_full_name: "openai/agent-teams",
            revision: 4,
            source_groups: [],
            status_counts: {
              archived: 0,
              done: 0,
              in_progress: 0,
              review: 0,
              todo: 0,
            },
            synced_at: null,
            view_workspace_id: "workspace-1",
            workspace_id: "workspace-1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            board_workspace_id: "workspace-1",
            diagnostics: [],
            is_fork_view: false,
            items: [],
            repository_full_name: "openai/agent-teams",
            revision: 5,
            source_groups: [],
            status_counts: {
              archived: 0,
              done: 0,
              in_progress: 0,
              review: 0,
              todo: 0,
            },
            synced_at: "2026-06-24T00:00:00Z",
            view_workspace_id: "workspace-1",
            workspace_id: "workspace-1",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listBoardTodos({ includeArchived: true, workspaceId: "workspace-1" }),
    ).resolves.toMatchObject({ revision: 4, workspace_id: "workspace-1" });
    await expect(
      syncBoardTodos({ includeArchived: false, workspaceId: "workspace-1" }),
    ).resolves.toMatchObject({ revision: 5, workspace_id: "workspace-1" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/boards/todos?workspace_id=workspace-1&include_archived=true",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/boards/todos:sync",
      expect.objectContaining({
        body: JSON.stringify({
          include_archived: false,
          workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
  });

  it("uses the automation project endpoints for list, detail, sessions, and actions", async () => {
    const projectPayload = {
      automation_project_id: "aut-1",
      created_at: "2026-06-24T00:00:00Z",
      delivery_events: [],
      display_name: "Daily triage",
      name: "daily_triage",
      prompt: "Summarize daily status.",
      run_config: { session_mode: "normal" },
      schedule_mode: "cron",
      status: "enabled",
      timezone: "UTC",
      trigger_id: "schedule-aut-1",
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "workspace-1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([projectPayload]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ session_id: "session-1" }]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            automation_project_id: "aut-1",
            queued: false,
            reused_bound_session: false,
            run_id: "run-1",
            session_id: "session-1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAutomationProjects()).resolves.toEqual([projectPayload]);
    await expect(getAutomationProject("aut-1")).resolves.toEqual(projectPayload);
    await expect(listAutomationProjectSessions("aut-1")).resolves.toEqual([
      { session_id: "session-1" },
    ]);
    await expect(runAutomationProject("aut-1")).resolves.toMatchObject({
      run_id: "run-1",
    });
    await expect(enableAutomationProject("aut-1")).resolves.toEqual(projectPayload);
    await expect(disableAutomationProject("aut-1")).resolves.toEqual(projectPayload);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/automation/projects",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/automation/projects/aut-1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/automation/projects/aut-1/sessions",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/automation/projects/aut-1:run",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/automation/projects/aut-1:enable",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/automation/projects/aut-1:disable",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
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

  it("lists and tests connectors through connector endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            summary: {
              connected: 1,
              disabled: 0,
              error: 0,
              needs_config: 0,
              total: 1,
            },
            items: [
              {
                account_count: 1,
                auth_type: "api_token",
                capabilities: ["repositories"],
                category: "development",
                connector_id: "github",
                description: "GitHub connector",
                display_name: "GitHub",
                enabled_count: 1,
                last_activity_at: null,
                last_error: null,
                provider: "github",
                status: "connected",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            account_count: 1,
            capabilities: ["repositories"],
            checked_at: "2026-06-24T00:00:00Z",
            checks: [],
            connector_id: "github",
            enabled_count: 1,
            last_error: null,
            login_active: null,
            message: "ok",
            ok: true,
            provider: "github",
            runtime_running: null,
            status: "connected",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConnectors()).resolves.toMatchObject({
      items: [expect.objectContaining({ connector_id: "github" })],
      summary: expect.objectContaining({ connected: 1 }),
    });
    await expect(testConnector("github")).resolves.toMatchObject({
      connector_id: "github",
      ok: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/connectors",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/connectors/github:test",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
  });

  it("lists, reads, searches, and rebuilds memories through memory endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
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
              },
            ],
            limit: 40,
            offset: 0,
            total_count: 1,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
            metadata: {},
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
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                entry: {
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
                },
                rank: 1,
                score: 0.87,
                snippet: "workspace pages fixed height",
              },
            ],
            total_count: 1,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            failed_count: 0,
            rebuilt_count: 1,
            scanned_count: 1,
            skipped_count: 0,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listMemories({
        kind: "constraint",
        scope: "workspace",
        status: "active",
        tier: "persistent",
        workspaceId: "workspace-1",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "memory-1" })],
      total_count: 1,
    });
    await expect(getMemory("workspace-1", "memory-1")).resolves.toMatchObject({
      content: expect.objectContaining({ title: "Fixed workspace frame" }),
      id: "memory-1",
    });
    await expect(
      searchMemories({
        min_confidence: 0,
        status: "active",
        text_query: "fixed",
        workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ score: 0.87 })],
    });
    await expect(rebuildMemoryIndex("workspace-1")).resolves.toMatchObject({
      rebuilt_count: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/memories?workspace_id=workspace-1&tier=persistent&scope=workspace&status=active&kind=constraint&limit=40&offset=0",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace-1/memories/memory-1",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/memories/search",
      expect.objectContaining({
        body: JSON.stringify({
          min_confidence: 0,
          status: "active",
          text_query: "fixed",
          workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/memories/rebuild-index",
      expect.objectContaining({
        body: JSON.stringify({ workspace_id: "workspace-1" }),
        headers: expect.any(Headers),
        method: "POST",
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

  it("manages SSH profiles through the workspace settings endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ssh_profile_id: "prod",
            host: "prod.example.com",
            username: "deploy",
            has_password: true,
            has_private_key: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ password: "secret" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checked_at: "2026-06-24T00:00:00Z",
            diagnostics: {
              binary_available: true,
              host_reachable: true,
              used_password: true,
              used_private_key: false,
              used_system_config: false,
            },
            host: "prod.example.com",
            latency_ms: 51,
            ok: true,
            username: "deploy",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveSshProfile("prod", {
        host: "prod.example.com",
        username: "deploy",
        password: "secret",
        port: 22,
        remote_shell: "/bin/bash",
        connect_timeout_seconds: 15,
        private_key: null,
        private_key_name: null,
      }),
    ).resolves.toMatchObject({
      ssh_profile_id: "prod",
      has_password: true,
    });
    await expect(revealSshProfilePassword("prod")).resolves.toEqual({
      password: "secret",
    });
    await expect(
      probeSshProfileConnection({
        ssh_profile_id: "prod",
        timeout_ms: 15000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      latency_ms: 51,
    });
    await expect(deleteSshProfile("prod")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/workspace/ssh-profiles/prod",
      expect.objectContaining({
        body: JSON.stringify({
          config: {
            host: "prod.example.com",
            username: "deploy",
            password: "secret",
            port: 22,
            remote_shell: "/bin/bash",
            connect_timeout_seconds: 15,
            private_key: null,
            private_key_name: null,
          },
        }),
        method: "PUT",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/workspace/ssh-profiles/prod:reveal-password",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/workspace/ssh-profiles:probe",
      expect.objectContaining({
        body: JSON.stringify({
          ssh_profile_id: "prod",
          timeout_ms: 15000,
        }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/workspace/ssh-profiles/prod",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.any(Headers),
      }),
    );
  });

  it("manages environment variables through the system config endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            app: [
              {
                key: "OPENAI_API_KEY",
                scope: "app",
                value: "saved-key",
                value_kind: "string",
              },
            ],
            system: [
              {
                key: "PATH",
                scope: "system",
                value: "C:/Windows/System32",
                value_kind: "expandable",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: "ANTHROPIC_API_KEY",
            scope: "app",
            value: "saved-anthropic-key",
            value_kind: "string",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getEnvironmentVariables()).resolves.toMatchObject({
      app: [expect.objectContaining({ key: "OPENAI_API_KEY" })],
      system: [expect.objectContaining({ key: "PATH" })],
    });
    await expect(
      saveEnvironmentVariable("app", "ANTHROPIC_API_KEY", {
        source_key: null,
        value: "saved-anthropic-key",
      }),
    ).resolves.toMatchObject({
      key: "ANTHROPIC_API_KEY",
      value: "saved-anthropic-key",
    });
    await expect(
      deleteEnvironmentVariable("app", "ANTHROPIC_API_KEY"),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/environment-variables",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/environment-variables/app/ANTHROPIC_API_KEY",
      expect.objectContaining({
        body: JSON.stringify({
          source_key: null,
          value: "saved-anthropic-key",
        }),
        method: "PUT",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/environment-variables/app/ANTHROPIC_API_KEY",
      expect.objectContaining({
        method: "DELETE",
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
