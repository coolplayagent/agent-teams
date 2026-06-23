import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { createRun, getRoleConfigOptions, injectRunMessage } from "../api/client";
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
  injectRunMessage: vi.fn(),
  stopRun: vi.fn(),
}));

const createRunMock = vi.mocked(createRun);
const getRoleConfigOptionsMock = vi.mocked(getRoleConfigOptions);
const injectRunMessageMock = vi.mocked(injectRunMessage);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
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

  it("passes selected thinking settings to AG-UI run creation", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    createRunMock.mockResolvedValue({
      run_id: "run-1",
      session_id: "session-1",
    });

    renderComposer();

    expect(screen.getByText("Thinking")).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Thinking" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Thinking effort" }));
    fireEvent.click(await screen.findByText("High"));
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Think through the migration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          thinking: {
            enabled: true,
            effort: "high",
          },
        }),
      ),
    );
    expect(localStorage.getItem("agent_teams_thinking_enabled")).toBe("true");
    expect(localStorage.getItem("agent_teams_thinking_effort")).toBe("high");
  });

  it("queues an injection instead of creating a run while a run is active", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Add a regression test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "Add a regression test",
        mode: "queued",
      }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("interrupts an active run with injected content", async () => {
    getRoleConfigOptionsMock.mockResolvedValue({
      normal_mode_roles: [],
    });
    injectRunMessageMock.mockResolvedValue({
      status: "ok",
      run_id: "run-1",
    });

    renderComposer(runStreamController("run-1"));

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Switch to the UI fix first" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));

    await waitFor(() =>
      expect(injectRunMessageMock).toHaveBeenCalledWith("run-1", {
        content: "Switch to the UI fix first",
        mode: "interrupt",
      }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
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

function runStreamController(activeRunId: string | null = null): RunStreamController {
  return {
    activeRunId,
    clearRunStream: vi.fn(),
    startRunStream: vi.fn(),
  };
}
