import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMemorySkillDraft,
  archiveBoardTodo,
  browseClawHubSkillMarket,
  addRuntimeToolsSystemPath,
  configurePlugin,
  createAutomationProject,
  createBoardTodoSource,
  createDiscordGatewayAccount,
  createFeishuGatewayAccount,
  deleteAutomationProject,
  deleteAgentRuntime,
  deleteBoardTodoSource,
  deleteDiscordGatewayAccount,
  deleteModelProfile,
  deletePlugin,
  deleteRoleConfig,
  deleteSessionSubagent,
  disableAutomationProject,
  disableDiscordGatewayAccount,
  disablePlugin,
  deleteFeishuGatewayAccount,
  deleteWeChatGatewayAccount,
  deleteXiaolubanGatewayAccount,
  deleteEnvironmentVariable,
  deleteSshProfile,
  deleteWorkspace,
  disableFeishuGatewayAccount,
  disableWeChatGatewayAccount,
  disableXiaolubanGatewayAccount,
  enableFeishuGatewayAccount,
  enableDiscordGatewayAccount,
  enableWeChatGatewayAccount,
  enableXiaolubanGatewayAccount,
  enableAutomationProject,
  enablePlugin,
  fetchXiaolubanGatewayImForwardingCommand,
  generateMemorySkillDrafts,
  getAgentRuntime,
  getAgentRuntimeRegistry,
  getAgentRuntimes,
  getAgentRuntimeTestJob,
  getClawHubConfig,
  getClawHubSkillMarketDetail,
  getConfigStatus,
  getAutomationProject,
  getEnvironmentVariables,
  getGitHubConfig,
  getGitHubWebhookTunnelStatus,
  getHooksConfig,
  listAutomationDeliveryBindings,
  listDiscordGatewayAccounts,
  listFeishuGatewayAccounts,
  listWeChatGatewayAccounts,
  getMemory,
  getMemorySkillDraft,
  getModelCatalog,
  getPluginsConfig,
  getRoleConfig,
  getTaskSpecArtifactDiff,
  getRuntimeToolDownload,
  getRuntimeSkillDetail,
  createXiaolubanGatewayAccount,
  deleteSession,
  fetchUiLanguageSettings,
  getWorkspaceDiffFile,
  getWorkspaceDiffs,
  getWorkspaceFileContent,
  getWorkspaceSnapshot,
  getWorkspaceTree,
  inspectPluginMarketplace,
  installAgentRuntimeFromRegistry,
  listAutomationProjectSessions,
  listAutomationProjects,
  listBoardTodos,
  listBoardTodoSources,
  listConnectors,
  listRoleConfigs,
  listRuntimeTools,
  listAgentMessages,
  listMemories,
  listMemorySkillDrafts,
  listSshProfiles,
  listSessionSubagents,
  listXiaolubanGatewayAccounts,
  listSessionRounds,
  listRunTasks,
  listSpecCheckpointEvaluations,
  listTaskSpecArtifacts,
  listWorkspaces,
  openWorkspaceRoot,
  pickWorkspace,
  probeModelConnection,
  probeSshProfileConnection,
  probeClawHubConnectivity,
  probeGitHubConnectivity,
  probeGitHubWebhookConnectivity,
  probeWebConnectivity,
  previewRequestChangesBoardTodo,
  prepareXiaolubanGatewayAccount,
  revealSshProfilePassword,
  revealGitHubToken,
  revealXiaolubanGatewayAccountToken,
  refreshAgentRuntimeRegistry,
  refreshModelCatalog,
  reloadModelConfig,
  reloadProxyConfig,
  reloadFeishuGateway,
  reloadWeChatGateway,
  reloadSkillsConfig,
  resolveToolApproval,
  resolveCommandPrompt,
  loadPluginMarketplace,
  saveEnvironmentVariable,
  saveAgentRuntime,
  saveClawHubConfig,
  saveGitHubConfig,
  saveHooksConfig,
  saveModelProfile,
  saveNotificationConfig,
  saveOrchestrationConfig,
  saveProxyConfig,
  saveRoleConfig,
  saveSshProfile,
  saveUiLanguageSettings,
  saveWebConfig,
  searchPluginMarketplace,
  searchClawHubSkillMarket,
  searchMemories,
  searchWorkspacePaths,
  markSessionTerminalRunViewed,
  markBoardTodoDone,
  stopBackgroundTask,
  stopGitHubWebhookTunnel,
  startWeChatGatewayLogin,
  startAgentRuntimeTestJob,
  startGitHubWebhookTunnel,
  startRuntimeToolDownload,
  rebuildMemoryIndex,
  runAutomationProject,
  requestChangesBoardTodo,
  restoreBoardTodo,
  syncBoardTodos,
  testConnector,
  installClawHubMarketSkill,
  installPlugin,
  uninstallClawHubMarketSkill,
  uninstallRuntimeSkill,
  updateAutomationProject,
  updateDiscordGatewayAccount,
  updateSession,
  updateBoardTodoSource,
  updateFeishuGatewayAccount,
  updateMemorySkillDraft,
  updateWeChatGatewayAccount,
  updateXiaolubanGatewayAccount,
  updateXiaolubanGatewayImConfig,
  updatePlugin,
  updateWorkspace,
  validateMemorySkillDraft,
  validateHooksConfig,
  validateRoleConfig,
  waitWeChatGatewayLogin,
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

  it("picks workspaces with the optional root path payload", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            workspace: {
              workspace_id: "workspace-1",
              root_path: "C:/work/agent-teams",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(pickWorkspace(" C:/work/agent-teams ")).resolves.toEqual({
      workspace: {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
      },
    });
    await expect(pickWorkspace()).resolves.toEqual({
      workspace: {
        workspace_id: "workspace-1",
        root_path: "C:/work/agent-teams",
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/pick",
      expect.objectContaining({
        body: JSON.stringify({ root_path: "C:/work/agent-teams" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/pick",
      expect.objectContaining({
        body: undefined,
        method: "POST",
      }),
    );
  });

  it("deletes workspaces with optional directory removal", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteWorkspace("workspace one")).resolves.toEqual({
      status: "ok",
    });
    await expect(
      deleteWorkspace("workspace one", { removeDirectory: true }),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace%20one",
      expect.objectContaining({
        body: undefined,
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace%20one?remove_directory=true",
      expect.objectContaining({
        body: JSON.stringify({ force: true }),
        method: "DELETE",
      }),
    );
  });

  it("updates, marks terminal view, and deletes sessions through session endpoints", async () => {
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
    await expect(markSessionTerminalRunViewed("session-1")).resolves.toEqual({
      status: "ok",
    });
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
      "/api/sessions/session-1/terminal-view",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/sessions/session-1",
      expect.objectContaining({
        body: JSON.stringify({ cascade: true, force: true }),
        method: "DELETE",
      }),
    );
  });

  it("loads nested subagent sessions and agent messages through session-scoped endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              instance_id: "subagent-instance-1",
              role_id: "explorer",
              run_id: "subagent_run_1",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              message_id: "message-1",
              role: "assistant",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listSessionSubagents("session-1", true)).resolves.toEqual([
      {
        instance_id: "subagent-instance-1",
        role_id: "explorer",
        run_id: "subagent_run_1",
      },
    ]);
    await expect(
      listAgentMessages("session-1", "subagent-instance-1"),
    ).resolves.toEqual([
      {
        message_id: "message-1",
        role: "assistant",
      },
    ]);
    await expect(
      deleteSessionSubagent("session-1", "subagent-instance-1"),
    ).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/sessions/session-1/subagents?force_refresh=true",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/session-1/agents/subagent-instance-1/messages",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/sessions/session-1/subagents/subagent-instance-1",
      expect.objectContaining({
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

  it("uses board TODO action endpoints with encoded ids", async () => {
    const itemPayload = {
      item_revision: 8,
      run_recoverable: false,
      source_key: "openai/agent-teams#401",
      source_provider: "github",
      source_type: "github_issue",
      status: "in_progress",
      title: "Board action item",
      todo_id: "todo/2",
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "workspace-1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            board_workspace_id: "workspace-1",
            concurrency: {
              runtime_target_active: 0,
              runtime_target_limit: 1,
              source_workspace_active: 0,
              source_workspace_limit: 2,
            },
            diagnostics: [],
            execution_policy: "current_workspace",
            execution_workspace_preview: null,
            is_fork_view: false,
            prompt: "Previewed change request",
            queue_preview: {
              queue_if_full: true,
              slot_available: true,
              will_queue: false,
            },
            runtime_target_id: null,
            template_kind: "request_changes",
            template_source: "built_in",
            thinking: { enabled: false, effort: null },
            todo_id: "todo/2",
            view_workspace_id: "workspace-1",
            yolo: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(itemPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(itemPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(itemPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(itemPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      previewRequestChangesBoardTodo("todo/2", {
        feedback: "Needs another pass.",
        queue_if_full: true,
        view_workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({ prompt: "Previewed change request" });
    await expect(
      requestChangesBoardTodo("todo/2", {
        feedback: "Needs another pass.",
        final_prompt: "Final change request",
        queue_if_full: true,
        view_workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({ todo_id: "todo/2" });
    await expect(markBoardTodoDone("todo/2")).resolves.toMatchObject({
      todo_id: "todo/2",
    });
    await expect(archiveBoardTodo("todo/2")).resolves.toMatchObject({
      todo_id: "todo/2",
    });
    await expect(restoreBoardTodo("todo/2")).resolves.toMatchObject({
      todo_id: "todo/2",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/boards/todos/todo%2F2:preview-request-changes",
      expect.objectContaining({
        body: JSON.stringify({
          feedback: "Needs another pass.",
          queue_if_full: true,
          view_workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/boards/todos/todo%2F2:request-changes",
      expect.objectContaining({
        body: JSON.stringify({
          feedback: "Needs another pass.",
          final_prompt: "Final change request",
          queue_if_full: true,
          view_workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/boards/todos/todo%2F2:mark-done",
      expect.objectContaining({
        body: JSON.stringify({}),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/boards/todos/todo%2F2:archive",
      expect.objectContaining({
        body: JSON.stringify({}),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/boards/todos/todo%2F2:restore",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
  });

  it("uses board TODO source settings endpoints", async () => {
    const sourcePayload = {
      created_at: "2026-06-24T00:00:00Z",
      display_name: "GitHub issues",
      enabled: true,
      kind: "github_issues",
      provider: "github",
      repository_full_name: "openai/agent-teams",
      source_id: "source/1",
      system_managed: false,
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "workspace-1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            board_workspace_id: "workspace-1",
            diagnostics: [],
            is_fork_view: false,
            sources: [{ source: sourcePayload, state: null }],
            view_workspace_id: "workspace-1",
            workspace_id: "workspace-1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sourcePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sourcePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ deleted: true, source_id: "source/1" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listBoardTodoSources("workspace-1")).resolves.toMatchObject({
      workspace_id: "workspace-1",
    });
    await expect(
      createBoardTodoSource({
        display_name: "GitHub issues",
        enabled: true,
        kind: "github_issues",
        repository_full_name: "openai/agent-teams",
        workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({ source_id: "source/1" });
    await expect(
      updateBoardTodoSource("source/1", {
        display_name: "GitHub issues updated",
        enabled: false,
        repository_full_name: "openai/agent-teams",
        workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({ source_id: "source/1" });
    await expect(deleteBoardTodoSource("source/1")).resolves.toEqual({
      deleted: true,
      source_id: "source/1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/boards/todo-sources?workspace_id=workspace-1",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/boards/todo-sources",
      expect.objectContaining({
        body: JSON.stringify({
          display_name: "GitHub issues",
          enabled: true,
          kind: "github_issues",
          repository_full_name: "openai/agent-teams",
          workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/boards/todo-sources/source%2F1",
      expect.objectContaining({
        body: JSON.stringify({
          display_name: "GitHub issues updated",
          enabled: false,
          repository_full_name: "openai/agent-teams",
          workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/boards/todo-sources/source%2F1",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "DELETE",
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
    const createRequest = {
      cron_expression: "0 9 * * 1-5",
      delivery_binding: null,
      delivery_events: ["completed" as const],
      display_name: "Daily triage",
      enabled: true,
      name: "daily_triage",
      prompt: "Summarize daily status.",
      run_config: { session_mode: "normal" as const },
      schedule_mode: "cron" as const,
      timezone: "UTC",
      workspace_id: "workspace-1",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([projectPayload]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ session_id: "session-1" }]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
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
    await expect(createAutomationProject(createRequest)).resolves.toEqual(projectPayload);
    await expect(
      updateAutomationProject("aut-1", { display_name: "Daily triage" }),
    ).resolves.toEqual(projectPayload);
    await expect(
      deleteAutomationProject("aut-1", {
        cascade: true,
        force: false,
        reason: "cleanup",
      }),
    ).resolves.toEqual({ status: "ok" });
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
      "/api/automation/projects",
      expect.objectContaining({
        body: JSON.stringify(createRequest),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/automation/projects/aut-1",
      expect.objectContaining({
        body: JSON.stringify({ display_name: "Daily triage" }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/automation/projects/aut-1",
      expect.objectContaining({
        body: JSON.stringify({
          cascade: true,
          force: false,
          reason: "cleanup",
        }),
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/automation/projects/aut-1:run",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/automation/projects/aut-1:enable",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/automation/projects/aut-1:disable",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
  });

  it("uses the automation delivery binding endpoint", async () => {
    const bindingPayload = [
      {
        account_id: "xlb-1",
        derived_uid: "uidself",
        display_name: "Xiaoluban",
        provider: "xiaoluban",
        source_label: "发送给自己（uidself）",
        updated_at: "2026-06-24T00:00:00Z",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(bindingPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAutomationDeliveryBindings()).resolves.toEqual(bindingPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/delivery-bindings",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("uses the skills status, market, detail, install, uninstall, and reload endpoints", async () => {
    const statusPayload = {
      skills: {
        loaded: true,
        skills: [
          {
            description: "Create skills.",
            name: "skill-creator",
            ref: "skill-creator",
            source: "builtin",
          },
        ],
      },
    };
    const marketPayload = {
      items: [{ installed: false, slug: "skill-creator", summary: "", title: "Skill Creator" }],
      ok: true,
      query: "",
    };
    const detailPayload = {
      directory: "C:/skills/skill-creator",
      instructions: "Use this skill.",
      manifest_path: "C:/skills/skill-creator/SKILL.md",
      name: "skill-creator",
      ref: "skill-creator",
      source: "builtin",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(statusPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token_configured: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checked_at: "2026-06-24T00:00:00Z",
            diagnostics: {
              binary_available: true,
              endpoint_fallback_used: false,
              installation_attempted: false,
              installed_during_probe: false,
              token_configured: true,
            },
            latency_ms: 6,
            ok: true,
            retryable: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(marketPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(marketPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            slug: "skill-creator",
            title: "Skill Creator",
            summary: "Create skills.",
            files: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(detailPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            diagnostics: {
              binary_available: true,
              endpoint_fallback_used: false,
              installation_attempted: true,
              installed_during_install: true,
              skills_reloaded: true,
              token_configured: true,
            },
            latency_ms: 12,
            ok: true,
            retryable: false,
            slug: "skill-creator",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            skills_reloaded: true,
            slug: "skill-creator",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            ref: "skill-creator",
            skills_reloaded: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getConfigStatus()).resolves.toEqual(statusPayload);
    await expect(getClawHubConfig()).resolves.toEqual({ token_configured: true });
    await expect(saveClawHubConfig({ token: "next-token" })).resolves.toEqual({
      status: "ok",
    });
    await expect(
      probeClawHubConnectivity({ token: "next-token" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      browseClawHubSkillMarket({ cursor: "next", limit: 12, sort: "popular" }),
    ).resolves.toEqual(marketPayload);
    await expect(searchClawHubSkillMarket("skill creator", 8)).resolves.toEqual(
      marketPayload,
    );
    await expect(
      getClawHubSkillMarketDetail("skill-creator", "1.0.0"),
    ).resolves.toMatchObject({ slug: "skill-creator" });
    await expect(getRuntimeSkillDetail("skill-creator")).resolves.toEqual(detailPayload);
    await expect(
      installClawHubMarketSkill({
        force: false,
        slug: "skill-creator",
        version: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(uninstallClawHubMarketSkill("skill-creator")).resolves.toMatchObject({
      ok: true,
    });
    await expect(uninstallRuntimeSkill("skill-creator")).resolves.toMatchObject({
      ok: true,
    });
    await expect(reloadSkillsConfig()).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/clawhub",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/clawhub",
      expect.objectContaining({
        body: JSON.stringify({ token: "next-token" }),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/clawhub:probe",
      expect.objectContaining({
        body: JSON.stringify({ token: "next-token" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/skills/market/clawhub?limit=12&cursor=next&sort=popular",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/system/skills/market/clawhub/search?query=skill+creator&limit=8",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/system/skills/market/clawhub/skill-creator?version=1.0.0",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/system/skills/skill-creator",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/system/skills/market/clawhub/install",
      expect.objectContaining({
        body: JSON.stringify({
          force: false,
          slug: "skill-creator",
          version: null,
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      "/api/system/skills/market/clawhub/skill-creator",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      11,
      "/api/system/skills/skill-creator",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      12,
      "/api/system/configs/skills:reload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resolves slash commands through the system command endpoint", async () => {
    const responsePayload = {
      matched: true,
      raw_text: "/review file.py",
      parsed_name: "review",
      resolved_name: "review",
      args: "file.py",
      command: {
        name: "review",
        aliases: [],
        description: "Review a file",
        argument_hint: "<path>",
        allowed_modes: ["normal"],
        scope: "project",
        discovery_source: "project_codex",
        source_path: "C:/work/agent-teams/.codex/commands/review.md",
      },
      expanded_prompt: "Review file.py",
      expanded_prompt_length: 14,
    };
    const requestPayload = {
      workspace_id: "workspace-1",
      raw_text: "/review file.py",
      mode: "normal",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveCommandPrompt(requestPayload)).resolves.toEqual(
      responsePayload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/system/commands:resolve",
      expect.objectContaining({
        body: JSON.stringify(requestPayload),
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

  it("resolves tool approvals with optional feedback through the AG-UI endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveToolApproval(
        "run-1",
        "tool-call-1",
        "deny",
        "reject_once",
        "Use a read-only command instead.",
      ),
    ).resolves.toEqual({ status: "ok" });
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ag-ui/runs/run-1/tool-approvals/tool-call-1:resolve",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    if (requestInit === undefined) {
      throw new Error("Tool approval request init was not captured.");
    }
    expect(JSON.parse(String(requestInit.body))).toEqual({
      action: "deny",
      feedback: "Use a read-only command instead.",
      option_id: "reject_once",
    });
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

  it("lists runtime tools and mutates runtime tool endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            system_path: {
              added: false,
              bin_dir: "C:\\Users\\yex\\.agent-teams\\bin",
              supported: true,
            },
            items: [
              {
                display_name: "ripgrep",
                download_job_id: null,
                error_message: null,
                executable_name: "rg.exe",
                path: "C:\\Users\\yex\\.agent-teams\\bin\\rg.exe",
                path_source: "managed",
                source_kind: "github_release",
                status: "ready",
                target_version: null,
                tool_id: "rg",
                update_available: false,
                version: "14.1.1",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            downloaded_bytes: 0,
            error_message: null,
            job_id: "download-1",
            message: "Queued",
            path: null,
            progress_percent: 0,
            started_at: "2026-06-24T00:00:00Z",
            status: "queued",
            target_version: "14.1.1",
            tool_id: "rg",
            total_bytes: null,
            updated_at: "2026-06-24T00:00:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            downloaded_bytes: 100,
            error_message: null,
            job_id: "download-1",
            message: "Complete",
            path: "C:\\Users\\yex\\.agent-teams\\bin\\rg.exe",
            progress_percent: 100,
            started_at: "2026-06-24T00:00:00Z",
            status: "succeeded",
            target_version: "14.1.1",
            tool_id: "rg",
            total_bytes: 100,
            updated_at: "2026-06-24T00:00:01Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bin_dir: "C:\\Users\\yex\\.agent-teams\\bin",
            message: "Runtime tools were added to the system PATH.",
            requires_terminal_restart: true,
            status: "updated",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRuntimeTools()).resolves.toMatchObject({
      items: [expect.objectContaining({ tool_id: "rg" })],
      system_path: expect.objectContaining({ supported: true }),
    });
    await expect(startRuntimeToolDownload("rg")).resolves.toMatchObject({
      job_id: "download-1",
      status: "queued",
    });
    await expect(getRuntimeToolDownload("download-1")).resolves.toMatchObject({
      job_id: "download-1",
      status: "succeeded",
    });
    await expect(addRuntimeToolsSystemPath()).resolves.toMatchObject({
      status: "updated",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/connectors/runtime-tools",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/connectors/runtime-tools/rg:download",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/connectors/runtime-tools/downloads/download-1",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/connectors/runtime-tools/system-path:add",
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
              context: "React shell rewrite",
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

  it("uses the memory skill draft endpoints", async () => {
    const draftSummary = {
      applied_ref: null,
      created_at: "2026-06-24T00:15:00Z",
      description: "Turn frame memories into a skill.",
      draft_kind: "skill",
      id: "draft-1",
      runtime_name: "workspace-frame",
      scope_kind: "workspace",
      source_memory_count: 2,
      status: "draft",
      updated_at: "2026-06-24T00:20:00Z",
      validation_error_count: 0,
      validation_warning_count: 1,
      workspace_id: "workspace-1",
      workspace_ids: ["workspace-1"],
    };
    const draft = {
      ...draftSummary,
      applied_at: null,
      applied_skill_id: null,
      files: [{ content: "# Skill", encoding: "utf-8", path: "SKILL.md" }],
      generation_error: "",
      instructions: "Keep workspace pages fixed-height.",
      source_memory_ids: ["memory-1", "memory-2"],
      validated_at: null,
      validation_messages: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [draftSummary],
            limit: 20,
            offset: 0,
            total_count: 1,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_message: "",
            items: [draftSummary],
            source_memory_count: 2,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(draft), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...draft,
            status: "validated",
            validated_at: "2026-06-24T00:25:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            draft: {
              ...draft,
              applied_ref: "app:workspace-frame",
              status: "applied",
            },
            ref: "app:workspace-frame",
            skill_id: "workspace-frame",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listMemorySkillDrafts({
        draftKind: "skill",
        scopeKind: "workspace",
        status: "draft",
        textQuery: "frame",
        workspaceId: "workspace-1",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "draft-1" })],
    });
    await expect(
      generateMemorySkillDrafts({
        draft_kind: "auto",
        scope_kind: "workspace",
        text_query: "frame",
        workspace_id: "workspace-1",
      }),
    ).resolves.toMatchObject({ source_memory_count: 2 });
    await expect(getMemorySkillDraft("draft-1")).resolves.toMatchObject({
      id: "draft-1",
    });
    await expect(
      updateMemorySkillDraft("draft-1", { runtime_name: "workspace-frame-react" }),
    ).resolves.toMatchObject({ id: "draft-1" });
    await expect(validateMemorySkillDraft("draft-1")).resolves.toMatchObject({
      status: "validated",
    });
    await expect(applyMemorySkillDraft("draft-1")).resolves.toMatchObject({
      ref: "app:workspace-frame",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/memories/skill-drafts?scope_kind=workspace&workspace_id=workspace-1&status=draft&draft_kind=skill&text_query=frame&limit=20&offset=0",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/memories/skill-drafts:generate",
      expect.objectContaining({
        body: JSON.stringify({
          draft_kind: "auto",
          scope_kind: "workspace",
          text_query: "frame",
          workspace_id: "workspace-1",
        }),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/memories/skill-drafts/draft-1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/memories/skill-drafts/draft-1",
      expect.objectContaining({
        body: JSON.stringify({ runtime_name: "workspace-frame-react" }),
        headers: expect.any(Headers),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/memories/skill-drafts/draft-1:validate",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/memories/skill-drafts/draft-1:apply",
      expect.objectContaining({
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

  it("loads task spec lineage through task endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [
              {
                task_id: "task-1",
                title: "Implement spec",
                spec_artifact_id: "spec-2",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task_id: "task-1",
            versions: [
              {
                artifact_id: "spec-1",
                task_id: "task-1",
                session_id: "session-1",
                trace_id: "run-1",
                version: 1,
                created_at: "2026-06-25T08:00:00Z",
                updated_at: "2026-06-25T08:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task_id: "task-1",
            from_artifact_id: "spec-1",
            to_artifact_id: "spec-2",
            from_version: 1,
            to_version: 2,
            field_changes: [],
            has_changes: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task_id: "task-1",
            evaluations: [],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRunTasks("run-1", true)).resolves.toMatchObject({
      tasks: [{ task_id: "task-1" }],
    });
    await expect(listTaskSpecArtifacts("task-1")).resolves.toMatchObject({
      versions: [{ artifact_id: "spec-1" }],
    });
    await expect(getTaskSpecArtifactDiff("task-1", 2, 1)).resolves.toMatchObject({
      from_version: 1,
      to_version: 2,
    });
    await expect(listSpecCheckpointEvaluations("task-1")).resolves.toEqual({
      task_id: "task-1",
      evaluations: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/runs/run-1?include_root=true",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tasks/task-1/spec-artifacts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/tasks/task-1/spec-artifacts/2/diff?from_version=1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/tasks/task-1/spec-checkpoint-evaluations",
      expect.objectContaining({ headers: expect.any(Headers) }),
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
                masked: true,
                scope: "app",
                value: "saved-key",
                value_kind: "string",
              },
            ],
            system: [
              {
                key: "PATH",
                masked: false,
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
            masked: true,
            scope: "app",
            value: "************",
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
      masked: true,
      value: "************",
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

  it("manages agent runtimes through the system config endpoints", async () => {
    const runtimeConfig = {
      agent_id: "codex-acp",
      description: "ACP adapter",
      name: "Codex CLI",
      protocol: "acp" as const,
      transport: {
        distribution: "auto" as const,
        env: [
          {
            configured: true,
            name: "OPENAI_API_KEY",
            secret: true,
            value: "",
          },
        ],
        registry_id: "openai/codex",
        transport: "registry" as const,
      },
    };
    const registryPayload = {
      agents: [
        {
          distributions: ["npx"],
          installed: false,
          name: "Codex Runtime",
          registry_id: "openai/codex",
          version: "1.0.0",
        },
      ],
      cache_path: "C:/cache/acp-registry.json",
      registry_version: "2026.06",
    };
    const testJob = {
      agent_id: "codex-acp",
      job_id: "job-1",
      message: "Connected",
      progress_percent: 100,
      status: "succeeded",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              agent_id: "codex-acp",
              description: "ACP adapter",
              name: "Codex CLI",
              protocol: "acp",
              transport: "registry",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(runtimeConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(runtimeConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(registryPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(registryPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: runtimeConfig,
            message: "Installed",
            registry_agent: registryPayload.agents[0],
            status: "ok",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(testJob), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(testJob), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAgentRuntimes()).resolves.toEqual([
      expect.objectContaining({ agent_id: "codex-acp" }),
    ]);
    await expect(getAgentRuntime("codex-acp")).resolves.toEqual(runtimeConfig);
    await expect(saveAgentRuntime("codex-acp", runtimeConfig)).resolves.toEqual(
      runtimeConfig,
    );
    await expect(deleteAgentRuntime("codex-acp")).resolves.toEqual({ status: "ok" });
    await expect(getAgentRuntimeRegistry()).resolves.toEqual(registryPayload);
    await expect(refreshAgentRuntimeRegistry()).resolves.toEqual(registryPayload);
    await expect(
      installAgentRuntimeFromRegistry("openai/codex", {
        distribution: "auto",
        env: {},
      }),
    ).resolves.toMatchObject({ message: "Installed" });
    await expect(startAgentRuntimeTestJob("codex-acp")).resolves.toEqual(testJob);
    await expect(getAgentRuntimeTestJob("job-1")).resolves.toEqual(testJob);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/agent-runtimes",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/agent-runtimes/codex-acp",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/agent-runtimes/codex-acp",
      expect.objectContaining({
        body: JSON.stringify(runtimeConfig),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/agent-runtimes/codex-acp",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/configs/agent-runtime-registry",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/system/configs/agent-runtime-registry:refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/system/configs/agent-runtime-registry/openai%2Fcodex:install",
      expect.objectContaining({
        body: JSON.stringify({ distribution: "auto", env: {} }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/system/configs/agent-runtimes/codex-acp:test-job",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/system/configs/agent-runtime-test-jobs/job-1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("manages plugins through the system config endpoints", async () => {
    const pluginPayload = {
      diagnostics: [],
      plugins: [
        {
          enabled: true,
          name: "quality-tools",
          scope: "user",
          version: "1.0.0",
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(pluginPayload), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const localInstallPayload = {
      enabled: true,
      marketplace: null,
      scope: "user" as const,
      source: "C:/plugins/local-quality",
      version: null,
    };
    const marketplaceInstallPayload = {
      allow_community_plugins: true,
      allow_executes_code: true,
      allow_missing_digest: true,
      allow_unclean_scan: true,
      enabled: false,
      marketplace: "quality-tools",
      marketplace_provider: "clawhub" as const,
      marketplace_ref: "main",
      marketplace_source: "clawhub://quality-tools",
      scope: "project" as const,
      source: "quality-tools",
      source_kind: "git" as const,
      source_ref: "v1.2.0",
      version: "2.0.0",
    };
    const configurePayload = {
      scope: "user" as const,
      user_config: {
        enabled: true,
        endpoint: "https://docs.test",
        nested: { mode: "strict" },
        retries: 3,
      },
    };

    await expect(getPluginsConfig()).resolves.toEqual(pluginPayload);
    await expect(installPlugin(localInstallPayload)).resolves.toEqual(pluginPayload);
    await expect(installPlugin(marketplaceInstallPayload)).resolves.toEqual(
      pluginPayload,
    );
    await expect(configurePlugin("quality-tools", configurePayload)).resolves.toEqual(
      pluginPayload,
    );
    await expect(enablePlugin("quality-tools", { scope: "user" })).resolves.toEqual(
      pluginPayload,
    );
    await expect(disablePlugin("quality-tools", { scope: "project" })).resolves.toEqual(
      pluginPayload,
    );
    await expect(
      updatePlugin("quality-tools", { scope: "user", version: "2.0.0" }),
    ).resolves.toEqual(pluginPayload);
    await expect(
      deletePlugin("quality-tools", { prune: true, scope: "project" }),
    ).resolves.toEqual(pluginPayload);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/plugins",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/plugins:install",
      expect.objectContaining({
        body: JSON.stringify(localInstallPayload),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/plugins:install",
      expect.objectContaining({
        body: JSON.stringify(marketplaceInstallPayload),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/plugins/quality-tools:configure",
      expect.objectContaining({
        body: JSON.stringify(configurePayload),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/configs/plugins/quality-tools:enable",
      expect.objectContaining({
        body: JSON.stringify({ scope: "user" }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/system/configs/plugins/quality-tools:disable",
      expect.objectContaining({
        body: JSON.stringify({ scope: "project" }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/system/configs/plugins/quality-tools:update",
      expect.objectContaining({
        body: JSON.stringify({ scope: "user", version: "2.0.0" }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/system/configs/plugins/quality-tools?prune=true&scope=project",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.any(Headers),
      }),
    );
  });

  it("loads plugin marketplace indexes through the system config endpoints", async () => {
    const marketplacePayload = {
      plugins: [
        {
          latest: "1.2.0",
          name: "quality-tools",
          versions: [{ version: "1.2.0" }],
        },
      ],
    };
    const pluginPayload = {
      diagnostics: [],
      plugins: [{ name: "quality-tools", scope: "user" }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(marketplacePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(marketplacePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pluginPayload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const marketplaceRequest = {
      fetch_all: true,
      include_details: true,
      marketplace: "clawhub",
      marketplace_provider: "clawhub" as const,
      marketplace_ref: "main",
      marketplace_source: "https://clawhub.ai",
      refresh: true,
    };
    await expect(loadPluginMarketplace(marketplaceRequest)).resolves.toEqual(
      marketplacePayload,
    );
    await expect(
      searchPluginMarketplace({ ...marketplaceRequest, query: "quality" }),
    ).resolves.toEqual(marketplacePayload);
    await expect(
      inspectPluginMarketplace({
        ...marketplaceRequest,
        name: "quality-tools",
        scope: "project",
        version: "1.2.0",
      }),
    ).resolves.toEqual(pluginPayload);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/plugins/marketplace",
      expect.objectContaining({
        body: JSON.stringify(marketplaceRequest),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/plugins/marketplace:search",
      expect.objectContaining({
        body: JSON.stringify({ ...marketplaceRequest, query: "quality" }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/plugins/marketplace:inspect",
      expect.objectContaining({
        body: JSON.stringify({
          ...marketplaceRequest,
          name: "quality-tools",
          scope: "project",
          version: "1.2.0",
        }),
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
  });

  it("manages hooks through the system config endpoints", async () => {
    const hooksPayload = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ command: "python hooks/start.py", type: "command" }],
            matcher: "*",
          },
        ],
      },
    };
    const validationPayload = { status: "ok" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(hooksPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(hooksPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validationPayload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHooksConfig()).resolves.toEqual(hooksPayload);
    await expect(saveHooksConfig(hooksPayload)).resolves.toEqual(hooksPayload);
    await expect(validateHooksConfig(hooksPayload)).resolves.toEqual(
      validationPayload,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/hooks",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/hooks",
      expect.objectContaining({
        body: JSON.stringify(hooksPayload),
        headers: expect.any(Headers),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/hooks:validate",
      expect.objectContaining({
        body: JSON.stringify(hooksPayload),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
  });

  it("manages GitHub settings through the system config endpoints", async () => {
    const configPayload = {
      token_configured: true,
      webhook_base_url: "https://hooks.example",
    };
    const cliProbePayload = {
      checked_at: "2026-06-24T00:00:00Z",
      diagnostics: {
        auth_valid: true,
        binary_available: true,
        bundled_binary: true,
        used_proxy: false,
      },
      gh_path: "C:/tools/gh.exe",
      gh_version: "gh version 2.0.0",
      host: "github.com",
      latency_ms: 18,
      ok: true,
      retryable: false,
      username: "octocat",
    };
    const webhookProbePayload = {
      callback_url: "https://hooks.example/api/triggers/github/deliveries",
      checked_at: "2026-06-24T00:00:00Z",
      diagnostics: {
        endpoint_reachable: true,
        redirected: false,
        used_proxy: false,
      },
      latency_ms: 26,
      ok: true,
      retryable: false,
      status_code: 200,
      webhook_base_url: "https://hooks.example",
    };
    const activeTunnelPayload = {
      provider: "localhost.run",
      public_url: "https://relay.localhost.run",
      status: "active",
    };
    const stoppedTunnelPayload = {
      provider: "localhost.run",
      public_url: "https://relay.localhost.run",
      status: "stopped",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(configPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "ghp_secret" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(cliProbePayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(webhookProbePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeTunnelPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activeTunnelPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(stoppedTunnelPayload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGitHubConfig()).resolves.toEqual(configPayload);
    await expect(revealGitHubToken()).resolves.toEqual({ token: "ghp_secret" });
    await expect(
      saveGitHubConfig({
        token: "ghp_secret",
        webhook_base_url: "https://hooks.example",
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(
      probeGitHubConnectivity({ token: "ghp_secret" }),
    ).resolves.toEqual(cliProbePayload);
    await expect(
      probeGitHubWebhookConnectivity({
        webhook_base_url: "https://hooks.example",
      }),
    ).resolves.toEqual(webhookProbePayload);
    await expect(getGitHubWebhookTunnelStatus()).resolves.toEqual(
      activeTunnelPayload,
    );
    await expect(
      startGitHubWebhookTunnel({ auto_save_webhook_base_url: true }),
    ).resolves.toEqual(activeTunnelPayload);
    await expect(
      stopGitHubWebhookTunnel({ clear_webhook_base_url_if_matching: true }),
    ).resolves.toEqual(stoppedTunnelPayload);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/github",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/github:reveal",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/github",
      expect.objectContaining({
        body: JSON.stringify({
          token: "ghp_secret",
          webhook_base_url: "https://hooks.example",
        }),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/github:probe",
      expect.objectContaining({
        body: JSON.stringify({ token: "ghp_secret" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/configs/github/webhook:probe",
      expect.objectContaining({
        body: JSON.stringify({ webhook_base_url: "https://hooks.example" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/system/configs/github/webhook/tunnel",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/system/configs/github/webhook/tunnel:start",
      expect.objectContaining({
        body: JSON.stringify({ auto_save_webhook_base_url: true }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/system/configs/github/webhook/tunnel:stop",
      expect.objectContaining({
        body: JSON.stringify({ clear_webhook_base_url_if_matching: true }),
        method: "POST",
      }),
    );
  });

  it("manages Feishu gateway accounts through trigger endpoints", async () => {
    const accountPayload = {
      account_id: "feishu-main",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "Feishu Main",
      name: "feishu-main",
      secret_status: { app_secret_configured: true },
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      status: "enabled",
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        thinking: { enabled: false, effort: null },
        workspace_id: "default",
        yolo: true,
      },
      updated_at: "2026-06-24T00:00:00Z",
    };
    const requestPayload = {
      display_name: "Feishu Main",
      enabled: true,
      name: "feishu-main",
      secret_config: { app_secret: "secret" },
      source_config: {
        app_id: "cli_app_id",
        app_name: "Relay Bot",
        provider: "feishu" as const,
        trigger_rule: "mention_only" as const,
      },
      target_config: {
        normal_root_role_id: "main",
        orchestration_preset_id: null,
        session_mode: "normal" as const,
        shell_safety_policy_enabled: true,
        thinking: { enabled: false, effort: null },
        workspace_id: "default",
        yolo: true,
      },
    };
    const updatePayload = {
      display_name: "Feishu Main",
      name: "feishu-main",
      secret_config: { app_secret: "secret" },
      source_config: requestPayload.source_config,
      target_config: requestPayload.target_config,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([accountPayload]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listFeishuGatewayAccounts()).resolves.toEqual([accountPayload]);
    await expect(createFeishuGatewayAccount(requestPayload)).resolves.toEqual(
      accountPayload,
    );
    await expect(
      updateFeishuGatewayAccount("feishu-main", updatePayload),
    ).resolves.toEqual(accountPayload);
    await expect(enableFeishuGatewayAccount("feishu-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(disableFeishuGatewayAccount("feishu-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(deleteFeishuGatewayAccount("feishu-main")).resolves.toEqual({
      status: "ok",
    });
    await expect(reloadFeishuGateway()).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/gateway/feishu/accounts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/gateway/feishu/accounts",
      expect.objectContaining({
        body: JSON.stringify(requestPayload),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/gateway/feishu/accounts/feishu-main",
      expect.objectContaining({
        body: JSON.stringify(updatePayload),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/gateway/feishu/accounts/feishu-main:enable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/gateway/feishu/accounts/feishu-main:disable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/gateway/feishu/accounts/feishu-main",
      expect.objectContaining({
        body: JSON.stringify({ force: true }),
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/gateway/feishu/reload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("manages Discord gateway accounts through typed endpoints", async () => {
    const accountPayload = {
      account_id: "discord-main",
      allow_channel_messages: true,
      allowed_channel_ids: ["123"],
      application_id: "456",
      bot_user_id: "789",
      created_at: "2026-07-11T00:00:00Z",
      display_name: "Discord Main",
      last_error: null,
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      running: true,
      secret_status: { bot_token_configured: true },
      session_mode: "normal",
      shell_safety_policy_enabled: true,
      status: "enabled",
      thinking: { effort: "medium", enabled: true },
      updated_at: "2026-07-11T00:00:00Z",
      workspace_id: "workspace-main",
      yolo: true,
    };
    const createPayload = {
      allowed_channel_ids: ["123"],
      bot_token: "discord-token",
      display_name: "Discord Main",
      workspace_id: "workspace-main",
    };
    const updatePayload = { display_name: "Discord Primary" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([accountPayload]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDiscordGatewayAccounts()).resolves.toEqual([accountPayload]);
    await expect(createDiscordGatewayAccount(createPayload)).resolves.toEqual(accountPayload);
    await expect(updateDiscordGatewayAccount("discord-main", updatePayload)).resolves.toEqual(accountPayload);
    await expect(enableDiscordGatewayAccount("discord-main")).resolves.toEqual(accountPayload);
    await expect(disableDiscordGatewayAccount("discord-main")).resolves.toEqual(accountPayload);
    await expect(deleteDiscordGatewayAccount("discord-main")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/gateway/discord/accounts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/gateway/discord/accounts",
      expect.objectContaining({ body: JSON.stringify(createPayload), method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/gateway/discord/accounts/discord-main",
      expect.objectContaining({ body: JSON.stringify(updatePayload), method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/gateway/discord/accounts/discord-main:enable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/gateway/discord/accounts/discord-main:disable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/gateway/discord/accounts/discord-main",
      expect.objectContaining({ body: JSON.stringify({ force: true }), method: "DELETE" }),
    );
  });

  it("manages Xiaoluban gateway accounts and IM forwarding endpoints", async () => {
    const accountPayload = {
      account_id: "xlb-main",
      base_url: "http://xiaoluban.example/",
      created_at: "2026-06-29T00:00:00Z",
      derived_uid: "uid-main",
      display_name: "Xiaoluban Main",
      im_config: { workspace_id: "workspace-main" },
      notification_receiver: "group-a",
      notification_receivers: ["group-a", "group-b"],
      notification_workspace_ids: ["workspace-main"],
      notify_self: true,
      secret_status: { token_configured: true },
      status: "enabled",
      updated_at: "2026-06-29T00:00:00Z",
    };
    const preparePayload = {
      account_id: "xlb-main",
      forwarding_command: "http://127.0.0.1:8765/xlb-main g",
      forwarding_url: "http://127.0.0.1:8765/xlb-main",
      listener_running: true,
    };
    const createPayload = {
      account_id: "xlb-main",
      base_url: "http://xiaoluban.example/",
      display_name: "Xiaoluban Main",
      enabled: true,
      im_config: { workspace_id: "workspace-main" },
      notification_receivers: ["group-a", "group-b"],
      notification_workspace_ids: ["workspace-main"],
      token: "personal-token",
    };
    const updatePayload = {
      display_name: "Xiaoluban Main",
      notification_receivers: ["group-a"],
      token: "replacement-token",
    };
    const imPayload = { workspace_id: "workspace-im" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([accountPayload]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preparePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(accountPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "revealed-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(accountPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(accountPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preparePayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(accountPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(accountPayload), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listXiaolubanGatewayAccounts()).resolves.toEqual([accountPayload]);
    await expect(prepareXiaolubanGatewayAccount()).resolves.toEqual(preparePayload);
    await expect(createXiaolubanGatewayAccount(createPayload)).resolves.toEqual(
      accountPayload,
    );
    await expect(
      revealXiaolubanGatewayAccountToken("xlb-main"),
    ).resolves.toEqual({ token: "revealed-token" });
    await expect(
      updateXiaolubanGatewayAccount("xlb-main", updatePayload),
    ).resolves.toEqual(accountPayload);
    await expect(
      updateXiaolubanGatewayImConfig("xlb-main", imPayload),
    ).resolves.toEqual(accountPayload);
    await expect(
      fetchXiaolubanGatewayImForwardingCommand("xlb-main"),
    ).resolves.toEqual(preparePayload);
    await expect(enableXiaolubanGatewayAccount("xlb-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(disableXiaolubanGatewayAccount("xlb-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(deleteXiaolubanGatewayAccount("xlb-main")).resolves.toEqual({
      status: "ok",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/gateway/xiaoluban/accounts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/gateway/xiaoluban/accounts:prepare",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/gateway/xiaoluban/accounts",
      expect.objectContaining({
        body: JSON.stringify(createPayload),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/gateway/xiaoluban/accounts/xlb-main:reveal-token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/gateway/xiaoluban/accounts/xlb-main",
      expect.objectContaining({
        body: JSON.stringify(updatePayload),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/gateway/xiaoluban/accounts/xlb-main/im",
      expect.objectContaining({
        body: JSON.stringify(imPayload),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/gateway/xiaoluban/accounts/xlb-main/im:forwarding-command",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/gateway/xiaoluban/accounts/xlb-main:enable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/gateway/xiaoluban/accounts/xlb-main:disable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      "/api/gateway/xiaoluban/accounts/xlb-main",
      expect.objectContaining({
        body: JSON.stringify({ force: true }),
        method: "DELETE",
      }),
    );
  });

  it("manages WeChat gateway accounts through trigger endpoints", async () => {
    const accountPayload = {
      account_id: "wechat-main",
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      created_at: "2026-06-24T00:00:00Z",
      display_name: "WeChat Main",
      last_error: null,
      last_event_at: null,
      last_inbound_at: null,
      last_login_at: "2026-06-24T00:00:00Z",
      last_outbound_at: null,
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      remote_user_id: "wxid_main",
      route_tag: "desktop",
      running: true,
      session_mode: "normal",
      status: "enabled",
      sync_cursor: "",
      thinking: { enabled: false, effort: null },
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "default",
      yolo: true,
    };
    const updatePayload = {
      base_url: "http://127.0.0.1:5900",
      cdn_base_url: "http://127.0.0.1:5901",
      display_name: "WeChat Main",
      normal_root_role_id: "main",
      orchestration_preset_id: null,
      route_tag: "desktop",
      session_mode: "normal" as const,
      thinking: { enabled: false, effort: null },
      workspace_id: "default",
      yolo: true,
    };
    const startPayload = {
      message: "Scan the QR code.",
      qr_code_url: "data:image/png;base64,abc",
      session_key: "wechat-session",
    };
    const waitPayload = {
      account_id: "wechat-main",
      connected: true,
      message: "Connected.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([accountPayload]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(startPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(waitPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accountPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listWeChatGatewayAccounts()).resolves.toEqual([accountPayload]);
    await expect(startWeChatGatewayLogin({})).resolves.toEqual(startPayload);
    await expect(
      waitWeChatGatewayLogin({ session_key: "wechat-session", timeout_ms: 480000 }),
    ).resolves.toEqual(waitPayload);
    await expect(
      updateWeChatGatewayAccount("wechat-main", updatePayload),
    ).resolves.toEqual(accountPayload);
    await expect(enableWeChatGatewayAccount("wechat-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(disableWeChatGatewayAccount("wechat-main")).resolves.toEqual(
      accountPayload,
    );
    await expect(deleteWeChatGatewayAccount("wechat-main")).resolves.toEqual({
      status: "ok",
    });
    await expect(reloadWeChatGateway()).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/gateway/wechat/accounts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/gateway/wechat/login/start",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/gateway/wechat/login/wait",
      expect.objectContaining({
        body: JSON.stringify({ session_key: "wechat-session", timeout_ms: 480000 }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/gateway/wechat/accounts/wechat-main",
      expect.objectContaining({
        body: JSON.stringify(updatePayload),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/gateway/wechat/accounts/wechat-main:enable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/gateway/wechat/accounts/wechat-main:disable",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/gateway/wechat/accounts/wechat-main",
      expect.objectContaining({
        body: JSON.stringify({ force: true }),
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/gateway/wechat/reload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("manages editable role configs through the role config endpoints", async () => {
    const roleConfig = {
      bound_agent_id: "codex-local",
      content: "---\nname: Reviewer\n---\nReview carefully.",
      contract: {
        invariants: [{ invariant: "must_review" }],
      },
      description: "Review changes",
      file_name: "reviewer.md",
      mcp_servers: ["filesystem"],
      memory_profile: {
        enabled: true,
      },
      mode: "subagent",
      model_profile: "default",
      name: "Reviewer",
      role_id: "reviewer",
      skills: ["review"],
      source: "project",
      source_role_id: "reviewer",
      system_prompt: "Review carefully.",
      tools: ["read_file"],
      version: "1.0.0",
    };
    const roleDraft = {
      bound_agent_id: "codex-local",
      contract: {
        invariants: [{ invariant: "must_review" }],
      },
      description: "Review changes",
      execution_surface: "api",
      mcp_servers: ["filesystem"],
      memory_profile: {
        enabled: true,
      },
      mode: "subagent",
      model_profile: "default",
      name: "Reviewer",
      role_id: "reviewer",
      skills: ["review"],
      source_role_id: "reviewer",
      system_prompt: "Review carefully.",
      tools: ["read_file"],
      version: "1.0.0",
    };
    const validationResult = { role: roleConfig, valid: true };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              description: "Review changes",
              mode: "subagent",
              model_profile: "default",
              name: "Reviewer",
              role_id: "reviewer",
              source: "project",
              version: "1.0.0",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(roleConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(roleConfig), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validationResult), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRoleConfigs()).resolves.toEqual([
      expect.objectContaining({ role_id: "reviewer" }),
    ]);
    await expect(getRoleConfig("reviewer")).resolves.toEqual(roleConfig);
    await expect(saveRoleConfig("reviewer", roleConfig)).resolves.toEqual(roleConfig);
    await expect(validateRoleConfig(roleConfig)).resolves.toEqual(validationResult);
    await expect(deleteRoleConfig("reviewer")).resolves.toEqual({ status: "ok" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/roles/configs",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/roles/configs/reviewer",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/roles/configs/reviewer",
      expect.objectContaining({
        body: JSON.stringify(roleDraft),
        headers: expect.any(Headers),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/roles:validate-config",
      expect.objectContaining({
        body: JSON.stringify(roleDraft),
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/roles/configs/reviewer",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "DELETE",
      }),
    );
  });

  it("manages model profiles through the model config endpoints", async () => {
    const profilePayload = {
      base_url: "https://models.example/v1",
      connect_timeout_seconds: 15,
      context_window: 128000,
      fallback_policy_id: null,
      fallback_priority: 0,
      is_default: true,
      model: "gpt-5-mini",
      provider: "openai_compatible",
      temperature: 0.7,
      top_p: 1,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const body =
        url === "/api/system/configs/model:probe"
          ? {
              checked_at: "2026-06-26T00:00:00Z",
              diagnostics: {
                auth_valid: true,
                endpoint_reachable: true,
                rate_limited: false,
              },
              latency_ms: 42,
              model: "gpt-5-mini",
              ok: true,
              provider: "openai_compatible",
            }
          : url === "/api/system/configs/model/catalog" ||
              url === "/api/system/configs/model/catalog:refresh"
            ? {
                ok: true,
                providers: [
                  {
                    api: "https://models.example/v1",
                    id: "openai",
                    models: [
                      {
                        context_window: 128000,
                        id: "gpt-5-mini",
                        name: "GPT-5 Mini",
                        output_limit: 8192,
                      },
                    ],
                    name: "OpenAI",
                    runtime_provider: "openai_compatible",
                  },
                ],
                source_url: "https://models.dev/api.json",
              }
          : { status: "ok" };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getModelCatalog()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        providers: expect.any(Array),
      }),
    );
    await expect(refreshModelCatalog()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        providers: expect.any(Array),
      }),
    );
    await expect(saveModelProfile("default/profile", profilePayload)).resolves.toEqual({
      status: "ok",
    });
    await expect(deleteModelProfile("old/profile")).resolves.toEqual({ status: "ok" });
    await expect(reloadModelConfig()).resolves.toEqual({ status: "ok" });
    await expect(
      probeModelConnection({ profile_name: "default/profile", timeout_ms: 15000 }),
    ).resolves.toEqual(
      expect.objectContaining({
        latency_ms: 42,
        ok: true,
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/configs/model/catalog",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/configs/model/catalog:refresh",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/system/configs/model/profiles/default%2Fprofile",
      expect.objectContaining({
        body: JSON.stringify(profilePayload),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/system/configs/model/profiles/old%2Fprofile",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/system/configs/model:reload",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/system/configs/model:probe",
      expect.objectContaining({
        body: JSON.stringify({ profile_name: "default/profile", timeout_ms: 15000 }),
        method: "POST",
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
    await expect(
      saveOrchestrationConfig({
        default_orchestration_preset_id: "default",
        presets: [
          {
            description: "Main plus reviewer",
            name: "Default",
            orchestration_prompt: "Coordinate.",
            policy: {
              max_orchestration_cycles: 8,
            },
            preset_id: "default",
            role_ids: ["main", "reviewer"],
          },
        ],
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/system/configs/orchestration",
      expect.objectContaining({
        body: JSON.stringify({
          default_orchestration_preset_id: "default",
          presets: [
            {
              description: "Main plus reviewer",
              name: "Default",
              orchestration_prompt: "Coordinate.",
              policy: {
                max_orchestration_cycles: 8,
              },
              preset_id: "default",
              role_ids: ["main", "reviewer"],
            },
          ],
        }),
        method: "PUT",
      }),
    );
  });

  it("reads and saves UI language settings through the config endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ language: "zh-CN" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ language: "en-US" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUiLanguageSettings()).resolves.toEqual({
      language: "zh-CN",
    });
    await expect(
      saveUiLanguageSettings({ language: "en-US" }),
    ).resolves.toEqual({ language: "en-US" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/system/configs/ui-language");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/system/configs/ui-language");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ language: "en-US" }),
      method: "PUT",
    });
  });
});
