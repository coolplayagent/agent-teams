import { ConfigProvider } from "antd";
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
  createFeishuGatewayAccount,
  deleteFeishuGatewayAccount,
  deleteWeChatGatewayAccount,
  disableFeishuGatewayAccount,
  disableWeChatGatewayAccount,
  enableFeishuGatewayAccount,
  enableWeChatGatewayAccount,
  getOrchestrationConfig,
  getRoleConfigOptions,
  listFeishuGatewayAccounts,
  listWeChatGatewayAccounts,
  listWorkspaces,
  reloadFeishuGateway,
  reloadWeChatGateway,
  startWeChatGatewayLogin,
  updateFeishuGatewayAccount,
  updateWeChatGatewayAccount,
  waitWeChatGatewayLogin,
} from "../api/client";
import type {
  FeishuGatewayAccountCreateInput,
  FeishuGatewayAccountRecord,
  FeishuGatewayAccountUpdateInput,
  OrchestrationConfig,
  RoleConfigOptions,
  WeChatGatewayAccountRecord,
  WeChatGatewayAccountUpdateInput,
  WorkspaceRecord,
} from "../api/contracts";
import { TriggerSettingsSection } from "../features/settings/TriggerSettingsSection";

type ConfirmConfig = {
  onOk?: () => Promise<unknown> | unknown;
};

const antdMocks = vi.hoisted(() => ({
  message: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  modal: {
    confirm: vi.fn(),
  },
}));

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({
        message: antdMocks.message,
        modal: antdMocks.modal,
      }),
    },
  };
});

vi.mock("../api/client", () => ({
  createFeishuGatewayAccount: vi.fn(),
  deleteFeishuGatewayAccount: vi.fn(),
  deleteWeChatGatewayAccount: vi.fn(),
  disableFeishuGatewayAccount: vi.fn(),
  disableWeChatGatewayAccount: vi.fn(),
  enableFeishuGatewayAccount: vi.fn(),
  enableWeChatGatewayAccount: vi.fn(),
  getOrchestrationConfig: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  listFeishuGatewayAccounts: vi.fn(),
  listWeChatGatewayAccounts: vi.fn(),
  listWorkspaces: vi.fn(),
  reloadFeishuGateway: vi.fn(),
  reloadWeChatGateway: vi.fn(),
  startWeChatGatewayLogin: vi.fn(),
  updateFeishuGatewayAccount: vi.fn(),
  updateWeChatGatewayAccount: vi.fn(),
  waitWeChatGatewayLogin: vi.fn(),
}));

const createFeishuGatewayAccountMock = vi.mocked(createFeishuGatewayAccount);
const deleteFeishuGatewayAccountMock = vi.mocked(deleteFeishuGatewayAccount);
const deleteWeChatGatewayAccountMock = vi.mocked(deleteWeChatGatewayAccount);
const disableFeishuGatewayAccountMock = vi.mocked(disableFeishuGatewayAccount);
const disableWeChatGatewayAccountMock = vi.mocked(disableWeChatGatewayAccount);
const enableFeishuGatewayAccountMock = vi.mocked(enableFeishuGatewayAccount);
const enableWeChatGatewayAccountMock = vi.mocked(enableWeChatGatewayAccount);
const getOrchestrationConfigMock = vi.mocked(getOrchestrationConfig);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const listFeishuGatewayAccountsMock = vi.mocked(listFeishuGatewayAccounts);
const listWeChatGatewayAccountsMock = vi.mocked(listWeChatGatewayAccounts);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const reloadFeishuGatewayMock = vi.mocked(reloadFeishuGateway);
const reloadWeChatGatewayMock = vi.mocked(reloadWeChatGateway);
const startWeChatGatewayLoginMock = vi.mocked(startWeChatGatewayLogin);
const updateFeishuGatewayAccountMock = vi.mocked(updateFeishuGatewayAccount);
const updateWeChatGatewayAccountMock = vi.mocked(updateWeChatGatewayAccount);
const waitWeChatGatewayLoginMock = vi.mocked(waitWeChatGatewayLogin);

let feishuAccounts: FeishuGatewayAccountRecord[];
let wechatAccounts: WeChatGatewayAccountRecord[];

