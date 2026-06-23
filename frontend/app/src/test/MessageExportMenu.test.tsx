import { ConfigProvider } from "antd";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listSessionRounds } from "../api/client";
import { MessageExportMenu } from "../features/shell/MessageExportMenu";
import { exportSessionMessages } from "../features/shell/messageExport";

vi.mock("../api/client", () => ({
  listSessionRounds: vi.fn(),
}));

vi.mock("../features/shell/messageExport", () => ({
  exportSessionMessages: vi.fn(),
}));

const listSessionRoundsMock = vi.mocked(listSessionRounds);
const exportSessionMessagesMock = vi.mocked(exportSessionMessages);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MessageExportMenu", () => {
  it("exposes HTML and PNG export choices", async () => {
    renderMessageExportMenu();

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));

    expect(await screen.findByText("HTML")).toBeInTheDocument();
    expect(await screen.findByText("PNG")).toBeInTheDocument();
  });

  it("exports selected session rounds as PNG", async () => {
    listSessionRoundsMock.mockResolvedValue({
      has_more: false,
      items: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Done" }] },
              role: "assistant",
            },
          ],
          run_id: "run-1",
        },
      ],
      next_cursor: null,
    });
    exportSessionMessagesMock.mockResolvedValue(1);
    const messenger = renderMessageExportMenu();

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));
    fireEvent.click(await screen.findByText("PNG"));

    await waitFor(() =>
      expect(listSessionRoundsMock).toHaveBeenCalledWith("session-1", {
        cursorRunId: null,
        limit: 50,
      }),
    );
    expect(exportSessionMessagesMock).toHaveBeenCalledWith({
      format: "png",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Done" }] },
              role: "assistant",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session-1",
    });
    expect(messenger.success).toHaveBeenCalledWith("Messages exported as PNG.");
  });

  it("fetches all session round pages before exporting", async () => {
    listSessionRoundsMock
      .mockResolvedValueOnce({
        has_more: true,
        items: [{ created_at: "2026-06-23T02:00:00Z", run_id: "run-2" }],
        next_cursor: "run-2",
      })
      .mockResolvedValueOnce({
        has_more: false,
        items: [{ created_at: "2026-06-23T01:00:00Z", run_id: "run-1" }],
        next_cursor: null,
      });
    exportSessionMessagesMock.mockResolvedValue(1);

    renderMessageExportMenu();

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));
    fireEvent.click(await screen.findByText("HTML"));

    await waitFor(() => expect(exportSessionMessagesMock).toHaveBeenCalled());
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(1, "session-1", {
      cursorRunId: null,
      limit: 50,
    });
    expect(listSessionRoundsMock).toHaveBeenNthCalledWith(2, "session-1", {
      cursorRunId: "run-2",
      limit: 50,
    });
    expect(exportSessionMessagesMock).toHaveBeenCalledWith({
      format: "html",
      rounds: [
        { created_at: "2026-06-23T01:00:00Z", run_id: "run-1" },
        { created_at: "2026-06-23T02:00:00Z", run_id: "run-2" },
      ],
      sessionId: "session-1",
    });
  });

  it("warns when a format is chosen without an active session", async () => {
    const messenger = renderMessageExportMenu(null);

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));
    fireEvent.click(await screen.findByText("HTML"));

    expect(messenger.warning).toHaveBeenCalledWith(
      "Select a session before exporting.",
    );
    expect(listSessionRoundsMock).not.toHaveBeenCalled();
  });
});

function renderMessageExportMenu(sessionId: string | null = "session-1") {
  const messenger = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  };
  render(
    <ConfigProvider>
      <MessageExportMenu messenger={messenger} sessionId={sessionId} />
    </ConfigProvider>,
  );
  return messenger;
}
