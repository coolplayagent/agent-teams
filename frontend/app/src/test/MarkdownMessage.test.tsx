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

  it("renders every streaming delta immediately in the existing markdown tree", () => {
    const { container, rerender } = render(
      <MarkdownMessage streaming text="chunk 1" />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");
    const liveParagraph = markdownContainer?.querySelector("p");

    rerender(<MarkdownMessage streaming text="chunk 1 chunk 2" />);
    rerender(<MarkdownMessage streaming text="chunk 1 chunk 2 chunk 3" />);

    expect(markdownContainer?.querySelector("p")).toBe(liveParagraph);
    expect(markdownContainer).toHaveTextContent("chunk 1 chunk 2 chunk 3");
    expect(container.querySelector(".at-message-streaming-tail")).toBeNull();
    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
  });

  it("preserves the live markdown DOM when the same text reaches terminal state", () => {
    const { container, rerender } = render(
      <MarkdownMessage streaming text="complete **answer**" />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");
    const liveParagraph = markdownContainer?.querySelector("p");
    const liveStrong = markdownContainer?.querySelector("strong");

    rerender(<MarkdownMessage text="complete **answer**" />);

    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
    expect(container.querySelector("p")).toBe(liveParagraph);
    expect(container.querySelector("strong")).toBe(liveStrong);
    expect(container.querySelector(".at-message-markdown")).not.toHaveAttribute(
      "data-streaming",
    );
  });

  it("keeps code block containers mounted while terminal highlighting activates", () => {
    const code = "```typescript\nconst answer = 42;\n```";
    const { container, rerender } = render(
      <MarkdownMessage streaming text={code} />,
    );
    const livePre = container.querySelector("pre");
    const liveCode = container.querySelector("code");

    rerender(<MarkdownMessage text={code} />);

    expect(container.querySelector("pre")).toBe(livePre);
    expect(container.querySelector("code")).toBe(liveCode);
    expect(liveCode).toHaveClass("hljs");
  });

  it("keeps completed markdown blocks mounted while later blocks grow", () => {
    const { container, rerender } = render(
      <MarkdownMessage streaming text={"Stable first block.\n\nSecond"} />,
    );
    const firstParagraph = container.querySelectorAll("p")[0];

    rerender(
      <MarkdownMessage
        streaming
        text={"Stable first block.\n\nSecond block receives **more** text."}
      />,
    );

    expect(container.querySelectorAll("p")[0]).toBe(firstParagraph);
    expect(container.querySelectorAll("p")[1]).toHaveTextContent(
      "Second block receives more text.",
    );
  });

  it("keeps a single plain-text node mounted across live thinking increments", () => {
    const { container, rerender } = render(
      <MarkdownMessage
        streaming
        streamingPresentation="plain"
        text="Inspecting the runtime"
      />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");
    const liveText = container.querySelector(".at-message-streaming-plain");

    rerender(
      <MarkdownMessage
        streaming
        streamingPresentation="plain"
        text="Inspecting the runtime state **without reparsing**"
      />,
    );
    expect(container.querySelector(".at-message-markdown")).toBe(
      markdownContainer,
    );
    expect(container.querySelector(".at-message-streaming-plain")).toBe(
      liveText,
    );
    expect(liveText).toHaveTextContent(
      "Inspecting the runtime state **without reparsing**",
    );
    expect(container.querySelector(".at-message-streaming-tail")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
  });

  it("renders a large delta synchronously without a timer-backed staging node", () => {
    const firstText = `# Result\n\n${"A".repeat(80_000)}`;
    const secondText = `${firstText} visible-now`;
    const { container, rerender } = render(
      <MarkdownMessage streaming text={firstText} />,
    );

    rerender(<MarkdownMessage streaming text={secondText} />);

    expect(container).toHaveTextContent("visible-now");
    expect(container.querySelector(".at-message-streaming-tail")).toBeNull();
  });
});