describe("TriggerSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feishuAccounts = [feishuAccount()];
    wechatAccounts = [wechatAccount()];
    listFeishuGatewayAccountsMock.mockImplementation(async () => feishuAccounts);
    listWeChatGatewayAccountsMock.mockImplementation(async () => wechatAccounts);
    listWorkspacesMock.mockResolvedValue(workspaces());
    getRoleConfigOptionsMock.mockResolvedValue(roleConfigOptions());
    getOrchestrationConfigMock.mockResolvedValue(orchestrationConfig());
    createFeishuGatewayAccountMock.mockImplementation(async (payload) => {
      const record = feishuAccountFromCreate(payload);
      feishuAccounts = [record, ...feishuAccounts];
      return record;
    });
    updateFeishuGatewayAccountMock.mockImplementation(async (accountId, payload) => {
      const existing = feishuAccounts.find((account) => account.account_id === accountId);
      const record = feishuAccountFromUpdate(existing ?? feishuAccount(), payload);
      feishuAccounts = feishuAccounts.map((account) =>
        account.account_id === accountId ? record : account,
      );
      return record;
    });
    disableFeishuGatewayAccountMock.mockImplementation(async (accountId) =>
      updateFeishuStatus(accountId, "disabled"),
    );
    enableFeishuGatewayAccountMock.mockImplementation(async (accountId) =>
      updateFeishuStatus(accountId, "enabled"),
    );
    deleteFeishuGatewayAccountMock.mockResolvedValue({ status: "ok" });
    reloadFeishuGatewayMock.mockResolvedValue({ status: "ok" });
    startWeChatGatewayLoginMock.mockResolvedValue({
      message: "Scan the QR code.",
      qr_code_url: "https://example.test/wechat-qr.png",
      session_key: "wechat-login-1",
    });
    waitWeChatGatewayLoginMock.mockResolvedValue({
      account_id: "wx-account-new",
      connected: true,
      message: "WeChat account connected.",
    });
    updateWeChatGatewayAccountMock.mockImplementation(async (accountId, payload) => {
      const existing = wechatAccounts.find((account) => account.account_id === accountId);
      const record = wechatAccountFromUpdate(existing ?? wechatAccount(), payload);
      wechatAccounts = wechatAccounts.map((account) =>
        account.account_id === accountId ? record : account,
      );
      return record;
    });
    enableWeChatGatewayAccountMock.mockImplementation(async (accountId) =>
      updateWeChatStatus(accountId, "enabled"),
    );
    disableWeChatGatewayAccountMock.mockImplementation(async (accountId) =>
      updateWeChatStatus(accountId, "disabled"),
    );
    deleteWeChatGatewayAccountMock.mockResolvedValue({ status: "ok" });
    reloadWeChatGatewayMock.mockResolvedValue({ status: "ok" });
    antdMocks.modal.confirm.mockImplementation((config: ConfirmConfig) => {
      const result = config.onOk?.();
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
      return {
        destroy: vi.fn(),
        update: vi.fn(),
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders gateway provider lists and opens Feishu editing as a detail page", async () => {
    renderSection();

    expect(await screen.findByText("Feishu Main")).toBeVisible();
    expect(screen.getByText("WeChat Main")).toBeVisible();
    expect(screen.getByText("Credentials ready")).toBeVisible();
    expect(screen.getByText("0/1")).toBeVisible();
    expect(screen.getByText("WeChat gateway accounts, login, and session targets."))
      .toBeVisible();

    const feishuList = screen.getByLabelText("Feishu accounts");
    fireEvent.click(within(feishuList).getByRole("button", { name: "Edit" }));

    expect(await screen.findByDisplayValue("feishu_main")).toBeVisible();
    expect(screen.getAllByText("account-feishu-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Leave blank to keep the saved value.").length)
      .toBeGreaterThan(0);
    expect(screen.queryByText("WeChat Main")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
  });

  it("loads only the provider requested by an embedded connector editor", async () => {
    renderSection({ embedded: true, provider: "feishu" });

    expect(await screen.findByText("Feishu Main")).toBeVisible();
    expect(screen.queryByText("WeChat Main")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Feishu" })).not.toBeInTheDocument();
    expect(listWeChatGatewayAccountsMock).not.toHaveBeenCalled();
  });

  it("creates Feishu gateway accounts with embedded bot and session config", async () => {
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "New Feishu trigger" }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "feishu_ops" },
    });
    fireEvent.change(screen.getByLabelText("App ID"), {
      target: { value: "cli_demo" },
    });
    fireEvent.change(screen.getByLabelText("App name"), {
      target: { value: "Agent Teams Bot" },
    });
    fireEvent.change(screen.getByLabelText("App Secret"), {
      target: { value: "secret-demo" },
    });
    await chooseSelectOption("Workspace", /Ops Workspace/);
    await chooseSelectOption("Session mode", "Orchestration");
    await chooseSelectOption("Orchestration preset", /Ops Preset/);
    fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));
    await chooseSelectOption("Thinking effort", "high");
    fireEvent.click(screen.getByRole("switch", { name: "YOLO" }));
    fireEvent.click(screen.getByRole("switch", { name: "Shell safety policy" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createFeishuGatewayAccountMock).toHaveBeenCalledWith({
        display_name: null,
        enabled: true,
        name: "feishu_ops",
        secret_config: {
          app_secret: "secret-demo",
        },
        source_config: {
          app_id: "cli_demo",
          app_name: "Agent Teams Bot",
          provider: "feishu",
          trigger_rule: "mention_only",
        },
        target_config: {
          normal_root_role_id: null,
          orchestration_preset_id: "ops",
          session_mode: "orchestration",
          shell_safety_policy_enabled: false,
          thinking: { enabled: true, effort: "high" },
          workspace_id: "workspace-ops",
          yolo: false,
        },
      }),
    );
    expect(updateFeishuGatewayAccountMock).not.toHaveBeenCalled();
    expect(antdMocks.message.success).toHaveBeenCalledWith(
      "Feishu trigger created.",
    );
  }, 45000);

  it("updates existing Feishu accounts without create-only fields", async () => {
    renderSection();

    const feishuList = await screen.findByLabelText("Feishu accounts");
    fireEvent.click(within(feishuList).getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("App ID"), {
      target: { value: "cli_existing_updated" },
    });
    fireEvent.change(screen.getByLabelText("App name"), {
      target: { value: "Agent Teams Bot Updated" },
    });
    await chooseSelectOption("Normal root role", /Spec Coder/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateFeishuGatewayAccountMock).toHaveBeenCalledTimes(1));
    expect(updateFeishuGatewayAccountMock.mock.calls[0]?.[0]).toBe("account-feishu-1");
    expect(updateFeishuGatewayAccountMock.mock.calls[0]?.[1]).toMatchObject({
      display_name: "Feishu Main",
      name: "feishu_main",
      source_config: {
        app_id: "cli_existing_updated",
        app_name: "Agent Teams Bot Updated",
        provider: "feishu",
        trigger_rule: "mention_only",
      },
      target_config: {
        normal_root_role_id: "SpecCoder",
        orchestration_preset_id: null,
        session_mode: "normal",
        shell_safety_policy_enabled: true,
        thinking: { enabled: false, effort: null },
        workspace_id: "default",
        yolo: true,
      },
    });
    expect(createFeishuGatewayAccountMock).not.toHaveBeenCalled();
  }, 30000);

  it("starts WeChat login polling and saves WeChat account edits", async () => {
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Connect WeChat" }));

    await waitFor(() =>
      expect(startWeChatGatewayLoginMock).toHaveBeenCalledWith({}),
    );
    await waitFor(() =>
      expect(waitWeChatGatewayLoginMock).toHaveBeenCalledWith({
        session_key: "wechat-login-1",
        timeout_ms: 480000,
      }),
    );
    expect(antdMocks.message.success).toHaveBeenCalledWith(
      "WeChat account connected.",
    );

    const wechatList = await screen.findByLabelText("WeChat accounts");
    fireEvent.click(within(wechatList).getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByLabelText("Display name"), {
      target: { value: "Ops WeChat" },
    });
    await chooseSelectOption("Workspace", /Ops Workspace/);
    await chooseSelectOption("Session mode", "Orchestration");
    await chooseSelectOption("Orchestration preset", /Ops Preset/);
    fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));
    await chooseSelectOption("Thinking effort", "high");
    fireEvent.click(screen.getByRole("switch", { name: "YOLO" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateWeChatGatewayAccountMock).toHaveBeenCalledTimes(1));
    expect(updateWeChatGatewayAccountMock).toHaveBeenCalledWith("wx-account-1", {
      base_url: "https://wechat.example.test",
      cdn_base_url: "https://cdn.example.test",
      display_name: "Ops WeChat",
      normal_root_role_id: null,
      orchestration_preset_id: "ops",
      route_tag: "route-a",
      session_mode: "orchestration",
      thinking: { enabled: true, effort: "high" },
      workspace_id: "workspace-ops",
      yolo: false,
    });
  }, 45000);
});

