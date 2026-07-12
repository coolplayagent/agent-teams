import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToolCallDetails } from "../features/timeline/ToolCallDetails";
import { useTranslations } from "../i18n";

describe("ToolCallDetails", () => {
  it("separates input and output, formats common lists, and confirms copied values locally", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ToolDetailsHarness />);

    expect(screen.getByText("Input")).toBeVisible();
    expect(screen.getByText("Output")).toBeVisible();
    expect(screen.getByText(/frontend\/app\/src/)).toBeVisible();
    expect(screen.getByText(/- MessageTimeline\.tsx/)).toBeVisible();
    expect(screen.getByText(/- ToolCallDetails\.tsx/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy call id" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("call-123"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();

    fireEvent.click(screen.getByText("Raw details"));
    fireEvent.click(screen.getByRole("button", { name: "Copy raw details" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("raw tool payload"));
    expect(screen.getAllByRole("button", { name: "Copied" })).toHaveLength(2);
  });

  it("keeps clipboard failures next to the tool detail action", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(<ToolDetailsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Copy call id" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeVisible();
  });
});

function ToolDetailsHarness() {
  const t = useTranslations();
  return (
    <ToolCallDetails
      callId="call-123"
      error={false}
      input={'{"path":"frontend/app/src"}'}
      output={'{"entries":["MessageTimeline.tsx","ToolCallDetails.tsx"]}'}
      raw="raw tool payload"
      t={t}
      toolName="list_directory"
    />
  );
}
