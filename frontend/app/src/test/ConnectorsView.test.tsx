import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addRuntimeToolsSystemPath,
  createDiscordGatewayAccount,
  createXiaolubanGatewayAccount,
  deleteDiscordGatewayAccount,
  deleteXiaolubanGatewayAccount,
  disableDiscordGatewayAccount,
  disableXiaolubanGatewayAccount,
  getRuntimeToolDownload,
  getW3Connector,
  listConnectors,
  listDiscordGatewayAccounts,
  listRuntimeTools,
  listWorkspaces,
  listXiaolubanGatewayAccounts,
  saveW3Connector,
  startRuntimeToolDownload,
  testConnector,
  updateDiscordGatewayAccount,
  updateXiaolubanGatewayAccount,
} from "../api/client";
import type {
  BinaryToolListResponse,
  ConnectorListResponse,
  DiscordGatewayAccountRecord,
  XiaolubanGatewayAccountRecord,
} from "../api/contracts";
import { ConnectorsView } from "../features/connectors/ConnectorsView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  addRuntimeToolsSystemPath: vi.fn(),
  createDiscordGatewayAccount: vi.fn(),
  createXiaolubanGatewayAccount: vi.fn(),
  deleteDiscordGatewayAccount: vi.fn(),
  deleteXiaolubanGatewayAccount: vi.fn(),
  disableDiscordGatewayAccount: vi.fn(),
  disableXiaolubanGatewayAccount: vi.fn(),
  enableDiscordGatewayAccount: vi.fn(),
  enableXiaolubanGatewayAccount: vi.fn(),
  getRuntimeToolDownload: vi.fn(),
  getW3Connector: vi.fn(),
  listConnectors: vi.fn(),
  listDiscordGatewayAccounts: vi.fn(),
  listRuntimeTools: vi.fn(),
  listWorkspaces: vi.fn(),
  listXiaolubanGatewayAccounts: vi.fn(),
  saveW3Connector: vi.fn(),
  startRuntimeToolDownload: vi.fn(),
  testConnector: vi.fn(),
  updateDiscordGatewayAccount: vi.fn(),
  updateXiaolubanGatewayAccount: vi.fn(),
}));

vi.mock("../features/settings/GitHubSettingsSection", () => ({
  GitHubSettingsSection: ({ embedded }: { embedded?: boolean }) => (
    <div
      data-embedded={String(embedded)}
      data-testid="github-connector-editor"
    />
  ),
}));

vi.mock("../features/settings/TriggerSettingsSection", () => ({
  TriggerSettingsSection: ({
    embedded,
    provider,
  }: {
    embedded?: boolean;
    provider?: string;
  }) => (
    <div
      data-embedded={String(embedded)}
      data-testid={`trigger-connector-editor-${provider ?? "all"}`}
    />
  ),
}));

