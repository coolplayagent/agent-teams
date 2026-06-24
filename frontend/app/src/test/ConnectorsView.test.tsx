import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listConnectors, testConnector } from "../api/client";
import { ConnectorsView } from "../features/connectors/ConnectorsView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  listConnectors: vi.fn(),
  testConnector: vi.fn(),
}));

const listConnectorsMock = vi.mocked(listConnectors);
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConnectorsView", () => {
  it("renders connector summary and searchable connector rows", async () => {
    renderView();

    expect(await screen.findByTestId("connectors-view")).toBeVisible();
    expect(await screen.findByText("GitHub")).toBeVisible();
    expect(screen.getByText("W3")).toBeVisible();
    expect(screen.getByText("1/2")).toBeVisible();
    expect(screen.getByText("repositories")).toBeVisible();
    expect(screen.getByText("pull requests")).toBeVisible();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search connectors" }),
      { target: { value: "w3" } },
    );

    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.getByText("W3")).toBeVisible();
    expect(screen.getByText("Missing credentials")).toBeVisible();
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
