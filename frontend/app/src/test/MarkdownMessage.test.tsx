import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "../features/timeline/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("keeps the markdown tree and container mounted when a stream settles", () => {
    const { container, rerender } = render(
      <MarkdownMessage text="Live **answer**" />,
    );
    const liveContainer = container.querySelector(".at-message-markdown");
    const liveParagraph = liveContainer?.querySelector("p");
    expect(liveContainer).not.toBeNull();
    expect(liveParagraph).not.toBeNull();
    liveContainer?.setAttribute("data-stability-probe", "preserved");

    rerender(<MarkdownMessage text="Live **answer**" />);

    const settledContainer = container.querySelector(".at-message-markdown");
    expect(settledContainer).toBe(liveContainer);
    expect(settledContainer).toHaveAttribute(
      "data-stability-probe",
      "preserved",
    );
    expect(settledContainer?.querySelector("p")).toBe(liveParagraph);
    expect(settledContainer?.querySelector("strong")).toHaveTextContent(
      "answer",
    );
  });

  it("uses terminal markdown soft-break semantics while text is incremental", () => {
    const { container, rerender } = render(
      <MarkdownMessage text={"LINE_001\nLINE_002"} />,
    );
    const liveParagraph = container.querySelector(".at-message-markdown > p");
    expect(liveParagraph).toHaveTextContent("LINE_001 LINE_002");
    expect(container.querySelectorAll(".at-message-markdown > p")).toHaveLength(1);

    rerender(<MarkdownMessage text={"LINE_001\nLINE_002\nLINE_003"} />);

    expect(container.querySelector(".at-message-markdown > p")).toBe(liveParagraph);
    expect(container.querySelectorAll(".at-message-markdown > p")).toHaveLength(1);
  });
});