const addRuntimeToolsSystemPathMock = vi.mocked(addRuntimeToolsSystemPath);
const createDiscordGatewayAccountMock = vi.mocked(createDiscordGatewayAccount);
const createXiaolubanGatewayAccountMock = vi.mocked(
  createXiaolubanGatewayAccount,
);
const deleteDiscordGatewayAccountMock = vi.mocked(deleteDiscordGatewayAccount);
const deleteXiaolubanGatewayAccountMock = vi.mocked(
  deleteXiaolubanGatewayAccount,
);
const disableDiscordGatewayAccountMock = vi.mocked(
  disableDiscordGatewayAccount,
);
const disableXiaolubanGatewayAccountMock = vi.mocked(
  disableXiaolubanGatewayAccount,
);
const getRuntimeToolDownloadMock = vi.mocked(getRuntimeToolDownload);
const getW3ConnectorMock = vi.mocked(getW3Connector);
const listConnectorsMock = vi.mocked(listConnectors);
const listDiscordGatewayAccountsMock = vi.mocked(listDiscordGatewayAccounts);
const listRuntimeToolsMock = vi.mocked(listRuntimeTools);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const listXiaolubanGatewayAccountsMock = vi.mocked(
  listXiaolubanGatewayAccounts,
);
const saveW3ConnectorMock = vi.mocked(saveW3Connector);
const startRuntimeToolDownloadMock = vi.mocked(startRuntimeToolDownload);
const testConnectorMock = vi.mocked(testConnector);
const updateDiscordGatewayAccountMock = vi.mocked(updateDiscordGatewayAccount);
const updateXiaolubanGatewayAccountMock = vi.mocked(
  updateXiaolubanGatewayAccount,
);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  listConnectorsMock.mockResolvedValue(defaultConnectorsResponse());
  listDiscordGatewayAccountsMock.mockResolvedValue([]);
  listXiaolubanGatewayAccountsMock.mockResolvedValue([]);
  listWorkspacesMock.mockResolvedValue([
    {
      created_at: "2026-06-24T00:00:00Z",
      display_name: "Default",
      root_path: "C:/workspace",
      updated_at: "2026-06-24T00:00:00Z",
      workspace_id: "default",
    },
  ]);
  createDiscordGatewayAccountMock.mockResolvedValue({
    account_id: "discord-main",
    allow_channel_messages: false,
    allowed_channel_ids: [],
    application_id: null,
    bot_user_id: null,
    created_at: "2026-06-24T00:00:00Z",
    display_name: "Discord",
    last_error: null,
    normal_root_role_id: null,
    orchestration_preset_id: null,
    running: true,
    secret_status: { bot_token_configured: true },
    session_mode: "normal",
    shell_safety_policy_enabled: true,
    status: "enabled",
    thinking: { effort: "medium", enabled: true },
    updated_at: "2026-06-24T00:00:00Z",
    workspace_id: "default",
    yolo: true,
  });
  updateDiscordGatewayAccountMock.mockResolvedValue(discordAccount());
  disableDiscordGatewayAccountMock.mockResolvedValue(
    discordAccount({ status: "disabled" }),
  );
  deleteDiscordGatewayAccountMock.mockResolvedValue({ status: "ok" });
  updateXiaolubanGatewayAccountMock.mockResolvedValue(xiaolubanAccount());
  disableXiaolubanGatewayAccountMock.mockResolvedValue(
    xiaolubanAccount({ status: "disabled" }),
  );
  deleteXiaolubanGatewayAccountMock.mockResolvedValue({ status: "ok" });
  createXiaolubanGatewayAccountMock.mockResolvedValue({
    account_id: "xiaoluban-main",
    base_url: "https://api.xiaoluban.com",
    created_at: "2026-06-24T00:00:00Z",
    derived_uid: "uid-main",
    display_name: "Xiaoluban",
    im_config: { workspace_id: "default" },
    notification_receiver: null,
    notification_receivers: [],
    notification_workspace_ids: [],
    notify_self: false,
    secret_status: { token_configured: true },
    status: "enabled",
    updated_at: "2026-06-24T00:00:00Z",
  });
  testConnectorMock.mockResolvedValue({
    account_count: 2,
    capabilities: ["repositories"],
    checked_at: "2026-06-24T03:05:00Z",
    checks: [],
    connector_id: "github",
    enabled_count: 1,
    last_error: null,
    login_active: null,
    message: "GitHub connection is healthy.",
    ok: true,
    provider: "github",
    runtime_running: null,
    status: "connected",
  });
  listRuntimeToolsMock.mockResolvedValue(defaultRuntimeToolsResponse());
  getW3ConnectorMock.mockResolvedValue({
    has_password: true,
    last_error: null,
    last_login_failed_at: null,
    last_login_error_code: null,
    last_verified_at: "2026-06-24T03:00:00Z",
    last_sync: null,
    status: "connected",
    updated_at: "2026-06-24T03:00:00Z",
    username: "w3-user",
  });
  saveW3ConnectorMock.mockResolvedValue({
    error_code: null,
    has_password: true,
    message: "W3 credentials saved.",
    ok: true,
    status: "connected",
    sync: null,
    username: "w3-user",
  });
  startRuntimeToolDownloadMock.mockResolvedValue({
    downloaded_bytes: 100,
    error_message: null,
    job_id: "job-relay",
    message: "Download complete",
    path: "C:\\Users\\yex\\.agent-teams\\bin\\relay-knowledge.exe",
    progress_percent: 100,
    started_at: "2026-06-24T03:06:00Z",
    status: "succeeded",
    target_version: "0.4.0",
    tool_id: "relay-knowledge",
    total_bytes: 100,
    updated_at: "2026-06-24T03:06:01Z",
  });
  addRuntimeToolsSystemPathMock.mockResolvedValue({
    bin_dir: "C:\\Users\\yex\\.agent-teams\\bin",
    message: "Runtime tools were added to the system PATH.",
    requires_terminal_restart: true,
    status: "updated",
  });
  getRuntimeToolDownloadMock.mockResolvedValue({
    downloaded_bytes: 100,
    error_message: null,
    job_id: "job-relay",
    message: "Download complete",
    path: "C:\\Users\\yex\\.agent-teams\\bin\\relay-knowledge.exe",
    progress_percent: 100,
    started_at: "2026-06-24T03:06:00Z",
    status: "succeeded",
    target_version: "0.4.0",
    tool_id: "relay-knowledge",
    total_bytes: 100,
    updated_at: "2026-06-24T03:06:01Z",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConnectorsView", () => {
  it("renders compact connector cards and opens low-frequency detail in a modal", async () => {
    renderView();

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(await screen.findByTestId("connector-card-github")).toBeVisible();
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    expect(
      screen.queryByTestId("connector-detail-github"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open GitHub details" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("connector-detail-github")).toBeVisible(),
    );
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    expect(screen.getByText("repositories")).toBeVisible();
    expect(screen.getByText("pull requests")).toBeVisible();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search connectors" }),
      { target: { value: "w3" } },
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("connector-card-github"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open W3 details" }));
    await waitFor(() =>
      expect(screen.getByTestId("connector-detail-w3")).toBeVisible(),
    );
    expect(screen.getAllByText("Missing credentials").length).toBeGreaterThan(
      0,
    );
  });

  it("keeps filtering and connector detail keyboard-operable without a detail pane", async () => {
    renderView();

    const openDetails = await screen.findByRole("button", {
      name: "Open GitHub details",
    });
    expect(openDetails.tagName).toBe("BUTTON");
    fireEvent.click(openDetails);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByTestId("connector-detail-github"),
      ).toBeVisible(),
    );
    fireEvent.keyDown(dialog.parentElement ?? dialog, {
      code: "Escape",
      key: "Escape",
      keyCode: 27,
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId("connector-detail-github"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("radio", { name: "Needs config" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("connector-card-github"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    expect(screen.queryByTestId("connector-detail-w3")).not.toBeInTheDocument();
  });

  it("renders every connector returned by the API without product-id exceptions", async () => {
    const response = defaultConnectorsResponse();
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 2,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 3,
      },
      items: [
        ...response.items,
        {
          account_count: 1,
          auth_type: "cli",
          capabilities: ["cli_upgrade"],
          category: "development",
          connector_id: "relay-knowledge",
          description: "Install and update the Relay Knowledge CLI.",
          display_name: "Relay Knowledge",
          enabled_count: 1,
          last_activity_at: null,
          last_error: null,
          provider: "relay-knowledge",
          status: "connected",
        },
      ],
    });

    renderView();

    expect(await screen.findByTestId("connector-card-github")).toBeVisible();
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    expect(screen.getByTestId("connector-card-relay-knowledge")).toBeVisible();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("CLI tools"));
    expect(
      await screen.findByTestId("runtime-tool-card-relay-knowledge"),
    ).toBeVisible();
    expect(screen.getByText("Relay Knowledge CLI")).toBeVisible();
  });

  it("runs a real connector test action and displays the probe result", async () => {
    renderView();

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Test GitHub connection" },
        { timeout: 5_000 },
      ),
    );

    await waitFor(() =>
      expect(testConnectorMock).toHaveBeenCalledWith("github"),
    );
    const githubCard = screen.getByTestId("connector-card-github");
    expect(await within(githubCard).findByRole("status")).toHaveTextContent(
      "GitHub connection is healthy.",
    );
  }, 10_000);

  it("keeps connector probe feedback visible inside an open detail modal", async () => {
    renderView();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open GitHub details" }),
    );
    const detail = await screen.findByTestId("connector-detail-github");
    fireEvent.click(
      within(detail).getByRole("button", { name: "Test GitHub connection" }),
    );

    await waitFor(() =>
      expect(testConnectorMock).toHaveBeenCalledWith("github"),
    );
    expect(await within(detail).findByRole("status")).toHaveTextContent(
      "GitHub connection is healthy.",
    );
  });

  it("keeps V1 action routing real and saves W3 credentials through its API", async () => {
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 1,
        disabled: 0,
        error: 0,
        needs_config: 2,
        total: 3,
      },
      items: [
        defaultConnectorsResponse().items[0],
        {
          account_count: 0,
          auth_type: "username_password",
          capabilities: ["w3_auth"],
          category: "auth",
          connector_id: "w3",
          description: "Connect W3 authentication.",
          display_name: "W3",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "w3",
          status: "needs_config",
        },
        {
          account_count: 0,
          auth_type: "api_token",
          capabilities: ["direct_messages"],
          category: "im",
          connector_id: "discord",
          description: "Connect Discord.",
          display_name: "Discord",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "discord",
          status: "needs_config",
        },
      ],
    });

    renderView();

    expect(
      await screen.findByTestId("connector-action-github"),
    ).toHaveTextContent("Configure");
    expect(screen.getByTestId("connector-action-w3")).toHaveTextContent(
      "Configure",
    );
    expect(screen.getByTestId("connector-action-discord")).toHaveTextContent(
      "Configure",
    );

    fireEvent.click(screen.getByTestId("connector-action-w3"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("w3-user")).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "next-user" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveW3ConnectorMock).toHaveBeenCalledWith({
        password: null,
        username: "next-user",
      }),
    );
  });

  it("opens a real Discord account editor and creates an account", async () => {
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 0,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 1,
      },
      items: [
        {
          account_count: 0,
          auth_type: "api_token",
          capabilities: ["messages"],
          category: "im",
          connector_id: "discord",
          description: "Connect Discord.",
          display_name: "Discord",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "discord",
          status: "needs_config",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-discord"));
    await waitFor(() =>
      expect(screen.getByTestId("gateway-editor-discord")).toBeVisible(),
    );
    fireEvent.change(await screen.findByLabelText("Token"), {
      target: { value: "discord-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createDiscordGatewayAccountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bot_token: "discord-token",
          display_name: "Discord",
          workspace_id: "default",
        }),
      ),
    );
  });

  it("keeps required gateway feedback localized inside the connector dialog", async () => {
    useUiStore.setState({ language: "zh-CN" });
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 0,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 1,
      },
      items: [
        {
          account_count: 0,
          auth_type: "api_token",
          capabilities: ["messages"],
          category: "im",
          connector_id: "discord",
          description: "Connect Discord.",
          display_name: "Discord",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "discord",
          status: "needs_config",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-discord"));
    const dialog = await screen.findByRole("dialog", { name: "Discord" });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "保存" }),
    );

    expect(await within(dialog).findByText("此字段为必填项。")).toBeVisible();
    expect(within(dialog).queryByText("Please enter Token")).not.toBeInTheDocument();
    expect(createDiscordGatewayAccountMock).not.toHaveBeenCalled();
  });

  it("opens a real Xiaoluban account editor and creates an account", async () => {
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 0,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 1,
      },
      items: [
        {
          account_count: 0,
          auth_type: "api_token",
          capabilities: ["im_forwarding"],
          category: "im",
          connector_id: "xiaoluban",
          description: "Connect Xiaoluban.",
          display_name: "Xiaoluban",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "xiaoluban",
          status: "needs_config",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-xiaoluban"));
    await waitFor(() =>
      expect(screen.getByTestId("gateway-editor-xiaoluban")).toBeVisible(),
    );
    fireEvent.change(await screen.findByLabelText("Token"), {
      target: { value: "xiaoluban-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createXiaolubanGatewayAccountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: "Xiaoluban",
          im_config: { workspace_id: "default" },
          token: "xiaoluban-token",
        }),
      ),
    );
    expect(
      createXiaolubanGatewayAccountMock.mock.calls[0]?.[0],
    ).not.toHaveProperty("base_url");
  });

  it("updates, toggles, and deletes an existing Discord account", async () => {
    listDiscordGatewayAccountsMock.mockResolvedValue([discordAccount()]);
    listConnectorsMock.mockResolvedValue({
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
          capabilities: ["messages"],
          category: "im",
          connector_id: "discord",
          description: "Connect Discord.",
          display_name: "Discord",
          enabled_count: 1,
          last_activity_at: null,
          last_error: null,
          provider: "discord",
          status: "connected",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-discord"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Discord Main")).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Discord Primary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateDiscordGatewayAccountMock).toHaveBeenCalledWith(
        "discord-main",
        expect.objectContaining({ display_name: "Discord Primary" }),
      ),
    );

    fireEvent.click(screen.getByTestId("connector-action-discord"));
    await screen.findByDisplayValue("Discord Main");

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(disableDiscordGatewayAccountMock).toHaveBeenCalledWith(
        "discord-main",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = (await screen.findAllByRole("dialog")).find((candidate) =>
      candidate.classList.contains("ant-modal-confirm"),
    );
    expect(dialog).toBeDefined();
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(deleteDiscordGatewayAccountMock).toHaveBeenCalled(),
    );
    expect(deleteDiscordGatewayAccountMock.mock.calls[0]?.[0]).toBe(
      "discord-main",
    );
  }, 20_000);

  it("shows gateway mutation failures instead of failing silently", async () => {
    listDiscordGatewayAccountsMock.mockResolvedValue([discordAccount()]);
    disableDiscordGatewayAccountMock.mockRejectedValue(
      new Error("Discord disable failed."),
    );
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 1,
        disabled: 0,
        error: 0,
        needs_config: 0,
        total: 1,
      },
      items: [
        {
          ...defaultConnectorsResponse().items[0],
          account_count: 1,
          connector_id: "discord",
          display_name: "Discord",
          provider: "discord",
          category: "im",
          auth_type: "api_token",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-discord"));
    await screen.findByDisplayValue("Discord Main");
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(await screen.findByText("Discord disable failed.")).toBeVisible();
  });

  it("updates, toggles, deletes, and reports failures for Xiaoluban", async () => {
    listXiaolubanGatewayAccountsMock.mockResolvedValue([xiaolubanAccount()]);
    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 1,
        disabled: 0,
        error: 0,
        needs_config: 0,
        total: 1,
      },
      items: [
        {
          ...defaultConnectorsResponse().items[0],
          account_count: 1,
          auth_type: "api_token",
          capabilities: ["im_forwarding"],
          category: "im",
          connector_id: "xiaoluban",
          display_name: "Xiaoluban",
          provider: "xiaoluban",
        },
      ],
    });

    renderView();
    fireEvent.click(await screen.findByTestId("connector-action-xiaoluban"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Xiaoluban Main")).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Xiaoluban Primary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateXiaolubanGatewayAccountMock).toHaveBeenCalledWith(
        "xiaoluban-main",
        expect.objectContaining({ display_name: "Xiaoluban Primary" }),
      ),
    );
    fireEvent.click(screen.getByTestId("connector-action-xiaoluban"));
    await screen.findByDisplayValue("Xiaoluban Main");
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(disableXiaolubanGatewayAccountMock).toHaveBeenCalledWith(
        "xiaoluban-main",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmDialog = (await screen.findAllByRole("dialog")).find(
      (candidate) => candidate.classList.contains("ant-modal-confirm"),
    );
    expect(confirmDialog).toBeDefined();
    fireEvent.click(
      within(confirmDialog as HTMLElement).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(deleteXiaolubanGatewayAccountMock).toHaveBeenCalled(),
    );
    expect(deleteXiaolubanGatewayAccountMock.mock.calls[0]?.[0]).toBe(
      "xiaoluban-main",
    );

    disableXiaolubanGatewayAccountMock.mockRejectedValueOnce(
      new Error("Xiaoluban disable failed."),
    );
    listXiaolubanGatewayAccountsMock.mockResolvedValue([xiaolubanAccount()]);
    fireEvent.click(await screen.findByTestId("connector-action-xiaoluban"));
    await screen.findByDisplayValue("Xiaoluban Main");
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(await screen.findByText("Xiaoluban disable failed.")).toBeVisible();
  }, 20_000);

  it("opens provider configuration inside the connector detail modal", async () => {
    const onOpenSettings = vi.fn();

    listConnectorsMock.mockResolvedValue({
      summary: {
        connected: 0,
        disabled: 0,
        error: 0,
        needs_config: 1,
        total: 1,
      },
      items: [
        {
          account_count: 0,
          auth_type: "api_key",
          capabilities: ["messages"],
          category: "im",
          connector_id: "feishu",
          description: "Connect Feishu.",
          display_name: "Feishu",
          enabled_count: 0,
          last_activity_at: null,
          last_error: null,
          provider: "feishu",
          status: "needs_config",
        },
      ],
    });

    renderView(onOpenSettings);
    fireEvent.click(await screen.findByTestId("connector-action-feishu"));

    expect(
      await screen.findByTestId("trigger-connector-editor-feishu"),
    ).toHaveAttribute("data-embedded", "true");
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Back Feishu details" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("connector-detail-feishu")).toBeVisible(),
    );
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("keeps provider configuration contextual with one close control", async () => {
    const onOpenSettings = vi.fn();
    const connectors = [
      {
        auth_type: "api_token",
        connector_id: "github",
        display_name: "GitHub",
        provider: "github",
      },
      {
        auth_type: "api_key",
        connector_id: "feishu",
        display_name: "Feishu",
        provider: "feishu",
      },
      {
        auth_type: "qr_login",
        connector_id: "wechat",
        display_name: "WeChat",
        provider: "wechat",
      },
      {
        auth_type: "api_token",
        connector_id: "discord",
        display_name: "Discord",
        provider: "discord",
      },
    ] as const;

    for (const connector of connectors) {
      cleanup();
      listConnectorsMock.mockResolvedValue({
        items: [
          {
            account_count: 0,
            auth_type: connector.auth_type,
            capabilities: ["messages"],
            category: connector.provider === "github" ? "development" : "im",
            connector_id: connector.connector_id,
            description: `${connector.display_name} connector`,
            display_name: connector.display_name,
            enabled_count: 0,
            provider: connector.provider,
            status: "needs_config",
          },
        ],
        summary: {
          connected: 0,
          disabled: 0,
          error: 0,
          needs_config: 1,
          total: 1,
        },
      });
      renderView(onOpenSettings);
      fireEvent.click(
        await screen.findByRole("button", {
          name: `Open ${connector.display_name} details`,
        }),
      );
      const detailDialog = await screen.findByRole("dialog", {
        name: connector.display_name,
      });
      fireEvent.click(
        within(detailDialog).getByRole("button", { name: "Configure" }),
      );
      let editor: HTMLElement;
      if (connector.provider === "github") {
        editor = await screen.findByTestId("github-connector-editor");
      } else if (
        connector.provider === "feishu" ||
        connector.provider === "wechat"
      ) {
        editor = await screen.findByTestId(
          `trigger-connector-editor-${connector.provider}`,
        );
      } else {
        editor = await screen.findByTestId("gateway-editor-discord");
      }
      await waitFor(() => expect(editor).toBeVisible());
      const dialog = editor.closest<HTMLElement>('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(
        within(dialog as HTMLElement).getAllByRole("button", { name: "Close" }),
      ).toHaveLength(1);
      expect(
        within(dialog as HTMLElement).queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog as HTMLElement).getByRole("button", {
          name: `Back ${connector.display_name} details`,
        }),
      ).toBeVisible();
      expect(onOpenSettings).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog as HTMLElement).getByRole("button", { name: "Close" }),
      );
      await waitFor(() => expect(editor).not.toBeVisible());
    }
  }, 20_000);

  it("keeps the W3 editor open and shows an HTTP-200 rejected save", async () => {
    saveW3ConnectorMock.mockResolvedValue({
      error_code: "invalid_credentials",
      has_password: false,
      message: "W3 credentials were rejected.",
      ok: false,
      status: "error",
      username: "w3-user",
    });

    renderView();
    fireEvent.change(
      await screen.findByRole("searchbox", { name: "Search connectors" }),
      { target: { value: "w3" } },
    );
    fireEvent.click(await screen.findByTestId("connector-action-w3"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("w3-user")).toBeVisible(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("W3 credentials were rejected."),
    ).toBeVisible();
    expect(screen.getByLabelText("Username")).toBeVisible();
  });

  it("does not show connector empty states before connector items load", async () => {
    let resolveConnectors: (value: ConnectorListResponse) => void = () =>
      undefined;
    listConnectorsMock.mockReturnValue(
      new Promise<ConnectorListResponse>((resolve) => {
        resolveConnectors = resolve;
      }),
    );

    renderView();

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(
      screen.queryByText("No connectors reported."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No matching connectors."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("connector-card-github"),
    ).not.toBeInTheDocument();

    resolveConnectors(defaultConnectorsResponse());
    expect(await screen.findByTestId("connector-card-github")).toBeVisible();
  });

  it("renders V1 runtime tool cards and wires tool actions", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    renderView();
    fireEvent.click(await screen.findByText("CLI tools"));

    expect(await screen.findByTestId("runtime-tools-section")).toBeVisible();
    const ripgrepCard = screen.getByTestId("runtime-tool-card-rg");
    expect(ripgrepCard).toBeVisible();
    expect(screen.getByText("ripgrep")).toBeVisible();
    await waitFor(() =>
      expect(ripgrepCard).toHaveTextContent("Version 14.1.1"),
    );
    expect(ripgrepCard).toHaveTextContent("Managed");
    expect(ripgrepCard).not.toHaveTextContent(
      "C:\\Users\\yex\\.agent-teams\\bin\\rg.exe",
    );
    expect(screen.getByText("Relay Knowledge CLI")).toBeVisible();
    expect(
      screen.getByTestId("runtime-tool-card-relay-knowledge"),
    ).toHaveTextContent("Update 0.4.0");
    expect(screen.getByText("Install failed")).toBeVisible();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Copy binary path" })[0],
    );
    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(
        "C:\\Users\\yex\\.agent-teams\\bin\\rg.exe",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() =>
      expect(startRuntimeToolDownloadMock).toHaveBeenCalledWith(
        "relay-knowledge",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add to system environment variables",
      }),
    );
    await waitFor(() =>
      expect(addRuntimeToolsSystemPathMock).toHaveBeenCalled(),
    );
  }, 20_000);

  it("keeps fixed CLI cards visible while runtime tool items load", async () => {
    let resolveRuntimeTools: (value: BinaryToolListResponse) => void = () =>
      undefined;
    listRuntimeToolsMock.mockReturnValue(
      new Promise<BinaryToolListResponse>((resolve) => {
        resolveRuntimeTools = resolve;
      }),
    );

    renderView();
    fireEvent.click(await screen.findByText("CLI tools"));

    expect(await screen.findByTestId("runtime-tools-section")).toBeVisible();
    expect(screen.getByTestId("runtime-tool-card-rg")).toHaveTextContent(
      "Loading",
    );
    expect(screen.getByTestId("runtime-tool-card-gh")).toHaveTextContent(
      "Loading",
    );
    expect(screen.getByTestId("runtime-tool-card-clawhub")).toHaveTextContent(
      "Loading",
    );
    expect(
      screen.getByTestId("runtime-tool-card-relay-knowledge"),
    ).toHaveTextContent("Loading");
    expect(
      screen.queryByRole("button", { name: "Download" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();

    resolveRuntimeTools(defaultRuntimeToolsResponse());
    await waitFor(() =>
      expect(screen.getByTestId("runtime-tool-card-rg")).toHaveTextContent(
        "Version 14.1.1",
      ),
    );
  });

  it("keeps CLI cards and retry affordance when runtime tool loading fails", async () => {
    listRuntimeToolsMock.mockRejectedValue(
      new Error("Runtime tools unavailable"),
    );

    renderView();
    fireEvent.click(await screen.findByText("CLI tools"));

    expect(
      await screen.findByText("Runtime tool status is unavailable."),
    ).toBeVisible();
    expect(
      screen.getAllByText("Runtime tools unavailable").length,
    ).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByTestId("runtime-tool-card-rg")).toHaveTextContent(
      "Error",
    );
    expect(screen.getByTestId("runtime-tool-card-gh")).toHaveTextContent(
      "Error",
    );
    expect(screen.getByTestId("runtime-tool-card-clawhub")).toHaveTextContent(
      "Error",
    );
    expect(
      screen.getByTestId("runtime-tool-card-relay-knowledge"),
    ).toHaveTextContent("Error");
    expect(
      screen.queryByRole("button", { name: "Download" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(listRuntimeToolsMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces connector load errors", async () => {
    listConnectorsMock.mockRejectedValue(new Error("backend offline"));

    renderView();

    expect(await screen.findByText("Could not load connectors.")).toBeVisible();
    expect(
      screen.queryByTestId("connector-card-github"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh connectors" }));
    await waitFor(() => expect(listConnectorsMock).toHaveBeenCalledTimes(2));
  });
});

function discordAccount(
  overrides: Partial<DiscordGatewayAccountRecord> = {},
): DiscordGatewayAccountRecord {
  return {
    account_id: "discord-main",
    allow_channel_messages: false,
    allowed_channel_ids: [],
    application_id: null,
    bot_user_id: null,
    created_at: "2026-06-24T00:00:00Z",
    display_name: "Discord Main",
    last_error: null,
    normal_root_role_id: null,
    orchestration_preset_id: null,
    running: true,
    secret_status: { bot_token_configured: true },
    session_mode: "normal",
    shell_safety_policy_enabled: true,
    status: "enabled",
    thinking: { effort: "medium", enabled: true },
    updated_at: "2026-06-24T00:00:00Z",
    workspace_id: "default",
    yolo: true,
    ...overrides,
  };
}

function xiaolubanAccount(
  overrides: Partial<XiaolubanGatewayAccountRecord> = {},
): XiaolubanGatewayAccountRecord {
  return {
    account_id: "xiaoluban-main",
    base_url: "https://api.xiaoluban.com",
    created_at: "2026-06-24T00:00:00Z",
    derived_uid: "uid-main",
    display_name: "Xiaoluban Main",
    im_config: { workspace_id: "default" },
    notification_receiver: null,
    notification_receivers: [],
    notification_workspace_ids: [],
    notify_self: false,
    secret_status: { token_configured: true },
    status: "enabled",
    updated_at: "2026-06-24T00:00:00Z",
    ...overrides,
  };
}

function renderView(onOpenSettings = vi.fn()) {
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
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntApp>
          <ConnectorsView onOpenSettings={onOpenSettings} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function defaultConnectorsResponse(): ConnectorListResponse {
  return {
    summary: {
      connected: 1,
      disabled: 0,
      error: 0,
      needs_config: 1,
      total: 2,
    },
    items: [
      {
        account_count: 2,
        auth_type: "api_token",
        capabilities: ["repositories", "pull_requests"],
        category: "development",
        connector_id: "github",
        description: "Connect repositories and pull requests.",
        display_name: "GitHub",
        enabled_count: 1,
        last_activity_at: "2026-06-24T03:00:00Z",
        last_error: null,
        provider: "github",
        status: "connected",
      },
      {
        account_count: 0,
        auth_type: "username_password",
        capabilities: ["w3_auth"],
        category: "auth",
        connector_id: "w3",
        description: "Connect W3 authentication.",
        display_name: "W3",
        enabled_count: 0,
        last_activity_at: null,
        last_error: "Missing credentials",
        provider: "w3",
        status: "needs_config",
      },
    ],
  };
}

function defaultRuntimeToolsResponse(): BinaryToolListResponse {
  return {
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
      {
        display_name: "GitHub CLI",
        download_job_id: null,
        error_message: null,
        executable_name: "gh.exe",
        path: null,
        path_source: null,
        source_kind: "github_release",
        status: "missing",
        target_version: "2.74.2",
        tool_id: "gh",
        update_available: false,
        version: null,
      },
      {
        display_name: "ClawHub CLI",
        download_job_id: null,
        error_message: "Install failed",
        executable_name: "clawhub.cmd",
        path: null,
        path_source: null,
        source_kind: "npm_global",
        status: "error",
        target_version: null,
        tool_id: "clawhub",
        update_available: false,
        version: null,
      },
      {
        display_name: "Relay Knowledge CLI",
        download_job_id: null,
        error_message: null,
        executable_name: "relay-knowledge.exe",
        path: "C:\\Users\\yex\\.agent-teams\\bin\\relay-knowledge.exe",
        path_source: "managed",
        source_kind: "github_release",
        status: "ready",
        target_version: "0.4.0",
        tool_id: "relay-knowledge",
        update_available: true,
        version: "0.3.0",
      },
    ],
  };
}
