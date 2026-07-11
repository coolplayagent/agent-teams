import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "../features/timeline/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("keeps the markdown container mounted when a stream settles", () => {
    const { container, rerender } = render(
      <MarkdownMessage streamingPlain text="Live **answer**" />,
    );
    const liveContainer = container.querySelector(".at-message-markdown");
    expect(liveContainer).not.toBeNull();
    liveContainer?.setAttribute("data-stability-probe", "preserved");

    rerender(<MarkdownMessage text="Live **answer**" />);

    const settledContainer = container.querySelector(".at-message-markdown");
    expect(settledContainer).toBe(liveContainer);
    expect(settledContainer).toHaveAttribute(
      "data-stability-probe",
      "preserved",
    );
    expect(settledContainer?.querySelector("strong")).toHaveTextContent(
      "answer",
    );
  });
});
