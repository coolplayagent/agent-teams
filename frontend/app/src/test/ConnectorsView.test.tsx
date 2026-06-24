import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addRuntimeToolsSystemPath,
  getRuntimeToolDownload,
  listConnectors,
  listRuntimeTools,
  startRuntimeToolDownload,
  testConnector,
} from "../api/client";
import { ConnectorsView } from "../features/connectors/ConnectorsView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  addRuntimeToolsSystemPath: vi.fn(),
  getRuntimeToolDownload: vi.fn(),
  listConnectors: vi.fn(),
  listRuntimeTools: vi.fn(),
  startRuntimeToolDownload: vi.fn(),
  testConnector: vi.fn(),
}));

const addRuntimeToolsSystemPathMock = vi.mocked(addRuntimeToolsSystemPath);
const getRuntimeToolDownloadMock = vi.mocked(getRuntimeToolDownload);
const listConnectorsMock = vi.mocked(listConnectors);
const listRuntimeToolsMock = vi.mocked(listRuntimeTools);
const startRuntimeToolDownloadMock = vi.mocked(startRuntimeToolDownload);
const testConnectorMock = vi.mocked(testConnector);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  listConnectorsMock.mockResolvedValue({
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
  listRuntimeToolsMock.mockResolvedValue({
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
  it("renders connector summary with searchable cards and a detail panel", async () => {
    renderView();

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(await screen.findByTestId("connector-card-github")).toBeVisible();
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    expect(screen.getByTestId("connector-detail-github")).toBeVisible();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    expect(screen.getByText("repositories")).toBeVisible();
    expect(screen.getByText("pull requests")).toBeVisible();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search connectors" }),
      { target: { value: "w3" } },
    );

    await waitFor(() =>
      expect(screen.queryByTestId("connector-card-github")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("connector-card-w3")).toBeVisible();
    expect(screen.getByTestId("connector-detail-w3")).toBeVisible();
    expect(screen.getAllByText("Missing credentials").length).toBeGreaterThan(0);
  });

  it("runs a real connector test action and displays the probe result", async () => {
    renderView();

    fireEvent.click(
      await screen.findByRole("button", { name: "Test GitHub connection" }),
    );

    await waitFor(() => expect(testConnectorMock).toHaveBeenCalledWith("github"));
    expect(
      await screen.findByText("GitHub connection is healthy."),
    ).toBeVisible();
  });

  it("renders V1 runtime tool cards and wires tool actions", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    renderView();

    expect(await screen.findByTestId("runtime-tools-section")).toBeVisible();
    const ripgrepCard = screen.getByTestId("runtime-tool-card-rg");
    expect(ripgrepCard).toBeVisible();
    expect(screen.getByText("ripgrep")).toBeVisible();
    await waitFor(() => expect(ripgrepCard).toHaveTextContent("Version 14.1.1"));
    expect(ripgrepCard).toHaveTextContent("Managed");
    expect(screen.getByText("Relay Knowledge CLI")).toBeVisible();
    expect(screen.getByTestId("runtime-tool-card-relay-knowledge")).toHaveTextContent(
      "Update 0.4.0",
    );
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
  });

  it("surfaces connector load errors", async () => {
    listConnectorsMock.mockRejectedValue(new Error("backend offline"));

    renderView();

    expect(await screen.findByText("Could not load connectors.")).toBeVisible();
  });
});

function renderView() {
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
          <ConnectorsView />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