async function chooseSelectOption(label: string, optionText: RegExp | string) {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  const matches = await screen.findAllByText(optionText);
  fireEvent.click(matches[matches.length - 1] as HTMLElement);
}

function renderSection(
  props: Parameters<typeof TriggerSettingsSection>[0] = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <TriggerSettingsSection {...props} />
      </ConfigProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

function workspaces(): WorkspaceRecord[] {
  return [
    {
      display_name: "Default Workspace",
      root_path: "C:/work/default",
      workspace_id: "default",
    },
    {
      display_name: "Ops Workspace",
      root_path: "C:/work/ops",
      workspace_id: "workspace-ops",
    },
  ];
}

function roleConfigOptions(): RoleConfigOptions {
  return {
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      { name: "Main Agent", role_id: "MainAgent" },
      { name: "Spec Coder", role_id: "SpecCoder" },
    ],
    subagent_roles: [],
  };
}

function orchestrationConfig(): OrchestrationConfig {
  return {
    default_orchestration_preset_id: "default",
    presets: [
      { name: "Default Preset", preset_id: "default" },
      { name: "Ops Preset", preset_id: "ops" },
    ],
  };
}

function feishuAccount(): FeishuGatewayAccountRecord {
  return {
    account_id: "account-feishu-1",
    created_at: "2026-06-01T00:00:00Z",
    display_name: "Feishu Main",
    name: "feishu_main",
    secret_config: null,
    secret_status: { app_secret_configured: false },
    source_config: {
      app_id: "cli_existing",
      app_name: "Agent Teams Bot",
      provider: "feishu",
      trigger_rule: "mention_only",
    },
    status: "enabled",
    target_config: {
      normal_root_role_id: "MainAgent",
      orchestration_preset_id: null,
      session_mode: "normal",
      shell_safety_policy_enabled: true,
      thinking: { enabled: false, effort: null },
      workspace_id: "default",
      yolo: true,
    },
    updated_at: "2026-06-02T00:00:00Z",
  };
}

