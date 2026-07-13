import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNotificationConfig, saveNotificationConfig } from "../api/client";
import type { NotificationConfig } from "../api/contracts";
import { NotificationSettingsSection } from "../features/settings/NotificationSettingsSection";

const antdMocks = vi.hoisted(() => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({ message: antdMocks.message }),
    },
  };
});

vi.mock("../api/client", () => ({
  getNotificationConfig: vi.fn(),
  saveNotificationConfig: vi.fn(),
}));

const getNotificationConfigMock = vi.mocked(getNotificationConfig);
const saveNotificationConfigMock = vi.mocked(saveNotificationConfig);

describe("notification settings controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNotificationConfigMock.mockResolvedValue(notificationConfig());
    saveNotificationConfigMock.mockResolvedValue({ status: "ok" });
  });

  afterEach(() => cleanup());

  it("submits the visible switch and channel choices while preserving hidden channels", async () => {
    renderSection();

    const title = await screen.findByText("Tool approval requested");
    const rule = title.closest("article");
    expect(rule).not.toBeNull();
    fireEvent.click(
      within(rule as HTMLElement).getByRole("switch", {
        name: "Tool approval requested · Enabled",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveNotificationConfigMock).toHaveBeenCalledTimes(1));
    expect(saveNotificationConfigMock.mock.calls[0]?.[0]).toMatchObject({
      tool_approval_requested: {
        channels: ["feishu", "browser"],
        enabled: false,
      },
    });
  });
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <NotificationSettingsSection />
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function notificationConfig(): NotificationConfig {
  return {
    monitor_triggered: { channels: ["toast"], enabled: true },
    run_completed: { channels: ["browser"], enabled: true },
    run_failed: { channels: ["toast"], enabled: true },
    run_stopped: { channels: ["toast"], enabled: false },
    tool_approval_requested: {
      channels: ["feishu", "browser"],
      enabled: true,
    },
  };
}
