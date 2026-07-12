import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MarkdownMessage,
  streamingMarkdownInterval,
} from "../features/timeline/MarkdownMessage";

afterEach(() => {
  vi.useRealTimers();
});

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

  it("coalesces rapid streaming text without starving the latest update", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <MarkdownMessage streaming text="chunk 1" />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");

    rerender(<MarkdownMessage streaming text="chunk 1 chunk 2" />);
    rerender(<MarkdownMessage streaming text="chunk 1 chunk 2 chunk 3" />);

    expect(markdownContainer).toHaveTextContent("chunk 1");
    act(() => vi.advanceTimersByTime(streamingMarkdownInterval(21)));
    expect(markdownContainer).toHaveTextContent("chunk 1 chunk 2 chunk 3");
    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
  });

  it("renders exact terminal markdown immediately without waiting for a live buffer", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <MarkdownMessage streaming text="partial" />,
    );
    rerender(<MarkdownMessage streaming text="partial **queued**" />);
    expect(container.querySelector("strong")).toBeNull();

    rerender(<MarkdownMessage text="complete **answer**" />);

    expect(container.querySelector("strong")).toHaveTextContent("answer");
    expect(container.querySelector(".at-message-markdown")).not.toHaveAttribute(
      "data-stream-buffered",
    );
  });

  it("keeps even very large streams below the one-second feedback budget", () => {
    expect(streamingMarkdownInterval(2_000)).toBe(80);
    expect(streamingMarkdownInterval(8_000)).toBe(180);
    expect(streamingMarkdownInterval(80_000)).toBe(400);
  });
});
