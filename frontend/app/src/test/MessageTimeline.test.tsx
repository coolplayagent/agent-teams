import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listSessionMessages } from "../api/client";
import { MessageTimeline } from "../features/timeline/MessageTimeline";
import { useRuntimeStore } from "../runtime/runtimeStore";

vi.mock("../api/client", () => ({
  listSessionMessages: vi.fn(),
}));

const listSessionMessagesMock = vi.mocked(listSessionMessages);

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  vi.clearAllMocks();
});

describe("MessageTimeline", () => {
  it("copies the latest non-user answer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    listSessionMessagesMock.mockResolvedValue([
      {
        message_id: "user-1",
        role: "user",
        content: "What changed?",
      },
      {
        message_id: "assistant-1",
        role: "assistant",
        content: "Earlier answer",
      },
      {
        message_id: "assistant-2",
        role_id: "MainAgent",
        parts: [{ kind: "text", text: "Latest answer" }],
      },
    ]);

    renderTimeline();

    const copyButton = await screen.findByRole("button", {
      name: "Copy last answer",
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Latest answer"));
  });
});

function renderTimeline() {
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
      <ConfigProvider>
        <AntApp>
          <MessageTimeline sessionId="session-1" />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
