import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  getGitHubConfig,
  getGitHubWebhookTunnelStatus,
  probeGitHubConnectivity,
  probeGitHubWebhookConnectivity,
  revealGitHubToken,
  saveGitHubConfig,
  startGitHubWebhookTunnel,
  stopGitHubWebhookTunnel,
} from "../api/client";
import type {
  GitHubConfigView,
  LocalhostRunTunnelStatus,
} from "../api/contracts";
import { GitHubSettingsSection } from "../features/settings/GitHubSettingsSection";

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
  getGitHubConfig: vi.fn(),
  getGitHubWebhookTunnelStatus: vi.fn(),
  probeGitHubConnectivity: vi.fn(),
  probeGitHubWebhookConnectivity: vi.fn(),
  revealGitHubToken: vi.fn(),
  saveGitHubConfig: vi.fn(),
  startGitHubWebhookTunnel: vi.fn(),
  stopGitHubWebhookTunnel: vi.fn(),
}));

const getGitHubConfigMock = vi.mocked(getGitHubConfig);
const getGitHubWebhookTunnelStatusMock = vi.mocked(getGitHubWebhookTunnelStatus);
const probeGitHubConnectivityMock = vi.mocked(probeGitHubConnectivity);
const probeGitHubWebhookConnectivityMock = vi.mocked(probeGitHubWebhookConnectivity);
const revealGitHubTokenMock = vi.mocked(revealGitHubToken);
const saveGitHubConfigMock = vi.mocked(saveGitHubConfig);
const startGitHubWebhookTunnelMock = vi.mocked(startGitHubWebhookTunnel);
const stopGitHubWebhookTunnelMock = vi.mocked(stopGitHubWebhookTunnel);

let githubConfig: GitHubConfigView;
let tunnelStatus: LocalhostRunTunnelStatus;

