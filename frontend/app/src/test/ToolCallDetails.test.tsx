import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("renders complete input and output in scroll regions without nested disclosure controls", () => {
    const longInput = Array.from(
      { length: 30 },
      (_, index) => `input-line-${index + 1}`,
    ).join("\n");
    const longOutput = Array.from(
      { length: 30 },
      (_, index) => `output-line-${index + 1}`,
    ).join("\n");

    const { container } = render(
      <LongToolDetailsHarness input={longInput} output={longOutput} />,
    );
    const { getByRole, queryByRole } = within(container);

    const input = getByRole("region", { name: "Input" });
    const output = getByRole("region", { name: "Output" });
    expect(input).toHaveTextContent("input-line-1");
    expect(input).toHaveTextContent("input-line-30");
    expect(output).toHaveTextContent("output-line-1");
    expect(output).toHaveTextContent("output-line-30");
    expect(input).toHaveClass("at-tool-detail-content", "at-scroll-region");
    expect(output).toHaveClass("at-tool-detail-content", "at-scroll-region");
    expect(queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: "Show less" })).not.toBeInTheDocument();
  });
});

function LongToolDetailsHarness({ input, output }: { input: string; output: string }) {
  const t = useTranslations();
  return (
    <ToolCallDetails
      callId="call-long"
      error={false}
      input={input}
      output={output}
      raw=""
      t={t}
      toolName="shell"
    />
  );
}

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
