import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRuntimeStore } from "../runtime/runtimeStore";
import { useRunStreamController } from "../runtime/useRunStreamController";

const streamMocks = vi.hoisted(() => ({
  latestOptions: null as unknown,
  openRunStream: vi.fn((options: unknown) => {
    streamMocks.latestOptions = options;
    return { close: vi.fn() };
  }),
}));

vi.mock("../runtime/streamClient", () => ({
  openRunStream: streamMocks.openRunStream,
}));

afterEach(() => {
  cleanup();
  useRuntimeStore.getState().resetRuntimeState();
  streamMocks.latestOptions = null;
  vi.clearAllMocks();
});

describe("useRunStreamController", () => {
  it("refreshes session token usage when a run stream closes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <RunStreamHarness />
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start stream" }));
    const options = streamMocks.latestOptions as { onClosed: () => void };
    act(() => {
      options.onClosed();
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["sessions", "session-1", "token-usage"],
      }),
    );
  });
});

function RunStreamHarness() {
  const controller = useRunStreamController();
  return (
    <button
      type="button"
      onClick={() =>
        controller.startRunStream({
          runId: "run-1",
          sessionId: "session-1",
        })
      }
    >
      Start stream
    </button>
  );
}
