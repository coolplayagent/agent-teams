import { ConfigProvider } from "antd";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listSessionMessages } from "../api/client";
import { MessageExportMenu } from "../features/shell/MessageExportMenu";
import { exportSessionMessages } from "../features/shell/messageExport";

vi.mock("../api/client", () => ({
  listSessionMessages: vi.fn(),
}));

vi.mock("../features/shell/messageExport", () => ({
  exportSessionMessages: vi.fn(),
}));

const listSessionMessagesMock = vi.mocked(listSessionMessages);
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

  it("exports selected session messages as PNG", async () => {
    listSessionMessagesMock.mockResolvedValue([
      { role: "assistant", content: "Done" },
    ]);
    exportSessionMessagesMock.mockResolvedValue(1);
    const messenger = renderMessageExportMenu();

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));
    fireEvent.click(await screen.findByText("PNG"));

    await waitFor(() =>
      expect(listSessionMessagesMock).toHaveBeenCalledWith("session-1"),
    );
    expect(exportSessionMessagesMock).toHaveBeenCalledWith({
      format: "png",
      messages: [{ role: "assistant", content: "Done" }],
      sessionId: "session-1",
    });
    expect(messenger.success).toHaveBeenCalledWith("Messages exported as PNG.");
  });

  it("warns when a format is chosen without an active session", async () => {
    const messenger = renderMessageExportMenu(null);

    fireEvent.click(screen.getByRole("button", { name: "Export messages" }));
    fireEvent.click(await screen.findByText("HTML"));

    expect(messenger.warning).toHaveBeenCalledWith(
      "Select a session before exporting.",
    );
    expect(listSessionMessagesMock).not.toHaveBeenCalled();
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