function wechatAccount(): WeChatGatewayAccountRecord {
  return {
    account_id: "wx-account-1",
    base_url: "https://wechat.example.test",
    cdn_base_url: "https://cdn.example.test",
    created_at: "2026-06-01T00:00:00Z",
    display_name: "WeChat Main",
    last_error: null,
    last_login_at: "2026-06-02T00:00:00Z",
    normal_root_role_id: "MainAgent",
    orchestration_preset_id: null,
    remote_user_id: "wx-user-1",
    route_tag: "route-a",
    running: true,
    session_mode: "normal",
    status: "enabled",
    sync_cursor: "cursor-1",
    thinking: { enabled: false, effort: null },
    updated_at: "2026-06-02T00:00:00Z",
    workspace_id: "default",
    yolo: true,
  };
}

function feishuAccountFromCreate(
  payload: FeishuGatewayAccountCreateInput,
): FeishuGatewayAccountRecord {
  return {
    account_id: "account-created",
    created_at: "2026-06-03T00:00:00Z",
    display_name: payload.display_name ?? "",
    name: payload.name,
    secret_config: payload.secret_config ?? null,
    secret_status: {
      app_secret_configured: payload.secret_config?.app_secret !== undefined,
    },
    source_config: payload.source_config,
    status: payload.enabled === false ? "disabled" : "enabled",
    target_config: payload.target_config,
    updated_at: "2026-06-03T00:00:00Z",
  };
}

function feishuAccountFromUpdate(
  existing: FeishuGatewayAccountRecord,
  payload: FeishuGatewayAccountUpdateInput,
): FeishuGatewayAccountRecord {
  return {
    ...existing,
    display_name: payload.display_name ?? existing.display_name,
    name: payload.name ?? existing.name,
    secret_config: payload.secret_config ?? existing.secret_config,
    source_config: payload.source_config ?? existing.source_config,
    target_config: payload.target_config ?? existing.target_config,
    updated_at: "2026-06-04T00:00:00Z",
  };
}

function wechatAccountFromUpdate(
  existing: WeChatGatewayAccountRecord,
  payload: WeChatGatewayAccountUpdateInput,
): WeChatGatewayAccountRecord {
  return {
    ...existing,
    base_url: payload.base_url ?? existing.base_url,
    cdn_base_url: payload.cdn_base_url ?? existing.cdn_base_url,
    display_name: payload.display_name ?? existing.display_name,
    normal_root_role_id:
      payload.normal_root_role_id === undefined
        ? existing.normal_root_role_id
        : payload.normal_root_role_id,
    orchestration_preset_id:
      payload.orchestration_preset_id === undefined
        ? existing.orchestration_preset_id
        : payload.orchestration_preset_id,
    route_tag: payload.route_tag ?? existing.route_tag,
    session_mode: payload.session_mode ?? existing.session_mode,
    thinking: payload.thinking ?? existing.thinking,
    workspace_id: payload.workspace_id ?? existing.workspace_id,
    yolo: payload.yolo ?? existing.yolo,
  };
}

function updateFeishuStatus(
  accountId: string,
  status: FeishuGatewayAccountRecord["status"],
): FeishuGatewayAccountRecord {
  const account = feishuAccounts.find((item) => item.account_id === accountId);
  const updated = { ...(account ?? feishuAccount()), status };
  feishuAccounts = feishuAccounts.map((item) =>
    item.account_id === accountId ? updated : item,
  );
  return updated;
}

function updateWeChatStatus(
  accountId: string,
  status: WeChatGatewayAccountRecord["status"],
): WeChatGatewayAccountRecord {
  const account = wechatAccounts.find((item) => item.account_id === accountId);
  const updated = { ...(account ?? wechatAccount()), status };
  wechatAccounts = wechatAccounts.map((item) =>
    item.account_id === accountId ? updated : item,
  );
  return updated;
}
