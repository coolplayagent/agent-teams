import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { createRun, getRoleConfigOptions } from "../api/client";
import { Composer } from "../features/composer/Composer";
import type { RunStreamController } from "../runtime/useRunStreamController";

interface MockSenderProps {
  "aria-label"?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
}

vi.mock("@ant-design/x", () => ({
  Sender: (props: MockSenderProps) => (
    <textarea
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      onChange={(event) => props.onChange?.(event.target.value)}
      placeholder={props.placeholder}
      value={props.value ?? ""}
    />
  ),
}));

vi.mock("../api/client", () => ({
  createRun: vi.fn(),
  getRoleConfigOptions: vi.fn(),
  stopRun: vi.fn(),
}));

const createRunMock = vi.mocked(createRun);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Composer", () => {
  it("passes the selected target role to AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      coordinator_role_id: "Coordinator",
      main_agent_role_id: "MainAgent",
      normal_mode_roles: [
        {
          role_id: "Writer",
          name: "Writer",
          description: "Writes copy",
        },
      ],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
      target_role_id: "Writer",
    });
    const controller = runStreamController();

    renderComposer(controller);

    fireEvent.mouseDown(
      await screen.findByRole("combobox", { name: "Target role" }),
    );
    const writerOptions = await screen.findAllByText("Writer");
    const visibleWriterOption = writerOptions.at(-1);
    if (visibleWriterOption === undefined) {
      throw new Error("Writer option was not rendered.");
    }
    fireEvent.click(visibleWriterOption);
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Draft the update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [{ kind: "text", text: "Draft the update" }],
          target_role_id: "Writer",
        }),
      ),
    );
    expect(controller.startRunStream).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session-1",
    });
  });
});

function renderComposer(controller = runStreamController()) {
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
          <Composer runStreamController={controller} sessionId="session-1" />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function runStreamController(): RunStreamController {
  return {
    activeRunId: null,
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
  };
}