describe("GitHubSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubConfig = {
      token_configured: true,
      webhook_base_url: "https://hooks.example",
    };
    tunnelStatus = {
      provider: "localhost.run",
      public_url: null,
      status: "idle",
    };
    getGitHubConfigMock.mockImplementation(async () => githubConfig);
    getGitHubWebhookTunnelStatusMock.mockImplementation(async () => tunnelStatus);
    revealGitHubTokenMock.mockResolvedValue({ token: "ghp_saved" });
    saveGitHubConfigMock.mockImplementation(async (config) => {
      if (Object.prototype.hasOwnProperty.call(config, "token")) {
        githubConfig = {
          ...githubConfig,
          token_configured: config.token !== null,
        };
      }
      if (Object.prototype.hasOwnProperty.call(config, "webhook_base_url")) {
        githubConfig = {
          ...githubConfig,
          webhook_base_url: config.webhook_base_url,
        };
      }
      return { status: "ok" };
    });
    probeGitHubConnectivityMock.mockResolvedValue({
      checked_at: "2026-06-24T00:00:00Z",
      diagnostics: {
        auth_valid: true,
        binary_available: true,
        bundled_binary: true,
        used_proxy: false,
      },
      gh_version: "gh version 2.0.0",
      host: "github.com",
      latency_ms: 21,
      ok: true,
      retryable: false,
      username: "octocat",
    });
    probeGitHubWebhookConnectivityMock.mockResolvedValue({
      callback_url: "https://hooks.example/api/triggers/github/deliveries",
      checked_at: "2026-06-24T00:00:00Z",
      diagnostics: {
        endpoint_reachable: true,
        redirected: false,
        used_proxy: false,
      },
      final_url: "https://hooks.example/api/system/health",
      health_url: "https://hooks.example/api/system/health",
      latency_ms: 34,
      ok: true,
      retryable: false,
      status_code: 200,
      webhook_base_url: "https://hooks.example",
    });
    startGitHubWebhookTunnelMock.mockResolvedValue({
      last_message: "Requesting a temporary public URL from localhost.run...",
      provider: "localhost.run",
      public_url: null,
      status: "starting",
    });
    stopGitHubWebhookTunnelMock.mockImplementation(async () => {
      githubConfig = { ...githubConfig, webhook_base_url: null };
      tunnelStatus = {
        provider: "localhost.run",
        public_url: "https://delayed-tunnel.lhr.life",
        status: "stopped",
      };
      return tunnelStatus;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves saved tokens through unfocused autofill, reveal, probe, and save", async () => {
    renderSection();

    const tokenInput = await screen.findByLabelText("Token");
    expect(tokenInput).toHaveAttribute("placeholder", "************");
    expect(screen.getByText("Leave blank to keep the saved token.")).toBeVisible();
    expect(screen.getByRole("link", { name: /GitHub tokens/ })).toHaveAttribute(
      "href",
      "https://github.com/settings/tokens",
    );

    fireEvent.change(tokenInput, { target: { value: "browser_password" } });
    await waitFor(() => expect(tokenInput).toHaveValue(""));

    fireEvent.click(screen.getByRole("button", { name: "Test GitHub CLI" }));
    await waitFor(() => expect(probeGitHubConnectivityMock).toHaveBeenCalledWith({}));
    expect(await screen.findByText("Connected as octocat in 21 ms.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() => expect(saveGitHubConfigMock).toHaveBeenCalledWith({}));
    expect(antdMocks.message.success).toHaveBeenCalledWith("GitHub settings saved.");

    fireEvent.click(screen.getByRole("button", { name: "Reveal token" }));
    await waitFor(() => expect(revealGitHubTokenMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("ghp_saved")).toBeVisible();

    saveGitHubConfigMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() => expect(saveGitHubConfigMock).toHaveBeenCalledWith({}));

    fireEvent.focus(screen.getByLabelText("Token"));
    fireEvent.change(screen.getByLabelText("Token"), {
      target: { value: "ghp_replacement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test GitHub CLI" }));
    await waitFor(() =>
      expect(probeGitHubConnectivityMock).toHaveBeenLastCalledWith({
        token: "ghp_replacement",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() =>
      expect(saveGitHubConfigMock).toHaveBeenLastCalledWith({
        token: "ghp_replacement",
      }),
    );
  });

  it("updates webhook previews, blocks empty probes, and saves webhook config", async () => {
    renderSection();

    expect(
      await screen.findByText("https://hooks.example/api/triggers/github/deliveries"),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Test callback" }));
    await waitFor(() =>
      expect(probeGitHubWebhookConnectivityMock).toHaveBeenCalledWith({
        webhook_base_url: "https://hooks.example",
      }),
    );
    expect(await screen.findByText("Callback returned 200 in 34 ms.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Webhook base URL"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test callback" }));
    expect(probeGitHubWebhookConnectivityMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Enter a webhook base URL before testing.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Webhook base URL"), {
      target: { value: "https://changed.example" },
    });
    expect(
      screen.getByText("https://changed.example/api/triggers/github/deliveries"),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() =>
      expect(saveGitHubConfigMock).toHaveBeenCalledWith({
        webhook_base_url: "https://changed.example",
      }),
    );
  });

  it("does not overwrite an edited webhook while token refresh is in flight", async () => {
    let resolveRefresh: (config: GitHubConfigView) => void = () => undefined;
    getGitHubConfigMock
      .mockResolvedValueOnce(githubConfig)
      .mockReturnValueOnce(
        new Promise<GitHubConfigView>((resolve) => {
          resolveRefresh = resolve;
        }),
      );
    renderSection();

    const tokenInput = await screen.findByLabelText("Token");
    fireEvent.focus(tokenInput);
    fireEvent.change(tokenInput, { target: { value: "ghp_next" } });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() =>
      expect(saveGitHubConfigMock).toHaveBeenCalledWith({ token: "ghp_next" }),
    );

    fireEvent.change(screen.getByLabelText("Webhook base URL"), {
      target: { value: "https://changed.example" },
    });
    resolveRefresh({
      token_configured: true,
      webhook_base_url: "https://hooks.example",
    });

    expect(
      await screen.findByText(
        "https://changed.example/api/triggers/github/deliveries",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Webhook base URL"))
      .toHaveValue("https://changed.example");
  });

  it("backfills a delayed tunnel public URL and clears matching URLs on stop", async () => {
    githubConfig = {
      token_configured: false,
      webhook_base_url: "https://expired-tunnel.lhr.life",
    };
    const idleStatus: LocalhostRunTunnelStatus = {
      provider: "localhost.run",
      public_url: null,
      status: "idle",
    };
    const delayedStatus: LocalhostRunTunnelStatus = {
      local_host: "127.0.0.1",
      local_port: 8000,
      provider: "localhost.run",
      public_url: "https://delayed-tunnel.lhr.life",
      status: "active",
    };
    getGitHubWebhookTunnelStatusMock
      .mockResolvedValueOnce(idleStatus)
      .mockResolvedValueOnce(delayedStatus)
      .mockResolvedValue(delayedStatus);

    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Start tunnel" }));
    await waitFor(() =>
      expect(startGitHubWebhookTunnelMock).toHaveBeenCalledWith({
        auto_save_webhook_base_url: true,
      }),
    );
    await waitFor(() =>
      expect(saveGitHubConfigMock).toHaveBeenCalledWith({
        webhook_base_url: "https://delayed-tunnel.lhr.life",
      }),
    );
    expect(
      await screen.findByText(
        "https://delayed-tunnel.lhr.life/api/triggers/github/deliveries",
      ),
    ).toBeVisible();
    expect(screen.getByText("Tunnel started at https://delayed-tunnel.lhr.life.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Stop tunnel" }));
    await waitFor(() =>
      expect(stopGitHubWebhookTunnelMock).toHaveBeenCalledWith({
        clear_webhook_base_url_if_matching: true,
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Webhook base URL")).toHaveValue(""));
    expect(screen.getByText("Tunnel stopped.")).toBeVisible();
  });
});

function renderSection() {
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
      <ConfigProvider button={{ autoInsertSpace: false }}>
        {renderWithStrictModeBoundary(<GitHubSettingsSection />)}
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}
